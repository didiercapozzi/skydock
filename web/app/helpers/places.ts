import { hasCompletePassenger, isFiled, isMontage, passengerOf } from '@skydock/scripts'
import { z } from 'zod'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { routingEngine } from './routing'
import type { BoardView } from './view'

/* Where a file can be, as the folders down the left of the board: the fresh files still to sort, a
   dropzone, all the passengers, the ones still without a name, one passenger, what the storage
   itself holds, and a camera plugged in, by where it is mounted. One is open at a time and its files
   fill the pane. */
const placeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sort') }),
  z.object({ kind: z.literal('dz'), name: z.string().min(1) }),
  z.object({ kind: z.literal('tandems') }),
  z.object({ kind: z.literal('unnamed') }),
  z.object({ kind: z.literal('pax'), name: z.string().min(1) }),
  z.object({ kind: z.literal('storage') }),
  z.object({ kind: z.literal('camera'), name: z.string().min(1) })
])

type Place = z.infer<typeof placeSchema>

/* the board opens on the fresh files, and falls back to them */
const FRESH: Place = { kind: 'sort' }

const placeKey = (place: Place) => `${place.kind}:${'name' in place ? place.name : ''}`

const samePlace = (a: Place, b: Place) => placeKey(a) === placeKey(b)

/* what a place is called, wherever it is named — the folder and the heading above its files are the
   same words by construction, not by being typed out twice */
const placeLabel = (place: Place) =>
  place.kind === 'sort'
    ? 'Fresh files'
    : place.kind === 'tandems'
      ? 'Montages'
      : place.kind === 'unnamed'
        ? 'No name yet'
        : place.kind === 'storage'
          ? 'On the storage'
          : place.kind === 'camera'
            ? `On the camera ${place.name.split('/').pop() ?? ''}`
            : place.name

/* the three families of folder, which is what decides how their files can be grouped */
const familyOf = (place: Place) =>
  place.kind === 'sort'
    ? 'sort'
    : place.kind === 'dz'
      ? 'dz'
      : place.kind === 'storage' || place.kind === 'camera'
        ? 'storage'
        : 'tandems'

const groupsIn = (place: Place, groups: ManifestGroup[]) => {
  switch (place.kind) {
    case 'sort':
      return groups.filter((g) => !isFiled(g))
    case 'dz':
      return groups.filter((g) => g.destination === place.name)
    case 'tandems':
      return groups.filter(isMontage)
    case 'unnamed':
      /* a montage nobody has named yet waits here */
      return groups.filter((g) => isMontage(g) && !hasCompletePassenger(g.passenger))
    case 'pax':
      return groups.filter((g) => isMontage(g) && passengerOf(g) === place.name)
    case 'storage':
    case 'camera':
      return []
  }
}

/* A loose file is in the sorting area until it is filed to a dropzone; a passenger's files are always
   in a jump, since the name lives on the jump. */
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

/* A file freed from a dropzone is on the storage and nowhere else, and the storage's own list of
   that folder — right under the dropzone's files — is where it is listed. Listing it up here as
   well says the same thing twice, and says it in a row where every neighbour can be trimmed,
   prepared, uploaded or freed and it can be none of them. So a dropzone and the sorting area show
   what this machine holds, and what is only up there is only down there (RULES, Freeing space).

   A passenger is not narrowed this way: their card is how a tandem is followed to the end, and a
   freed one goes on showing what the storage holds of it. */
const holdsItsOwn = (place: Place) => place.kind === 'dz' || place.kind === 'sort'

const stillHere = (place: Place, files: ManifestFile[]) =>
  holdsItsOwn(place) ? files.filter((f) => !f.freed) : files

/* what a place holds on this machine, which is what its page and its folder in the rail count */
const hereIn = (place: Place, groups: ManifestGroup[], loose: ManifestFile[]) =>
  stillHere(place, filesIn(place, groups, loose))

/* Each folder's own address, in the words the folder is called by, so that an address can be read
   and typed: /dropzone/yverdon, /montage/Lily%20DONZALLAZ, /storage. One list, read both ways.
   Fresh files is what the board opens on and has the plainest word of them. */
const PLACE_WORDS = {
  sort: 'fresh',
  dz: 'dropzone',
  tandems: 'montages',
  unnamed: 'no-name',
  pax: 'montage',
  storage: 'storage',
  camera: 'camera'
} as const satisfies Record<Place['kind'], string>

/* The words addresses used before montages had the name, so a link kept or sent then still opens. */
const EARLIER_WORDS: Record<string, Place['kind']> = { tandems: 'tandems', passenger: 'pax' }

const paramsOfPlace = (place: Place) => ({
  kind: PLACE_WORDS[place.kind],
  name: 'name' in place ? place.name : undefined
})

const kindOfWord = (word: string | undefined) =>
  Object.entries(PLACE_WORDS).find(([, known]) => known === word)?.[0] ??
  (word ? EARLIER_WORDS[word] : undefined)

/* Which folder an address names, read the way anything from outside is read: an address is typed by
   hand, kept from a board that has since been rearranged, or sent by somebody, so it is parsed and
   not trusted. Anything that does not name a folder — a word nobody knows, a folder named without
   the name it needs — is the board's front folder rather than nothing at all. */
const placeFromParams = ({ kind, name }: { kind?: string; name?: string }) => {
  const read = placeSchema.safeParse({ kind: kindOfWord(kind), name })
  return read.success ? read.data : FRESH
}

/* Every address the board can be at, built from the folder rather than written out: a folder, and a
   file open in it. Both carry how that folder is being looked at — which kind of file is shown,
   what is being looked for, how it is grouped, which jump card is open — and what may be carried is
   what those pages declare as their `searchParamsArgs`, so an address cannot hold anything the page
   it names would not understand.

   Nothing to say about the looking leaves the address plain: a folder is its own address, and only
   a folder being looked at in some particular way carries more than its name. */
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

export {
  familyOf,
  fileHref,
  filesIn,
  groupsIn,
  hereIn,
  holdsItsOwn,
  looseIn,
  placeFromParams,
  placeHref,
  placeKey,
  placeLabel,
  samePlace,
  stillHere
}
export type { Place }
