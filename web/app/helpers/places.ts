import { passengerOf } from '@skydock/scripts'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { TANDEMS, dayLabel, dayOf, dayOfFile } from './jumps'

/* Where a file can be, as the folders down the left of the board: everything still to sort, each day
   of it as it came off the cameras, a dropzone, all the passengers, the ones still without a name, one
   passenger, and what the storage itself holds. One is open at a time and its files fill the pane. */
type Place =
  | { kind: 'sort' }
  | { kind: 'day'; day: string }
  | { kind: 'dz'; name: string }
  | { kind: 'tandems' }
  | { kind: 'unnamed' }
  | { kind: 'pax'; name: string }
  | { kind: 'storage' }

const placeKey = (place: Place) =>
  `${place.kind}:${place.kind === 'day' ? place.day : 'name' in place ? place.name : ''}`

const samePlace = (a: Place, b: Place) => placeKey(a) === placeKey(b)

/* what a place is called, wherever it is named — the folder and the heading above its files are the
   same words by construction, not by being typed out twice */
const placeLabel = (place: Place) =>
  place.kind === 'sort'
    ? 'Unsorted'
    : place.kind === 'day'
      ? dayLabel(place.day)
      : place.kind === 'tandems'
        ? 'All passengers'
        : place.kind === 'unnamed'
          ? 'No name yet'
          : place.kind === 'storage'
            ? 'On the storage'
            : place.name

/* the folder a folder sits in, for the path above the files */
const placeParent = (place: Place): Place | null =>
  place.kind === 'day'
    ? { kind: 'sort' }
    : place.kind === 'unnamed' || place.kind === 'pax'
      ? { kind: 'tandems' }
      : null

/* the three families of folder, which is what decides how their files can be grouped */
const familyOf = (place: Place) =>
  place.kind === 'sort' || place.kind === 'day'
    ? 'sort'
    : place.kind === 'dz'
      ? 'dz'
      : place.kind === 'storage'
        ? 'storage'
        : 'tandems'

const groupsIn = (place: Place, groups: ManifestGroup[]) => {
  switch (place.kind) {
    case 'sort':
      return groups.filter((g) => !g.destination)
    case 'day':
      return groups.filter((g) => !g.destination && dayOf(g) === place.day)
    case 'dz':
      return groups.filter((g) => g.destination === place.name)
    case 'tandems':
      return groups.filter((g) => g.destination === TANDEMS)
    case 'unnamed':
      return groups.filter((g) => g.destination === TANDEMS && !passengerOf(g))
    case 'pax':
      return groups.filter((g) => g.destination === TANDEMS && passengerOf(g) === place.name)
    case 'storage':
      return []
  }
}

/* A loose file is in the sorting area until it is filed to a dropzone; a passenger's files are always
   in a jump, since the name lives on the jump. */
const looseIn = (place: Place, loose: ManifestFile[]) =>
  place.kind === 'sort'
    ? loose.filter((f) => !f.destination)
    : place.kind === 'day'
      ? loose.filter((f) => !f.destination && dayOfFile(f) === place.day)
      : place.kind === 'dz'
        ? loose.filter((f) => f.destination === place.name)
        : []

const filesIn = (place: Place, groups: ManifestGroup[], loose: ManifestFile[]) => [
  ...groupsIn(place, groups).flatMap((g) => g.files),
  ...looseIn(place, loose)
]

export { familyOf, filesIn, groupsIn, looseIn, placeKey, placeLabel, placeParent, samePlace }
export type { Place }
