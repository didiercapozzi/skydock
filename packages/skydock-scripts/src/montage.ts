import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import { randomUUID } from 'node:crypto'
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser'
import { z } from 'zod'
import { toHostPath } from './hostPath'
import {
  attrsOf,
  childrenOf,
  decodeXml,
  encodeXml,
  fpsOf,
  framesOf,
  isAudioTrack,
  lengthOf,
  nodeById,
  propOf,
  setProp,
  tagOf,
  textOf,
  timelineTracks,
  tracksOf,
  xmlDocumentSchema,
  XML_OPTIONS
} from './lib/mlt'
import type { XmlNode } from './lib/mlt'
import { walkFiles } from './lib/fs'
import { jsonText } from './lib/json'
import { mediaSeconds } from './lib/media'
import { marksFor } from './montageMarks'
import { fadeToBlack, musicFadeOut } from './montageFilters'
import { followTheFilm, readFurniture } from './montageFurniture'
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
  /* a template folder's name, or a path straight to one — both only ever chosen, never guessed */
  template: z.string().optional(),
  templatePath: z.string().optional(),
  videoTrackId: z.string().optional()
})

type MontageClip = z.infer<typeof montageClipSchema>
type MontageOptions = z.input<typeof montageOptionsSchema>

const RENDER_PROFILE = 'MP4-H264/AAC'

const RENDER_CATEGORY = 'generic'

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

/* Chosen, or the only one there — never the first of several, because picking a template silently
   is picking someone's branding silently. */
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
  if (available.length === 1) return available[0].path
  if (available.length > 1)
    throw new Error(`Choose a montage template: ${available.map((t) => t.name).join(', ')}`)
  throw new Error(`No montage template found — add one under ${options.outputDir}/templates`)
}

/* V1 — the first video track of the timeline, which is where a template keeps its footage and its
   titles sit above. Which playlist that is differs per template, so it is read, not assumed. */
const findVideoTrackId = (mlt: XmlNode[], sequence: XmlNode) => {
  const tractors = tracksOf(sequence).flatMap((track) => {
    const producer = attrsOf(track)['@_producer']
    const node = producer ? nodeById(mlt, 'tractor', producer) : undefined
    return node ? [node] : []
  })
  const video = tractors.find((t) => !isAudioTrack(t))
  if (!video) throw new Error(`Template has ${tractors.length} audio tracks and no video track`)
  const first = tracksOf(video)[0]
  const playlist = first ? attrsOf(first)['@_producer'] : undefined
  if (!playlist) throw new Error('Template video track holds no playlist')
  return playlist
}

/* Every file a template's project names: what its clips and its music play, and the images held
   inside its title clips — those sit in the title's own escaped XML with the clip's resource left
   empty, so they are read out of there. As the project spells them, entities decoded. */
const TITLE_IMAGE = /content url="([^"]+)"/g

const assetsNamedBy = (mlt: XmlNode[]) =>
  mlt.flatMap((node) => {
    if (tagOf(node) !== 'chain' && tagOf(node) !== 'producer') return []
    const resource = textOf(propOf(node, 'resource'))
    const played = resource && !resource.startsWith('0x') && resource !== 'black' ? [resource] : []
    const inTitles = [...textOf(propOf(node, 'xmldata')).matchAll(TITLE_IMAGE)].map((m) => m[1]!)
    return [...played, ...inTitles].map(decodeXml)
  })

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
  const assets = [...new Set(assetsNamedBy(mlt))].map((asset) => ({
    name: path.basename(asset),
    found: locate(asset).found !== null
  }))
  return {
    version: version || null,
    assets,
    missing: assets.filter((a) => !a.found).map((a) => a.name)
  }
}

/* A1 — the audio track right under V1, where a clip's own sound goes, linked to its picture. None
   when the track under V1 is not an audio one. */
const findAudioUnderVideo = (mlt: XmlNode[], sequence: XmlNode, videoTrackId: string) => {
  const tracks = timelineTracks(mlt, sequence)
  const v1 = tracks.findIndex((t) => attrsOf(tracksOf(t)[0] ?? {})['@_producer'] === videoTrackId)
  const under = v1 > 0 ? tracks[v1 - 1] : undefined
  if (!under || !isAudioTrack(under)) return null
  const playlist = attrsOf(tracksOf(under)[0] ?? {})['@_producer']
  const node = playlist ? nodeById(mlt, 'playlist', playlist) : undefined
  return node ? { playlist: node, position: v1 - 1, videoPosition: v1 } : null
}

/* kdenlive keeps its groups as a list of trees; a clip in one is named by track and first frame */
const groupsSchema = jsonText.pipe(z.array(z.unknown()))

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
  const missingAssets: string[] = []
  const relocate = (asset: string) => {
    const decoded = decodeXml(asset)
    const { resolved, found } = locate(decoded)
    if (!found) missingAssets.push(decoded)
    return toHost(found ?? resolved)
  }

  /* the template's own music, logo and title files keep working from the new folder */
  for (const node of mlt) {
    if (tagOf(node) !== 'chain' && tagOf(node) !== 'producer') continue
    const resource = textOf(propOf(node, 'resource'))
    if (resource && !resource.startsWith('0x') && resource !== 'black')
      setProp(node, 'resource', relocate(resource))
    /* A title clip keeps its images inside its own escaped XML, and its resource property is
       empty — so nothing above reaches them. Miss these and the logos quietly vanish from the
       outro of every montage. */
    const titleData = propOf(node, 'xmldata')
    if (titleData)
      setProp(
        node,
        'xmldata',
        textOf(titleData).replace(
          TITLE_IMAGE,
          (_, asset: string) => `content url="${relocate(asset)}"`
        )
      )
  }
  attrsOf(mltNode)['@_root'] = toHost(options.groupDir)
  attrsOf(mltNode)['@_title'] = encodeXml(options.title)

  const bin = nodeById(mlt, 'playlist', 'main_bin')
  if (!bin) throw new Error(`Template has no main_bin: ${template}`)
  const sequence = mlt.find(
    (n) => tagOf(n) === 'tractor' && textOf(propOf(n, 'kdenlive:uuid')) !== ''
  )
  if (!sequence) throw new Error(`Template has no sequence: ${template}`)
  const videoTrackId = options.videoTrackId ?? findVideoTrackId(mlt, sequence)
  const track = nodeById(mlt, 'playlist', videoTrackId)
  if (!track) throw new Error(`Template has no ${videoTrackId} track`)

  const usedIds = mlt
    .map((n) => Number(textOf(propOf(n, 'kdenlive:id'))))
    .filter((n) => Number.isFinite(n))
  let nextId = Math.max(0, ...usedIds) + 1
  const firstPlaylist = mlt.findIndex((n) => tagOf(n) === 'playlist')

  /* Each clip goes on V1 with its own sound on A1 beneath it, the two linked, as kdenlive itself
     leaves a clip whose audio has been restored: moved, cut or deleted together, the sound there to
     be heard the moment A1 is. That needs to know where each clip starts, so how long each lasts;
     a clip whose length cannot be read, or a template with no audio track under V1, puts the clips
     on V1 alone, sound inside. */
  const fps = fpsOf(mlt)
  const a1 = findAudioUnderVideo(mlt, sequence, videoTrackId)
  /* Read while the template is still as it arrived: the track a clip's sound goes on is empty until
     the jump is laid, and a jump's own sound is not the film's music. */
  const furniture = readFurniture(mlt, sequence, videoTrackId, a1?.playlist ?? null)
  const frames = options.clips.map((clip) => {
    const seconds = clip.seconds ?? mediaSeconds(clip.proxy ?? clip.path)
    return seconds === null ? null : Math.max(1, Math.floor(seconds * fps))
  })
  const linked = a1 !== null && frames.every((f) => f !== null)

  /* the clip as the bin holds it, or as one track plays it — picture only, or sound only */
  const chainOf = (
    clip: MontageClip,
    id: string,
    kdenliveId: number,
    plays?: 'picture' | 'sound'
  ) => ({
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
      { property: [{ '#text': String(kdenliveId) }], ':@': { '@_name': 'kdenlive:id' } },
      ...(plays
        ? [
            {
              property: [{ '#text': plays === 'picture' ? '1' : '0' }],
              ':@': { '@_name': 'set.test_audio' }
            },
            {
              property: [{ '#text': plays === 'sound' ? '1' : '0' }],
              ':@': { '@_name': 'set.test_image' }
            }
          ]
        : [])
    ],
    ':@': { '@_id': id }
  })
  const entryOf = (producer: string, kdenliveId: number, length: number | null) => ({
    entry: [{ property: [{ '#text': String(kdenliveId) }], ':@': { '@_name': 'kdenlive:id' } }],
    ':@': {
      '@_producer': producer,
      ...(length === null ? {} : { '@_in': '0', '@_out': String(length - 1) })
    }
  })

  const groups: unknown[] = []
  let at = lengthOf(track, fps)
  if (linked && a1) {
    const gap = at - lengthOf(a1.playlist, fps)
    if (gap > 0) childrenOf(a1.playlist).push({ blank: [], ':@': { '@_length': String(gap) } })
  }
  const chains: XmlNode[] = []
  /* the picture as it was laid, clip by clip, so the film's own end can be found again */
  const laid: { entry: XmlNode; length: number }[] = []
  options.clips.forEach((clip, index) => {
    const producerId = `chain_skydock_${index}`
    const kdenliveId = nextId++
    const length = frames[index] ?? null
    const bare = chainOf(clip, producerId, kdenliveId)
    chains.push(bare)
    childrenOf(bin).push({ entry: [], ':@': { '@_producer': producerId } })
    if (!linked || !a1 || length === null) {
      childrenOf(track).push(entryOf(producerId, kdenliveId, null))
      return
    }
    /* Where the jump is in this clip, marked on the clip and never cut into it: where the film
       changes is the editor's decision, and a marker only says where the door was left. On the clip
       rather than along the timeline, so it travels with the clip however often it is moved. */
    const marks = marksFor({
      moments: clip.moments,
      cropStart: clip.cropStart,
      length,
      fps
    })
    if (marks.length > 0) setProp(bare, 'kdenlive:markers', JSON.stringify(marks, null, 4))
    chains.push(chainOf(clip, `${producerId}_picture`, kdenliveId, 'picture'))
    chains.push(chainOf(clip, `${producerId}_sound`, kdenliveId, 'sound'))
    const shown = entryOf(`${producerId}_picture`, kdenliveId, length)
    laid.push({ entry: shown, length })
    childrenOf(track).push(shown)
    childrenOf(a1.playlist).push(entryOf(`${producerId}_sound`, kdenliveId, length))
    groups.push({
      children: [
        { data: `${a1.position}:${at}`, leaf: 'clip', type: 'Leaf' },
        { data: `${a1.videoPosition}:${at}`, leaf: 'clip', type: 'Leaf' }
      ],
      type: 'AVSplit'
    })
    at += length
  })
  mlt.splice(firstPlaylist, 0, ...chains)
  /* the film is as long as the footage, and the template's ends follow it there */
  const filmEnd = lengthOf(track, fps)
  const repositioned = followTheFilm(furniture, filmEnd, fps)

  /* Out of black into the first frame, into black out of the last, and the music quiet where it
     ends. The same on every film, which is why it is not left to be done by hand each time. */
  /* The film's opening is never touched: whatever comes first is the first thing anybody sees, and
     a picture fading up from black is a choice about the film, not a fact about the footage. The
     closing is taken down only where the footage is the last thing — a template with an end card
     after it has made that choice already, and its card comes out of black on its own. */
  const closesTheFilm = furniture.titles ? lengthOf(furniture.titles, fps) <= filmEnd : true
  const last = laid[laid.length - 1]
  if (last && closesTheFilm)
    childrenOf(last.entry).push(
      fadeToBlack('filter_skydock_out', { in: 0, out: last.length - 1 }, fps)
    )
  const heard = furniture.music
    ? childrenOf(furniture.music).filter((c) => tagOf(c) === 'entry')
    : []
  const ends = heard[heard.length - 1]
  if (ends)
    childrenOf(ends).push(
      musicFadeOut(
        'filter_skydock_music',
        {
          in: framesOf(attrsOf(ends)['@_in'], fps),
          out: framesOf(attrsOf(ends)['@_out'], fps)
        },
        fps
      )
    )
  if (groups.length > 0) {
    const kept = groupsSchema.safeParse(
      textOf(propOf(sequence, 'kdenlive:sequenceproperties.groups'))
    )
    setProp(
      sequence,
      'kdenlive:sequenceproperties.groups',
      JSON.stringify([...(kept.success ? kept.data : []), ...groups], null, 4)
    )
  }

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
  setProp(bin, 'kdenlive:docproperties.rendercategory', RENDER_CATEGORY)

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
    videoTrackId,
    clips: options.clips.length,
    /* the template's own files it could not find — the project is written anyway, because the edit
       can start without the music, but nobody should have to discover this at the render */
    missingAssets: [...new Set(missingAssets)],
    repositioned
  }
}

export {
  availableTemplates,
  createMontageProject,
  inspectTemplate,
  listMontageTemplates,
  montageOptionsSchema
}
export type { MontageClip, MontageOptions }
