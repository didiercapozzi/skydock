import { z } from 'zod'

const XML_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  parseTagValue: false,
  trimValues: false,
  processEntities: false
} as const

type XmlNode = { [key: string]: string | Record<string, string> | XmlNode[] }
const xmlNodeSchema: z.ZodType<XmlNode> = z.lazy(() =>
  z.record(
    z.string(),
    z.union([z.string(), z.record(z.string(), z.string()), z.array(xmlNodeSchema)])
  )
)
const xmlDocumentSchema = z.array(xmlNodeSchema)

const tagOf = (node: XmlNode) => Object.keys(node).find((k) => k !== ':@') ?? ''
const childrenOf = (node: XmlNode) => {
  const value = node[tagOf(node)]
  return Array.isArray(value) ? value : []
}
const attrsOf = (node: XmlNode) => {
  const attrs = node[':@']
  return attrs !== undefined && typeof attrs === 'object' && !Array.isArray(attrs) ? attrs : {}
}
const propsOf = (node: XmlNode) => childrenOf(node).filter((c) => tagOf(c) === 'property')
const propOf = (node: XmlNode, name: string) =>
  propsOf(node).find((p) => attrsOf(p)['@_name'] === name)
const textOf = (node: XmlNode | undefined) => {
  const text = node ? childrenOf(node)[0]?.['#text'] : undefined
  return typeof text === 'string' ? text : ''
}
const setProp = (node: XmlNode, name: string, value: string) => {
  const existing = propOf(node, name)
  if (existing) existing[tagOf(existing)] = [{ '#text': value }]
  else childrenOf(node).push({ property: [{ '#text': value }], ':@': { '@_name': name } })
}
const nodeById = (nodes: XmlNode[], tag: string, id: string) =>
  nodes.find((n) => tagOf(n) === tag && attrsOf(n)['@_id'] === id)

const XML_ENTITIES: [string, string][] = [
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&apos;', "'"]
]

const decodeXml = (value: string) =>
  XML_ENTITIES.reduce((out, [entity, char]) => out.split(entity).join(char), value)

const encodeXml = (value: string) =>
  XML_ENTITIES.reduce((out, [entity, char]) => out.split(char).join(entity), value)

const fpsOf = (mlt: XmlNode[]) => {
  const profile = mlt.find((n) => tagOf(n) === 'profile')
  const num = Number(profile ? attrsOf(profile)['@_frame_rate_num'] : NaN)
  const den = Number(profile ? attrsOf(profile)['@_frame_rate_den'] : NaN)
  return num > 0 && den > 0 ? num / den : 25
}

const TITLE_IMAGE = /content url="([^"]+)"/g

const isAssetPath = (resource: string) =>
  resource !== '' && resource !== 'black' && !resource.startsWith('0x')

const walkAssets = (mlt: XmlNode[], say: (asset: string) => string | null) => {
  for (const node of mlt) {
    if (tagOf(node) !== 'chain' && tagOf(node) !== 'producer') continue
    const resource = textOf(propOf(node, 'resource'))
    if (isAssetPath(resource)) {
      const said = say(decodeXml(resource))
      if (said !== null) setProp(node, 'resource', encodeXml(said))
    }
    const titles = propOf(node, 'xmldata')
    const xmldata = textOf(titles)
    if (!titles || !xmldata.includes('content url=')) continue
    const written = xmldata.replace(TITLE_IMAGE, (whole, named: string) => {
      const said = say(decodeXml(named))
      return said === null ? whole : `content url="${encodeXml(said)}"`
    })
    if (written !== xmldata) setProp(node, 'xmldata', written)
  }
}

const assetsIn = (mlt: XmlNode[]) => {
  const named: string[] = []
  walkAssets(mlt, (asset) => {
    named.push(asset)
    return null
  })
  return named
}

export {
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
}
export type { XmlNode }
