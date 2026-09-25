import { passengerOf } from '@skydock/scripts'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { minFileMtime } from '../components/utils'
import { dayOf, dayOfFile } from './jumps'
import { familyOf } from './places'
import type { Place } from './places'

/* How a folder's files are grouped on screen: under their jumps, under the days they were shot, or
   in one list. A dropzone has no jumps — its files are flat — so it groups by day or not at all. */
type Grouping = 'jump' | 'day' | 'none'

const GROUPINGS: Record<'sort' | 'dz' | 'montages', readonly Grouping[]> = {
  sort: ['jump', 'day', 'none'],
  dz: ['day', 'none'],
  montages: ['jump', 'none']
}

/* One run of files under one header. A jump's header files and names it; a day's says what the day
   holds; a day's loose files are said to be in no jump. */
type Section =
  | { key: string; kind: 'jump'; group: ManifestGroup; label: string; files: ManifestFile[] }
  | { key: string; kind: 'day'; day: string; files: ManifestFile[] }
  | { key: string; kind: 'loose'; day: string; files: ManifestFile[] }
  | { key: string; kind: 'all'; files: ManifestFile[] }

const startOf = (group: ManifestGroup) => minFileMtime(group.files) ?? 0

/* A jump is named by its place among the jumps — "Jump 2" — which says why these files are together
   where a bare time only ever said when. Counted over every jump there, oldest first and straight
   through the days, so four jumps are Jump 1 to Jump 4 whichever days they fell on: a number that
   started again each day would give two jumps the same name. The numbers are positions, not identities:
   file one away and the rest renumber. A passenger's jump is named after the passenger, and one
   given a name keeps it. */
const jumpLabels = (groups: ManifestGroup[]) =>
  new Map(
    [...groups]
      .sort(oldestFirst)
      .map((g, i) => [g.id, passengerOf(g) || g.name || `Jump ${i + 1}`] as const)
  )

/* in the order the jumps happened: the oldest day first, and within a day by when each started */
const oldestFirst = (a: ManifestGroup, b: ManifestGroup) =>
  dayOf(a).localeCompare(dayOf(b)) || startOf(a) - startOf(b)

/* `numbered` is every jump of the place, whatever a search leaves on screen: a jump keeps its number
   while others are hidden, so its card and its panel always agree. */
const sectionsOf = (
  place: Place,
  grouping: Grouping,
  groups: ManifestGroup[],
  loose: ManifestFile[],
  numbered: ManifestGroup[] = groups
): Section[] => {
  const shownGroups = groups.filter((g) => g.files.length > 0 || g.freed)
  const all = [...shownGroups.flatMap((g) => g.files), ...loose]
  if (grouping === 'none') return all.length ? [{ key: 'all', kind: 'all', files: all }] : []
  const days = [...new Set([...shownGroups.map(dayOf), ...loose.map(dayOfFile)])].sort().reverse()
  if (grouping === 'day')
    return days.map((day) => ({
      key: `day:${day}`,
      kind: 'day',
      day,
      files: [
        ...shownGroups.filter((g) => dayOf(g) === day).flatMap((g) => g.files),
        ...loose.filter((f) => dayOfFile(f) === day)
      ]
    }))
  const labels = jumpLabels(numbered.filter((g) => g.files.length > 0 || g.freed))
  const withLoose = familyOf(place) === 'sort'
  /* by jump, the newest jump first: the numbers count down from the latest to Jump 1 */
  return days.flatMap((day): Section[] => {
    const jumps = shownGroups
      .filter((g) => dayOf(g) === day)
      .sort((a, b) => oldestFirst(b, a))
      .map((group): Section => ({
        key: `jump:${group.id}`,
        kind: 'jump',
        group,
        label: labels.get(group.id) ?? group.label,
        files: group.files
      }))
    const dayLoose = withLoose ? loose.filter((f) => dayOfFile(f) === day) : []
    return dayLoose.length
      ? [...jumps, { key: `loose:${day}`, kind: 'loose', day, files: dayLoose }]
      : jumps
  })
}

/* By jump, the jumps become cards — and the loose files one card, always first, however many days
   they were shot on. A card per day of loose files read as that many unnamed jumps; loose is one
   thing, files in no jump, so it is one card, with no day of its own. */
const cardsOf = (sections: Section[]) => {
  const jumps = sections.filter((s) => s.kind === 'jump')
  const loose = sections.flatMap((s) => (s.kind === 'loose' ? s.files : []))
  return loose.length
    ? [{ key: 'loose', kind: 'loose' as const, day: '', files: loose }, ...jumps]
    : jumps
}

export { GROUPINGS, cardsOf, jumpLabels, sectionsOf }
export type { Grouping, Section }
