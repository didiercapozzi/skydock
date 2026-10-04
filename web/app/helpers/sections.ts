import { passengerOf } from '@skydock/scripts'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { minFileMtime } from '../components/utils'
import { dayOf, dayOfFile } from './jumps'
import { familyOf } from './places'
import type { Place } from './places'

type Grouping = 'jump' | 'day' | 'none'

const GROUPINGS: Record<'sort' | 'dz' | 'montages', readonly Grouping[]> = {
  sort: ['jump', 'day', 'none'],
  dz: ['day'],
  montages: ['jump']
}

type Section =
  | { key: string; kind: 'jump'; group: ManifestGroup; label: string; files: ManifestFile[] }
  | { key: string; kind: 'day'; day: string; files: ManifestFile[] }
  | { key: string; kind: 'loose'; day: string; files: ManifestFile[] }
  | { key: string; kind: 'all'; files: ManifestFile[] }

const startOf = (group: ManifestGroup) => minFileMtime(group.files) ?? 0

const jumpLabels = (groups: ManifestGroup[]) =>
  new Map(
    [...groups]
      .sort(oldestFirst)
      .map((g, i) => [g.id, passengerOf(g) || g.name || `Jump ${i + 1}`] as const)
  )

const oldestFirst = (a: ManifestGroup, b: ManifestGroup) =>
  dayOf(a).localeCompare(dayOf(b)) || startOf(a) - startOf(b)

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

const cardsOf = (sections: Section[]) => {
  const jumps = sections.filter((s) => s.kind === 'jump')
  const loose = sections.flatMap((s) => (s.kind === 'loose' ? s.files : []))
  return loose.length
    ? [{ key: 'loose', kind: 'loose' as const, day: '', files: loose }, ...jumps]
    : jumps
}

export { GROUPINGS, cardsOf, jumpLabels, sectionsOf }
export type { Grouping, Section }
