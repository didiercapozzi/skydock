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

/* kdenlive marks an audio track with `kdenlive:audio_track`, and only that. The `hide` attribute
   cannot stand in for it: a muted, hidden audio track and a hidden video track both read
   `hide="both"`, and mistaking one for the other drops the whole jump onto the titles track. */
const isAudioTrack = (tractor: XmlNode) => textOf(propOf(tractor, 'kdenlive:audio_track')) === '1'

/* The frames per second the project runs at, off its profile — every position in the timeline is
   counted in these. */
const fpsOf = (mlt: XmlNode[]) => {
  const profile = mlt.find((n) => tagOf(n) === 'profile')
  const num = Number(profile ? attrsOf(profile)['@_frame_rate_num'] : NaN)
  const den = Number(profile ? attrsOf(profile)['@_frame_rate_den'] : NaN)
  return num > 0 && den > 0 ? num / den : 25
}

/* The timeline's tracks bottom to top, as kdenlive counts them when it names a clip in a group:
   the black background it keeps underneath is not one of them. */
const timelineTracks = (mlt: XmlNode[], sequence: XmlNode) =>
  tracksOf(sequence).flatMap((track) => {
    const producer = attrsOf(track)['@_producer']
    const node = producer ? nodeById(mlt, 'tractor', producer) : undefined
    return node ? [node] : []
  })

export {
  attrsOf,
  childrenOf,
  decodeXml,
  encodeXml,
  fpsOf,
  isAudioTrack,
  nodeById,
  propOf,
  propsOf,
  setProp,
  tagOf,
  textOf,
  timelineTracks,
  tracksOf,
  xmlDocumentSchema,
  XML_OPTIONS
}
export type { XmlNode }
