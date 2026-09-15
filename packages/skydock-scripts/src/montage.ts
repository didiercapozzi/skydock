import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import { z } from 'zod'

const montageClipSchema = z.object({
  path: z.string(),
  cropStart: z.number().nullable().optional(),
  cropEnd: z.number().nullable().optional()
})

const montageOptionsSchema = z.object({
  groupDir: z.string(),
  baseName: z.string(),
  title: z.string(),
  clips: z.array(montageClipSchema),
  templatePath: z.string().optional(),
  videoTrackId: z.string().default('playlist4')
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

const timecode = (seconds: number) => {
  const total = Math.max(0, seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total - hours * 3600 - minutes * 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${rest.toFixed(3).padStart(6, '0')}`
}

const defaultTemplatePath = () =>
  path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '..',
    '..',
    '..',
    'templates',
    'tandem.kdenlive'
  )

const resolveTemplate = (templatePath: string | undefined, groupDir: string) => {
  const candidates = [
    templatePath,
    process.env.SKYDOCK_MONTAGE_TEMPLATE,
    path.join(groupDir, '..', '..', 'montage-template.kdenlive'),
    defaultTemplatePath()
  ].filter((c): c is string => !!c)
  return candidates.find((c) => fs.existsSync(c)) ?? null
}

const clipEntryAttributes = (clip: MontageClip, producerId: string) => {
  const attributes: Record<string, string> = { '@_producer': producerId }
  if (clip.cropStart != null && clip.cropEnd != null) {
    attributes['@_in'] = timecode(clip.cropStart)
    attributes['@_out'] = timecode(clip.cropEnd)
  }
  return attributes
}

const createMontageProject = (rawOptions: MontageOptions) => {
  const options = montageOptionsSchema.parse(rawOptions)
  const template = resolveTemplate(options.templatePath, options.groupDir)
  if (!template) throw new Error('No kdenlive template found — set SKYDOCK_MONTAGE_TEMPLATE')

  const document = new XMLParser(XML_OPTIONS).parse(fs.readFileSync(template, 'utf-8')) as XmlNode[]
  const mltNode = document.find((n) => tagOf(n) === 'mlt')
  if (!mltNode) throw new Error(`Template is not an MLT document: ${template}`)
  const mlt = childrenOf(mltNode)
  const templateRoot = attrsOf(mltNode)['@_root'] ?? path.dirname(template)

  /* the template's own music, logo and title files keep working from the new folder */
  for (const node of mlt) {
    if (tagOf(node) !== 'chain' && tagOf(node) !== 'producer') continue
    const resource = textOf(propOf(node, 'resource'))
    if (!resource || path.isAbsolute(resource) || resource.startsWith('0x') || resource === 'black')
      continue
    setProp(node, 'resource', path.resolve(templateRoot, resource))
  }
  attrsOf(mltNode)['@_root'] = options.groupDir
  attrsOf(mltNode)['@_title'] = options.title

  const bin = nodeById(mlt, 'playlist', 'main_bin')
  const track = nodeById(mlt, 'playlist', options.videoTrackId)
  if (!bin || !track) throw new Error(`Template has no ${options.videoTrackId} track or main_bin`)

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
        { property: [{ '#text': clip.path }], ':@': { '@_name': 'resource' } },
        { property: [{ '#text': 'avformat' }], ':@': { '@_name': 'mlt_service' } },
        { property: [{ '#text': '1' }], ':@': { '@_name': 'seekable' } },
        {
          property: [{ '#text': path.basename(clip.path) }],
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
      ':@': clipEntryAttributes(clip, producerId)
    })
  })

  /* a project of its own, so kdenlive never shares the template's cache */
  const uuid = `{${randomUUID()}}`
  const sequence = mlt.find(
    (n) => tagOf(n) === 'tractor' && textOf(propOf(n, 'kdenlive:uuid')) !== ''
  )
  if (sequence) {
    setProp(sequence, 'kdenlive:uuid', uuid)
    setProp(sequence, 'kdenlive:sequenceproperties.documentuuid', uuid)
  }
  setProp(bin, 'kdenlive:docproperties.documentid', String(Date.now()))
  setProp(bin, 'kdenlive:docproperties.uuid', uuid)
  setProp(bin, 'kdenlive:docproperties.activetimeline', uuid)
  setProp(bin, 'kdenlive:docproperties.opensequences', uuid)

  /* melt and kdenlive_render read the destination from the consumer when no --output is given */
  const filmPath = path.join(options.groupDir, `${options.baseName}.mp4`)
  mlt.push({
    consumer: [],
    ':@': {
      '@_mlt_service': 'avformat',
      '@_target': filmPath,
      '@_f': 'mp4',
      '@_vcodec': 'libx264',
      '@_crf': '20',
      '@_acodec': 'aac',
      '@_ab': '192k'
    }
  })

  const xml = `<?xml version='1.0' encoding='utf-8'?>\n${new XMLBuilder({ ...XML_OPTIONS, format: true, suppressEmptyNode: true }).build(document)}`
  const projectPath = path.join(options.groupDir, `${options.baseName}.kdenlive`)
  fs.mkdirSync(options.groupDir, { recursive: true })
  fs.writeFileSync(projectPath, xml, 'utf-8')
  return { projectPath, filmPath, template, clips: options.clips.length }
}

export { createMontageProject, montageOptionsSchema }
export type { MontageClip, MontageOptions }
