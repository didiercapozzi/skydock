import { z } from 'zod'
import {
  attrsOf,
  childrenOf,
  isAudioTrack,
  nodeById,
  propOf,
  setProp,
  tagOf,
  textOf,
  timelineTracks,
  tracksOf
} from './lib/mlt'
import type { XmlNode } from './lib/mlt'
import { jsonText } from './lib/json'

/* The two empty tracks a montage adds under a template's own, for the jump to be dragged onto.

   A template is somebody's film: its titles, photos, logos and music are laid out the way its owner
   wants, on as many tracks as they like, and nothing here needs to understand any of it. The picture
   track goes under every video track the template has, so whatever it puts on top — a title, a logo
   — stays on top of the footage; the sound track goes right under it, above the template's own audio.
   kdenlive keeps every audio track below every video track, which is why the two meet there.

   A project names its tracks by their place in the stack, so putting two in the middle moves every
   track above them up by two, and everything that names one of those tracks by number has to move
   with it: the compositions that blend one track onto another, and the groups that hold clips
   together. One left behind and the project still opens, with the titles blended onto the wrong
   track. */

const TRACKS = [
  { id: 'skydock_jump_sound', name: 'Jump sound', audio: true },
  { id: 'skydock_jump', name: 'Jump', audio: false }
]

/* what kdenlive marks the tracks' own compositions and effects with, as against the ones a person
   added */
const INTERNAL = ['internal_added', '237'] as const

const propertyOf = ([name, value]: readonly [string, string]) => ({
  property: [{ '#text': value }],
  ':@': { '@_name': name }
})

const nodeOf = (tag: string, id: string, properties: (readonly [string, string])[]) => ({
  [tag]: properties.map(propertyOf),
  ':@': { '@_id': id }
})

/* the level, balance and meter every audio track carries, switched off until someone reaches for
   them — as kdenlive writes a new track */
const AUDIO_EFFECTS: (readonly [string, string])[][] = [
  [
    ['window', '75'],
    ['max_gain', '20dB'],
    ['channel_mask', '-1'],
    ['mlt_service', 'volume']
  ],
  [
    ['channel', '-1'],
    ['mlt_service', 'panner'],
    ['start', '0.5']
  ],
  [
    ['iec_scale', '0'],
    ['mlt_service', 'audiolevel'],
    ['dbpeak', '1']
  ]
]

/* A track is a tractor over two playlists: the first holds its clips, the second is kdenlive's own
   lane for two clips of one track crossing over. */
const trackOf = ({ id, name, audio }: (typeof TRACKS)[number]) => {
  const lanes = [`${id}_clips`, `${id}_mixes`]
  return [
    ...lanes.map((lane) => ({ playlist: [], ':@': { '@_id': lane } })),
    {
      tractor: [
        ...(audio ? [propertyOf(['kdenlive:audio_track', '1'])] : []),
        propertyOf(['kdenlive:track_name', name]),
        propertyOf(['kdenlive:timeline_active', '1']),
        ...lanes.map((lane) => ({
          track: [],
          ':@': { '@_hide': audio ? 'video' : 'audio', '@_producer': lane }
        })),
        ...(audio
          ? AUDIO_EFFECTS.map((effect, index) =>
              nodeOf('filter', `${id}_effect_${index}`, [...effect, INTERNAL, ['disable', '1']])
            )
          : [])
      ],
      ':@': { '@_id': id }
    }
  ]
}

/* How a track is heard or seen in the film at all: its sound summed into the rest, its picture
   blended over what is under it. */
const compositionOf = ({ id, audio }: (typeof TRACKS)[number], at: number) =>
  nodeOf('transition', `${id}_composition`, [
    ['a_track', '0'],
    ['b_track', String(at)],
    ...(audio
      ? ([
          ['mlt_service', 'mix'],
          ['kdenlive_id', 'mix'],
          ['accepts_blanks', '1'],
          ['sum', '1']
        ] as const)
      : ([
          ['compositing', '0'],
          ['distort', '0'],
          ['rotate_center', '0'],
          ['mlt_service', 'qtblend'],
          ['kdenlive_id', 'qtblend']
        ] as const)),
    INTERNAL,
    ['always_active', '1']
  ])

/* kdenlive keeps its groups as a list of trees, a clip in one named by its track and first frame */
type Group = { [key: string]: unknown; data?: string; children?: Group[] }
const groupSchema: z.ZodType<Group> = z.lazy(() =>
  z.looseObject({ data: z.string().optional(), children: z.array(groupSchema).optional() })
)
const groupsSchema = jsonText.pipe(z.array(groupSchema))

const LEAF = /^(\d+):(\d+)$/

/* in place: what is shifted is a copy just read out of the project */
const shiftGroup = (group: Group, from: number, by: number) => {
  const leaf = LEAF.exec(group.data ?? '')
  if (leaf && Number(leaf[1]) >= from) group.data = `${Number(leaf[1]) + by}:${leaf[2]}`
  for (const child of group.children ?? []) shiftGroup(child, from, by)
}

/* A number that names a track at or above where the new ones go, moved up past them. */
const shifted = (value: string, from: number, by: number) => {
  const track = Number(value)
  return Number.isInteger(track) && track >= from ? String(track + by) : value
}

const addJumpTracks = (mlt: XmlNode[], sequence: XmlNode) => {
  const by = TRACKS.length
  const stack = tracksOf(sequence)
  const isVideo = (track: XmlNode) => {
    const producer = attrsOf(track)['@_producer']
    const tractor = producer ? nodeById(mlt, 'tractor', producer) : undefined
    return tractor !== undefined && !isAudioTrack(tractor)
  }
  /* where the first video track is, counted two ways: in the stack as it is written, with the black
     kdenlive keeps underneath everything, and as kdenlive counts tracks in a group, without it */
  const firstVideo = stack.findIndex(isVideo)
  const at = firstVideo === -1 ? stack.length : firstVideo
  const timeline = timelineTracks(mlt, sequence)
  const inGroups = timeline.findIndex((t) => !isAudioTrack(t))
  const groupAt = inGroups === -1 ? timeline.length : inGroups

  const children = childrenOf(sequence)
  const transitions = children.filter((c) => tagOf(c) === 'transition')
  for (const transition of transitions)
    for (const name of ['a_track', 'b_track']) {
      const value = textOf(propOf(transition, name))
      if (value !== '') setProp(transition, name, shifted(value, at, by))
    }
  const groups = groupsSchema.safeParse(
    textOf(propOf(sequence, 'kdenlive:sequenceproperties.groups'))
  )
  if (groups.success && groups.data.length > 0) {
    for (const group of groups.data) shiftGroup(group, groupAt, by)
    setProp(sequence, 'kdenlive:sequenceproperties.groups', JSON.stringify(groups.data, null, 4))
  }
  const active = textOf(propOf(sequence, 'kdenlive:sequenceproperties.activeTrack'))
  if (active !== '')
    setProp(sequence, 'kdenlive:sequenceproperties.activeTrack', shifted(active, groupAt, by))

  /* the tracks themselves, defined before the sequence that plays them, and placed in its stack */
  mlt.splice(mlt.indexOf(sequence), 0, ...TRACKS.flatMap(trackOf))
  const before = stack[at]
  const lastTrack = stack[stack.length - 1]
  const place = before
    ? children.indexOf(before)
    : lastTrack
      ? children.indexOf(lastTrack) + 1
      : children.length
  children.splice(place, 0, ...TRACKS.map(({ id }) => ({ track: [], ':@': { '@_producer': id } })))

  /* Each track's own composition, in the order of the stack: a picture is blended over whatever
     was blended before it, so one placed after the template's would cover its titles. */
  const made = TRACKS.map((track, index) => compositionOf(track, at + index))
  const next = transitions.find((t) => Number(textOf(propOf(t, 'b_track'))) >= at + by)
  const lastTransition = transitions[transitions.length - 1]
  const where = next
    ? children.indexOf(next)
    : lastTransition
      ? children.indexOf(lastTransition) + 1
      : children.length
  children.splice(where, 0, ...made)

  if (propOf(sequence, 'kdenlive:sequenceproperties.tracksCount'))
    setProp(
      sequence,
      'kdenlive:sequenceproperties.tracksCount',
      String(timelineTracks(mlt, sequence).length)
    )
  return TRACKS.map(({ name }) => name)
}

export { addJumpTracks }
