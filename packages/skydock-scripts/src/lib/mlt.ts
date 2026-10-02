/* An MLT document, read and written the way kdenlive leaves it. A kdenlive project is MLT XML and
   nothing here knows any more than that: what a tag is, what a property says, how long a playlist
   runs, which track is an audio one. What is made of all that — where a jump goes, where a title
   belongs — is the montage's business, in the modules beside this one.

   Entities must be left alone: the title clips carry escaped XML inside a property, and re-encoding
   them destroys the titles. So they are decoded and encoded by hand, at the edges, where a value
   meets the filesystem. */

import { z } from 'zod'

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

/* An XML node as the parser hands it back with the order preserved: one key is the tag, holding the
   children in order, `:@` holds the attributes, and a text node is `#text`. The shape is recursive,
   which is the one place a type has to be written down beside its schema. */
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
/* the node's own attribute record, so that writing to it writes into the document */
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

/* `&` first, so the ampersands the other entities introduce are not escaped twice */
const encodeXml = (value: string) =>
  XML_ENTITIES.reduce((out, [entity, char]) => out.split(char).join(entity), value)

/* The frames per second the project runs at, off its profile — every position in the timeline is
   counted in these. */
const fpsOf = (mlt: XmlNode[]) => {
  const profile = mlt.find((n) => tagOf(n) === 'profile')
  const num = Number(profile ? attrsOf(profile)['@_frame_rate_num'] : NaN)
  const den = Number(profile ? attrsOf(profile)['@_frame_rate_den'] : NaN)
  return num > 0 && den > 0 ? num / den : 25
}

/* What a title clip names, inside the escaped XML it keeps in a property of its own. A title's
   `resource` is empty, so nothing that reads resources alone ever reaches its images. */
const TITLE_IMAGE = /content url="([^"]+)"/g

/* Not every resource is a file: a colour is written `0x000000ff`, the empty clip is `black`, and a
   producer may name nothing at all. */
const isAssetPath = (resource: string) =>
  resource !== '' && resource !== 'black' && !resource.startsWith('0x')

/* Every file the document names, each handed to `say` — what a clip plays, what the music is, and
   the images inside the titles. Answering with a string writes it back in that file's place;
   answering null leaves it as it was.
 *
 * Values are handed over decoded and taken back decoded: the entities belong to the document, and
 * re-encoding a title's escaped XML by hand is what destroys the titles. Reading every file a
 * project names, moving a template's files to where they now are, and pointing a brought-in
 * template at the copies that came with it are all this same walk. */
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

/* The same walk, asking nothing of them: every file the document names, as it spells them. */
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
