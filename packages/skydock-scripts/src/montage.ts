import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import { randomUUID } from 'node:crypto'
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser'
import { z } from 'zod'
import { toHostPath } from './hostPath'
import {
  assetsIn,
  attrsOf,
  childrenOf,
  encodeXml,
  fpsOf,
  nodeById,
  propOf,
  setProp,
  tagOf,
  textOf,
  walkAssets,
  xmlDocumentSchema,
  XML_OPTIONS
} from './lib/mlt'
import type { XmlNode } from './lib/mlt'
import { walkFiles } from './lib/fs'
import { marksFor } from './montageMarks'
import { jumpMomentsSchema } from './types'

/* `proxy` is the small copy of this same clip, cut the same way. When there is one the editor opens
   on it instead of transcoding the clip itself, which is the longest wait before an edit can start;
   it swaps back to `path` on its own to render. */
const montageClipSchema = z.object({
  path: z.string(),
  proxy: z.string().optional(),
  /* how long it lasts, when known already; otherwise it is read off the file */
  seconds: z.number().optional(),
  /* Where the jump is in this clip, and how much was trimmed off its front when the copy was made:
     the moments are seconds into the clip as it was shot, and what the timeline holds is the copy,
     so the two travel together or neither means anything. */
  moments: jumpMomentsSchema.nullable().optional(),
  cropStart: z.number().nullable().optional()
})

const montageOptionsSchema = z.object({
  groupDir: z.string(),
  outputDir: z.string(),
  baseName: z.string(),
  title: z.string(),
  clips: z.array(montageClipSchema),
  /* Stills for the bin, beside the clips. A montage whose camera caught no video is still a film
     somebody makes — of its photos — and these are what it is made of. */
  photos: z.array(z.string()).default([]),
  /* a template folder's name, or a path straight to one — both only ever chosen, never guessed */
  template: z.string().optional(),
  templatePath: z.string().optional()
})

/* how long kdenlive makes a still it is given, in seconds, before anyone stretches it */
const PHOTO_SECONDS = 5

type MontageClip = z.infer<typeof montageClipSchema>
type MontageOptions = z.input<typeof montageOptionsSchema>

/* The film is rendered as an ordinary MP4 — H.264 video, AAC sound — which plays everywhere it is
   sent, and which every machine's editor can make, with no graphics card asked for. It is
   kdenlive's own preset, found by its name; no category is written beside it, since the editor
   finds a preset by name and a category guessed wrong would only send it looking in the wrong list. */
const RENDER_PROFILE = 'MP4-H264/AAC'

/* The templates the app itself carries, as against the ones a dropzone brings in. The installed app
   says where they are, since a packaged bundle is one file and has no folder of its own to count
   from; run from the repo, they sit beside the code. */
const repoTemplateDir = () => {
  const told = process.env.SKYDOCK_TEMPLATES_DIR?.trim()
  if (told) return told
  return path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..', '..', 'templates')
}

/* A template is a folder holding its own project and the music, logos and title images it uses, so
   the assets are stored once and referenced, never copied per passenger. A bare `.kdenlive` sitting
   in the folder counts too, for a template that needs nothing beside it. */
const templatesIn = (dir: string) => {
  const kdenliveIn = (folder: string) =>
    fs
      .readdirSync(folder, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.kdenlive'))
      .map((e) => path.join(folder, e.name))
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) => {
        /* what the app keeps here about the templates is not one of them */
        if (entry.name.startsWith('.')) return []
        if (entry.isFile() && entry.name.endsWith('.kdenlive'))
          return [{ name: entry.name.replace(/\.kdenlive$/, ''), path: path.join(dir, entry.name) }]
        if (!entry.isDirectory()) return []
        const found = kdenliveIn(path.join(dir, entry.name))[0]
        return found ? [{ name: entry.name, path: found }] : []
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

const listMontageTemplates = (outputDir: string) => templatesIn(path.join(outputDir, 'templates'))

/* The templates there are to choose from: the ones brought into the output folder, or — while there
   are none — the one that ships with SkyDock, found the same way rather than by a name written in
   here, so replacing it is dropping a different one in beside it. */
const availableTemplates = (outputDir: string) => {
  const own = listMontageTemplates(outputDir)
  return own.length > 0 ? own : templatesIn(repoTemplateDir())
}

/* The one somebody said is the usual, when there is one. Said by a file that names it, kept beside
   the templates themselves: the montage asks them rather than the board, so a montage made from the
   command line follows the same choice as one made by pressing Montage. */
const DEFAULT_MARK = '.default'

const defaultTemplate = (outputDir: string) => {
  try {
    return fs.readFileSync(path.join(outputDir, 'templates', DEFAULT_MARK), 'utf-8').trim() || null
  } catch {
    return null
  }
}

/* Chosen, or the usual one, or the only one there — never the first of several, because picking a
   template nobody settled on is picking someone's branding for them. */
const resolveTemplate = (options: z.infer<typeof montageOptionsSchema>) => {
  if (options.templatePath) return options.templatePath
  const available = availableTemplates(options.outputDir)
  if (options.template) {
    const chosen = available.find((t) => t.name === options.template)
    if (!chosen)
      throw new Error(
        `No montage template named ${options.template} in ${options.outputDir}/templates`
      )
    return chosen.path
  }
  const configured = process.env.SKYDOCK_MONTAGE_TEMPLATE
  if (configured && fs.existsSync(configured)) return configured
  const usual = available.find((t) => t.name === defaultTemplate(options.outputDir))
  if (usual) return usual.path
  if (available.length === 1) return available[0].path
  if (available.length > 1)
    throw new Error(`Choose a montage template: ${available.map((t) => t.name).join(', ')}`)
  throw new Error(`No montage template found — add one under ${options.outputDir}/templates`)
}

/* Where one of those files is on this machine, or null. A template carries the machine it was made
   on in its paths and gets copied to another: the root it recorded is used when it exists here, the
   template's own folder otherwise, and anything still not found is looked up by name inside that
   folder, which is where a template keeps what it needs. */
const assetLocator = (template: string, mltNode: XmlNode) => {
  const recordedRoot = attrsOf(mltNode)['@_root']
  const templateDir = path.dirname(template)
  const root = recordedRoot && fs.existsSync(recordedRoot) ? recordedRoot : templateDir
  const byName = new Map(
    (fs.existsSync(templateDir) ? walkFiles(templateDir) : []).map((f) => [path.basename(f), f])
  )
  return (asset: string) => {
    const resolved = path.resolve(root, asset)
    return {
      resolved,
      found: fs.existsSync(resolved) ? resolved : (byName.get(path.basename(asset)) ?? null)
    }
  }
}

const readTemplate = (template: string) => {
  const document = xmlDocumentSchema.parse(
    new XMLParser(XML_OPTIONS).parse(fs.readFileSync(template, 'utf-8'))
  )
  const mltNode = document.find((n) => tagOf(n) === 'mlt')
  if (!mltNode) throw new Error(`Template is not an MLT document: ${template}`)
  return { document, mltNode, mlt: childrenOf(mltNode) }
}

/* What a template is, read without making anything of it: which kdenlive wrote it, and every file
   it names with whether that file is here. Asked when a template is brought in and when one is
   offered, so a template with holes in it is known about before an edit is started on it. */
const inspectTemplate = (template: string) => {
  const { mltNode, mlt } = readTemplate(template)
  const locate = assetLocator(template, mltNode)
  const bin = nodeById(mlt, 'playlist', 'main_bin')
  const version = bin ? textOf(propOf(bin, 'kdenlive:docproperties.kdenliveversion')) : ''
  const assets = [...new Set(assetsIn(mlt))].map((asset) => ({
    name: path.basename(asset),
    found: locate(asset).found !== null
  }))
  return {
    version: version || null,
    assets,
    missing: assets.filter((a) => !a.found).map((a) => a.name)
  }
}

const createMontageProject = (rawOptions: MontageOptions) => {
  const options = montageOptionsSchema.parse(rawOptions)
  const template = resolveTemplate(options)
  /* Entity processing is off for the whole document — it has to be, or the title clips are
     destroyed — so nothing escapes what goes in. Every path written into the project goes through
     here, translated for the machine the editor runs on and escaped in one step, so a new value
     cannot be added without both. */
  const toHost = (target: string) => encodeXml(toHostPath(target, options.outputDir))

  const { document, mltNode, mlt } = readTemplate(template)
  const locate = assetLocator(template, mltNode)

  /* A template that arrives without the music, logos and title files it uses still produces a
     project — one that opens with silence and holes in it, which nobody notices until the render.
     What could not be found is collected and reported rather than passed over.

     Entities are left alone everywhere else in the document, so a path arrives here exactly as the
     XML spells it — and one of the template's own music tracks has an `&` in its name. Looking that
     up on disk as `&amp;` finds nothing, so it is decoded to ask the filesystem and encoded again
     to go back into the document. */
  /* the template's own music, logo and title files keep working from the new folder — the images
     inside a title among them, which is the walk's business rather than this one's */
  const missingAssets: string[] = []
  walkAssets(mlt, (asset) => {
    const { resolved, found } = locate(asset)
    if (!found) missingAssets.push(asset)
    return toHostPath(found ?? resolved, options.outputDir)
  })
  attrsOf(mltNode)['@_root'] = toHost(options.groupDir)
  attrsOf(mltNode)['@_title'] = encodeXml(options.title)

  const bin = nodeById(mlt, 'playlist', 'main_bin')
  if (!bin) throw new Error(`Template has no main_bin: ${template}`)
  const sequence = mlt.find(
    (n) => tagOf(n) === 'tractor' && textOf(propOf(n, 'kdenlive:uuid')) !== ''
  )
  if (!sequence) throw new Error(`Template has no sequence: ${template}`)

  const usedIds = mlt
    .map((n) => Number(textOf(propOf(n, 'kdenlive:id'))))
    .filter((n) => Number.isFinite(n))
  const firstId = Math.max(0, ...usedIds) + 1
  const fps = fpsOf(mlt)

  /* the clip as the bin holds it */
  const chainOf = (clip: MontageClip, id: string, kdenliveId: number) => ({
    chain: [
      { property: [{ '#text': 'pause' }], ':@': { '@_name': 'eof' } },
      /* MLT plays whatever `resource` names, so a proxied clip points there and keeps the clip
         itself in `kdenlive:originalurl` — which is how the editor knows what to render from.
         A bare `-` is how a project says this clip has no proxy. */
      {
        property: [{ '#text': toHost(clip.proxy ?? clip.path) }],
        ':@': { '@_name': 'resource' }
      },
      {
        property: [{ '#text': clip.proxy ? toHost(clip.proxy) : '-' }],
        ':@': { '@_name': 'kdenlive:proxy' }
      },
      ...(clip.proxy
        ? [
            {
              property: [{ '#text': toHost(clip.path) }],
              ':@': { '@_name': 'kdenlive:originalurl' }
            }
          ]
        : []),
      { property: [{ '#text': 'avformat' }], ':@': { '@_name': 'mlt_service' } },
      { property: [{ '#text': '1' }], ':@': { '@_name': 'seekable' } },
      {
        property: [{ '#text': encodeXml(path.basename(clip.path)) }],
        ':@': { '@_name': 'kdenlive:clipname' }
      },
      { property: [{ '#text': '0' }], ':@': { '@_name': 'kdenlive:clip_type' } },
      { property: [{ '#text': String(kdenliveId) }], ':@': { '@_name': 'kdenlive:id' } }
    ],
    ':@': { '@_id': id }
  })

  /* A still as the bin holds it — written the way kdenlive writes one itself: read by `qimage`, as
     long as kdenlive makes a still it is given, a clip of kind 2. How long it stays on screen is the
     editor's to stretch or cut on the timeline; this is only where it starts. */
  const stillFrames = Math.round(PHOTO_SECONDS * fps)
  const stillOf = (file: string, id: string, kdenliveId: number) => ({
    producer: [
      { property: [{ '#text': String(stillFrames) }], ':@': { '@_name': 'length' } },
      { property: [{ '#text': 'pause' }], ':@': { '@_name': 'eof' } },
      { property: [{ '#text': toHost(file) }], ':@': { '@_name': 'resource' } },
      { property: [{ '#text': '25' }], ':@': { '@_name': 'ttl' } },
      { property: [{ '#text': '1' }], ':@': { '@_name': 'aspect_ratio' } },
      { property: [{ '#text': '1' }], ':@': { '@_name': 'seekable' } },
      { property: [{ '#text': 'qimage' }], ':@': { '@_name': 'mlt_service' } },
      { property: [{ '#text': '1' }], ':@': { '@_name': 'progressive' } },
      {
        property: [{ '#text': encodeXml(path.basename(file)) }],
        ':@': { '@_name': 'kdenlive:clipname' }
      },
      {
        property: [{ '#text': `00:00:${String(PHOTO_SECONDS).padStart(2, '0')}:00` }],
        ':@': { '@_name': 'kdenlive:duration' }
      },
      { property: [{ '#text': '2' }], ':@': { '@_name': 'kdenlive:clip_type' } },
      { property: [{ '#text': String(kdenliveId) }], ':@': { '@_name': 'kdenlive:id' } }
    ],
    ':@': { '@_id': id, '@_in': '0', '@_out': String(stillFrames - 1) }
  })

  /* The clips go in the project's bin and nowhere else: where each one goes in the film, and on which
     of the template's tracks, is the editor's to decide. A clip with a jump in it
     carries the jump's moments as markers of its own, which come with it onto the timeline and stay
     with it however often it is moved, trimmed or cut. */
  const chains = options.clips.map((clip, index) => {
    const id = `chain_skydock_${index}`
    const chain = chainOf(clip, id, firstId + index)
    /* a moment past the end of the copy is not in it, so its length is said when there are moments
       to place (read by whoever hands the clip over); with no length to go by, none is dropped */
    const seconds = clip.moments ? (clip.seconds ?? null) : null
    const marks = marksFor({
      moments: clip.moments,
      cropStart: clip.cropStart,
      length: seconds === null ? Number.POSITIVE_INFINITY : Math.floor(seconds * fps),
      fps
    })
    if (marks.length > 0) setProp(chain, 'kdenlive:markers', JSON.stringify(marks, null, 4))
    childrenOf(bin).push({ entry: [], ':@': { '@_producer': id } })
    return chain
  })
  /* the stills after the clips, in the order shot, numbered on from them */
  const stills = options.photos.map((file, index) => {
    const id = `producer_skydock_photo_${index}`
    childrenOf(bin).push({ entry: [], ':@': { '@_producer': id } })
    return stillOf(file, id, firstId + options.clips.length + index)
  })
  mlt.splice(
    mlt.findIndex((n) => tagOf(n) === 'playlist'),
    0,
    ...chains,
    ...stills
  )

  /* a project of its own, so kdenlive never shares the template's cache */
  const uuid = `{${randomUUID()}}`
  setProp(sequence, 'kdenlive:uuid', uuid)
  setProp(sequence, 'kdenlive:sequenceproperties.documentuuid', uuid)
  setProp(bin, 'kdenlive:docproperties.documentid', String(Date.now()))
  setProp(bin, 'kdenlive:docproperties.uuid', uuid)
  setProp(bin, 'kdenlive:docproperties.activetimeline', uuid)
  setProp(bin, 'kdenlive:docproperties.opensequences', uuid)

  /* where the film goes, in the only place kdenlive reads it from: its own render settings. The
     dialog then opens on the delivery folder instead of wherever it was last pointed. */
  const filmPath = path.join(options.groupDir, `${options.baseName}.mp4`)
  setProp(bin, 'kdenlive:docproperties.renderurl', toHost(filmPath))
  setProp(bin, 'kdenlive:docproperties.renderprofile', RENDER_PROFILE)

  /* The template's own declaration is preserved through the parse and written back out, so adding
     one here made every project start with two — which is not XML, and is why none of them ever
     opened. One is added only when the template had none. */
  const built = z
    .string()
    .parse(
      new XMLBuilder({ ...XML_OPTIONS, format: true, suppressEmptyNode: true }).build(document)
    )
  const xml = built.startsWith('<?xml') ? built : `<?xml version='1.0' encoding='utf-8'?>\n${built}`

  /* The editor parses this before it does anything else, so a project that is not a document is
     worth nothing. Refusing here names the problem now instead of leaving it to be found in
     kdenlive, with the edit already expected. */
  const verdict = XMLValidator.validate(xml)
  if (verdict !== true)
    throw new Error(
      `The montage came out malformed (${verdict.err.msg} at line ${verdict.err.line}). Nothing was written.`
    )

  const projectPath = path.join(options.groupDir, `${options.baseName}.kdenlive`)
  fs.mkdirSync(options.groupDir, { recursive: true })
  fs.writeFileSync(projectPath, xml, 'utf-8')
  return {
    projectPath,
    filmPath,
    template,
    clips: options.clips.length,
    photos: options.photos.length,
    /* the template's own files it could not find — the project is written anyway, because the edit
       can start without the music, but nobody should have to discover this at the render */
    missingAssets: [...new Set(missingAssets)]
  }
}

export {
  availableTemplates,
  createMontageProject,
  defaultTemplate,
  DEFAULT_MARK,
  inspectTemplate,
  listMontageTemplates,
  readTemplate
}
