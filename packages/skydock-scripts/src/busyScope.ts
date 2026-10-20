type Work = { type: 'process' | 'upload' | 'render'; groupIds: string[]; destinations: string[] }

type BusyScope = { groupIds?: string[]; destination?: string; destinations?: string[] }

type Busy = 'processing' | 'uploading' | 'rendering'

const BUSY_OF = { process: 'processing', upload: 'uploading', render: 'rendering' } as const

const busyAmong = (
  works: Work[],
  { groupIds = [], destination, destinations = [] }: BusyScope,
  among: Work['type'][] = ['process', 'upload', 'render']
): Busy | null => {
  const places = destination === undefined ? destinations : [...destinations, destination]
  const everything = groupIds.length === 0 && places.length === 0
  const touches = (work: Work) =>
    groupIds.some((id) => work.groupIds.includes(id)) ||
    places.some((place) => work.destinations.includes(place))
  const holds = (work: Work) =>
    work.type === 'process'
      ? (work.groupIds.length === 0 && work.destinations.length === 0) || touches(work)
      : work.type === 'upload'
        ? everything || touches(work)
        : touches(work)
  const held = among.find((type) => works.some((work) => work.type === type && holds(work)))
  return held ? BUSY_OF[held] : null
}

export { busyAmong }
export type { Busy, BusyScope, Work }
