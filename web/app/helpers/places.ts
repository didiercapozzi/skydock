import { hasCompletePassenger, passengerOf } from '@skydock/scripts'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { TANDEMS } from './jumps'

/* Where a file can be, as the folders down the left of the board: the fresh files still to sort, a
   dropzone, all the passengers, the ones still without a name, one passenger, what the storage
   itself holds, and a camera plugged in, by where it is mounted. One is open at a time and its files
   fill the pane. */
type Place =
  | { kind: 'sort' }
  | { kind: 'dz'; name: string }
  | { kind: 'tandems' }
  | { kind: 'unnamed' }
  | { kind: 'pax'; name: string }
  | { kind: 'storage' }
  | { kind: 'camera'; name: string }

const placeKey = (place: Place) => `${place.kind}:${'name' in place ? place.name : ''}`

const samePlace = (a: Place, b: Place) => placeKey(a) === placeKey(b)

/* what a place is called, wherever it is named — the folder and the heading above its files are the
   same words by construction, not by being typed out twice */
const placeLabel = (place: Place) =>
  place.kind === 'sort'
    ? 'Fresh files'
    : place.kind === 'tandems'
      ? 'Tandems'
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
      return groups.filter((g) => !g.destination)
    case 'dz':
      return groups.filter((g) => g.destination === place.name)
    case 'tandems':
      return groups.filter((g) => g.destination === TANDEMS)
    case 'unnamed':
      /* half a name is no passenger yet: it waits here with the tandems that have none */
      return groups.filter((g) => g.destination === TANDEMS && !hasCompletePassenger(g.passenger))
    case 'pax':
      return groups.filter((g) => g.destination === TANDEMS && passengerOf(g) === place.name)
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

export {
  familyOf,
  filesIn,
  groupsIn,
  hereIn,
  holdsItsOwn,
  looseIn,
  placeKey,
  placeLabel,
  samePlace,
  stillHere
}
export type { Place }
