import { t } from '@lingui/core/macro'
import {
  hasCompletePassenger,
  isFiled,
  isMontage,
  MONTAGES_FOLDER,
  passengerOf
} from '@skydock/scripts/client'
import { z } from 'zod'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { routingEngine } from './routing'
import type { BoardView } from './view'

const placeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sort') }),
  z.object({ kind: z.literal('dz'), name: z.string().min(1) }),
  z.object({ kind: z.literal('montages') }),
  z.object({ kind: z.literal('unnamed') }),
  z.object({ kind: z.literal('pax'), name: z.string().min(1) }),
  z.object({ kind: z.literal('delivered') }),
  z.object({ kind: z.literal('bin') }),
  z.object({ kind: z.literal('camera'), name: z.string().min(1) })
])

type Place = z.infer<typeof placeSchema>

const FRESH: Place = { kind: 'sort' }

const placeKey = (place: Place) => `${place.kind}:${'name' in place ? place.name : ''}`

const cameraLabel = (key: string) => {
  const camera = key.startsWith('name:') ? key.slice('name:'.length) : ''
  return camera ? t`On the camera ${camera}` : t`On a camera`
}

const placeLabel = (place: Place) =>
  place.kind === 'sort'
    ? t`Fresh files`
    : place.kind === 'montages'
      ? t`Montages`
      : place.kind === 'unnamed'
        ? t`No name yet`
        : place.kind === 'delivered'
          ? t`Montages done`
          : place.kind === 'bin'
            ? t`Bin`
            : place.kind === 'camera'
              ? cameraLabel(place.name)
              : place.name

const familyOf = (place: Place) =>
  place.kind === 'sort'
    ? 'sort'
    : place.kind === 'dz'
      ? 'dz'
      : place.kind === 'camera' || place.kind === 'bin' || place.kind === 'delivered'
        ? 'storage'
        : 'montages'

const groupsIn = (place: Place, groups: ManifestGroup[]) => {
  switch (place.kind) {
    case 'sort':
      return groups.filter((g) => !isFiled(g))
    case 'dz':
      return groups.filter((g) => g.destination === place.name)
    case 'montages':
      return groups.filter(isMontage)
    case 'unnamed':
      return groups.filter((g) => isMontage(g) && !hasCompletePassenger(g.passenger))
    case 'pax':
      return groups.filter((g) => isMontage(g) && passengerOf(g) === place.name)
    case 'camera':
    case 'bin':
    case 'delivered':
      return []
  }
}

const looseIn = (place: Place, loose: ManifestFile[]) =>
  place.kind === 'sort'
    ? loose.filter((f) => !f.destination)
    : place.kind === 'dz'
      ? loose.filter((f) => f.destination === place.name)
      : []

const filesIn = (place: Place, groups: ManifestGroup[], loose: ManifestFile[]) => [
  ...groupsIn(place, groups).flatMap((g) => g.files),
  ...looseIn(place, loose)
]

const holdsItsOwn = (place: Place) => place.kind === 'dz' || place.kind === 'sort'

const stillHere = (place: Place, files: ManifestFile[]) =>
  holdsItsOwn(place) ? files.filter((f) => !f.freed) : files

const hereIn = (place: Place, groups: ManifestGroup[], loose: ManifestFile[]) =>
  stillHere(place, filesIn(place, groups, loose))

const placeOfGroup = (g: ManifestGroup): Place =>
  isMontage(g)
    ? hasCompletePassenger(g.passenger)
      ? { kind: 'pax', name: passengerOf(g) }
      : { kind: 'unnamed' }
    : g.destination
      ? { kind: 'dz', name: g.destination }
      : { kind: 'sort' }

const placeOfLoose = (f: ManifestFile): Place =>
  f.destination ? { kind: 'dz', name: f.destination } : { kind: 'sort' }

const PLACE_WORDS = {
  sort: 'fresh',
  dz: 'dropzone',
  montages: 'montages',
  unnamed: 'no-name',
  pax: 'montage',
  delivered: 'delivered',
  bin: 'bin',
  camera: 'camera'
} as const satisfies Record<Place['kind'], string>

const paramsOfPlace = (place: Place) => ({
  kind: PLACE_WORDS[place.kind],
  name: 'name' in place ? place.name : undefined
})

const kindOfWord = (word: string | undefined) =>
  Object.entries(PLACE_WORDS).find(([, known]) => known === word)?.[0]

const placeFromParams = ({ kind, name }: { kind?: string; name?: string }) => {
  const read = placeSchema.safeParse({ kind: kindOfWord(kind), name })
  return read.success ? read.data : FRESH
}

const carried = (view: BoardView) =>
  Object.values(view).some((value) => value !== undefined) ? view : undefined

const placeHref = (place: Place, view: BoardView = {}) =>
  routingEngine.href({
    url: '/:kind/:name?',
    params: paramsOfPlace(place),
    searchParamsArgs: carried(view)
  })

const fileHref = (place: Place, fileId: string, view: BoardView = {}) =>
  routingEngine.href({
    url: '/:kind/:name?/file/:fileId',
    params: { ...paramsOfPlace(place), fileId },
    searchParamsArgs: carried(view)
  })

const editHref = (groupId: string) =>
  routingEngine.href({ url: '/edit/:groupId', params: { groupId } })

const filmTemplateHref = (name: string) =>
  routingEngine.href({ url: '/film-template/:name', params: { name } })

const placeNameProblem = (name: string) => {
  const trimmed = name.trim()
  if (!trimmed) return t`A dropzone needs a name.`
  if (trimmed === '.' || trimmed === '..' || /[\\/]/.test(trimmed))
    return t`“${trimmed}” cannot be a dropzone’s name — it is not a folder name.`
  if (trimmed.toLowerCase() === MONTAGES_FOLDER.toLowerCase())
    return t`“${trimmed}” is where the montages are kept — give the dropzone another name.`
  return null
}

export {
  placeOfGroup,
  placeOfLoose,
  familyOf,
  fileHref,
  filesIn,
  groupsIn,
  hereIn,
  holdsItsOwn,
  looseIn,
  placeFromParams,
  placeHref,
  editHref,
  filmTemplateHref,
  placeKey,
  placeLabel,
  placeNameProblem,
  stillHere
}
export type { Place }
