import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser'
import { z } from 'zod'
import { toHostPath } from './hostPath'
import { walkFiles } from './lib/fs'

/* `proxy` is the small copy of this same clip, cut the same way. When there is one the editor opens
   on it instead of transcoding the clip itself, which is the longest wait before an edit can start;
   it swaps back to `path` on its own to render. */
const montageClipSchema = z.object({ path: z.string(), proxy: z.string().optional() })

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

/* kdenlive projects are MLT XML. Entities must be left alone: the title clips carry
   escaped XML inside a property, and re-encoding them destroys the titles. */
const XML_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  parseTagValue: false,
  trimValues: false,
  processEntities: false
} as const

const RENDER_PROFILE = 'MP4-H264/AAC'

const RENDER_CATEGORY = 'generic'

type XmlNode = Record<string, unknown>

const tagOf = (node: XmlNode) => Object.keys(node).find((k) => k !== ':@') ?? ''
const childrenOf = (node: XmlNode) => {
  const value = node[tagOf(node)]
  return Array.isArray(value) ? (value as XmlNode[]) : []
}
const attrsOf = (node: XmlNode) => (node[':@'] ?? {}) as Record<string, string>
const propsOf = (node: XmlNode) => childrenOf(node).filter((c) => tagOf(c) === 'property')
const propOf = (node: XmlNode, name: string) =>
  propsOf(node).find((p) => attrsOf(p)['@_name'] === name)
const textOf = (node: XmlNode | undefined) => {
  if (!node) return ''
  const first = childrenOf(node)[0] as { '#text'?: string } | undefined
  return first?.['#text'] ?? ''
}
const setProp = (node: XmlNode, name: string, value: string) => {
  const existing = propOf(node, name)
  if (existing) existing[tagOf(existing)] = [{ '#text': value }]
  else childrenOf(node).push({ property: [{ '#text': value }], ':@': { '@_name': name } })
}
const nodeById = (nodes: XmlNode[], tag: string, id: string) =>
  nodes.find((n) => tagOf(n) === tag && attrsOf(n)['@_id'] === id)
const tracksOf = (node: XmlNode) => childrenOf(node).filter((c) => tagOf(c) === 'track')

const XML_ENTITIES: [string, string][] = [
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&apos;', "'"]
]

const decodeXml = (value: string) =>
  XML_ENTITIES.reduce((out, [entity, char]) => out.split(entity).join(char), value)

/* `&` first, so the ampersands the other entities introduce are not escaped twice */
const encodeXml = (value: string) =>
  XML_ENTITIES.reduce((out, [entity, char]) => out.split(char).join(entity), value)

const repoTemplateDir = () =>
  path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'templates')

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

/* Chosen, or the only one there — never the first of several, because picking a template silently
   is picking someone's branding silently. */
const resolveTemplate = (options: z.infer<typeof montageOptionsSchema>) => {
  if (options.templatePath) return options.templatePath
  const available = listMontageTemplates(options.outputDir)
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
  /* The one that ships with SkyDock, found the same way rather than by a name written in here — a
     template is replaced by dropping a different one in beside it, and a name in the code would
     quietly keep using the old one. Several there is as ambiguous as several in the output folder. */
  const bundled = templatesIn(repoTemplateDir())
  if (bundled.length === 1) return bundled[0].path
  if (bundled.length > 1)
    throw new Error(`Choose a montage template: ${bundled.map((t) => t.name).join(', ')}`)
  throw new Error(`No montage template found — add one under ${options.outputDir}/templates`)
}

/* kdenlive marks an audio track with `kdenlive:audio_track`, and only that. The `hide` attribute
   cannot stand in for it: a muted, hidden audio track and a hidden video track both read
   `hide="both"`, and mistaking one for the other drops the whole jump onto the titles track. */
const isAudioTrack = (tractor: XmlNode) => textOf(propOf(tractor, 'kdenlive:audio_track')) === '1'

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

const createMontageProject = (rawOptions: MontageOptions) => {
  const options = montageOptionsSchema.parse(rawOptions)
  const template = resolveTemplate(options)
  /* Entity processing is off for the whole document — it has to be, or the title clips are
     destroyed — so nothing escapes what goes in. Every path written into the project goes through
     here, translated for the machine the editor runs on and escaped in one step, so a new value
     cannot be added without both. */
  const toHost = (target: string) => encodeXml(toHostPath(target, options.outputDir))

  const document = new XMLParser(XML_OPTIONS).parse(fs.readFileSync(template, 'utf-8')) as XmlNode[]
  const mltNode = document.find((n) => tagOf(n) === 'mlt')
  if (!mltNode) throw new Error(`Template is not an MLT document: ${template}`)
  const mlt = childrenOf(mltNode)

  /* the root recorded in the template points at the machine it was made on, which is not
     necessarily a directory this one has — the template's own folder is what always exists */
  const recordedRoot = attrsOf(mltNode)['@_root']
  const templateRoot =
    recordedRoot && fs.existsSync(recordedRoot) ? recordedRoot : path.dirname(template)

  /* A template carries the machine it was made on in its asset paths, and gets copied to another
     one. Anything still missing is looked up by name inside the template's own folder, which is
     where a template keeps what it needs. */
  const templateDir = path.dirname(template)
  const byName = new Map(
    (fs.existsSync(templateDir) ? walkFiles(templateDir) : []).map((f) => [path.basename(f), f])
  )
  /* Entities are left alone everywhere else in the document, so a path arrives here exactly as the
     XML spells it — and one of the template's own music tracks has an `&` in its name. Looking that
     up on disk as `&amp;` finds nothing, so it is decoded to ask the filesystem and encoded again
     to go back into the document. */
  /* A template that arrives without the music, logos and title files it uses still produces a
     project — one that opens with silence and holes in it, which nobody notices until the render.
     What could not be found is collected and reported rather than passed over. */
  const missingAssets: string[] = []
  const relocate = (asset: string) => {
    const decoded = decodeXml(asset)
    const resolved = path.resolve(templateRoot, decoded)
    if (fs.existsSync(resolved)) return toHost(resolved)
    const named = byName.get(path.basename(decoded))
    if (named) return toHost(named)
    missingAssets.push(decoded)
    return toHost(resolved)
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
          /content url="([^"]+)"/g,
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

  options.clips.forEach((clip, index) => {
    const producerId = `chain_skydock_${index}`
    const kdenliveId = nextId++
    mlt.splice(firstPlaylist + index, 0, {
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
      ':@': { '@_id': producerId }
    })
    childrenOf(bin).push({ entry: [], ':@': { '@_producer': producerId } })
    childrenOf(track).push({
      entry: [{ property: [{ '#text': String(kdenliveId) }], ':@': { '@_name': 'kdenlive:id' } }],
      ':@': { '@_producer': producerId }
    })
  })

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
  const built = new XMLBuilder({
    ...XML_OPTIONS,
    format: true,
    suppressEmptyNode: true
  }).build(document) as string
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
    missingAssets: [...new Set(missingAssets)]
  }
}

export { createMontageProject, listMontageTemplates, montageOptionsSchema }
export type { MontageClip, MontageOptions }
