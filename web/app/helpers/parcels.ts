import { plural, t } from '@lingui/core/macro'
import { isVideoFile, lastSegment, parentOf, stemOf } from '@skydock/scripts/client'
import type { SendPart } from '@skydock/scripts'
import type { ManifestGroup } from '../components/types'

type Inside =
  | { kind: 'folder'; name: string; count: number; files: string[] }
  | { kind: 'file'; name: string }

type ParcelItem = {
  key: string
  icon: 'play' | 'zip' | 'fresh' | 'photo' | 'project'
  name: string
  size?: number
  what: string
  inside?: Inside[]
}

type Parcel = {
  key: string
  title: string
  dir: string
  tag: string
  shareUrl?: string
  handed?: boolean
  items: ParcelItem[]
}

type Places = { name: string; path?: string }[]

const destinationNamed = (dir: string, places: Places = []) => {
  const inside = (root: string) => dir === root || dir.startsWith(`${root.replace(/\/$/, '')}/`)
  const found = places
    .filter((place): place is { name: string; path: string } => Boolean(place.path))
    .filter((place) => inside(place.path))
    .sort((a, b) => b.path.length - a.path.length)[0]
  return found ? found.name : lastSegment(dir)
}

const partSaid = (part: SendPart) =>
  part === 'videos'
    ? t`the originals`
    : part === 'photos'
      ? t`the photos`
      : part === 'film'
        ? t`the film`
        : t`the project`

const whatOf = (holds: SendPart[]) => holds.map(partSaid).join(' · ')

const iconOf = (holds: SendPart[], zip: boolean): ParcelItem['icon'] =>
  zip ? 'zip' : holds.length === 1 && holds[0] === 'film' ? 'play' : 'fresh'

const insideOfEntries = (entries: string[]): Inside[] => {
  const folders = new Map<string, string[]>()
  const top: Inside[] = []
  for (const entry of entries) {
    const slash = entry.indexOf('/')
    if (slash === -1) top.push({ kind: 'file', name: entry })
    else {
      const folder = entry.slice(0, slash + 1)
      folders.set(folder, [...(folders.get(folder) ?? []), entry.slice(slash + 1)])
    }
  }
  return [
    ...[...folders].map(([name, files]) => ({
      kind: 'folder' as const,
      name,
      count: files.length,
      files
    })),
    ...top
  ]
}

const insideOfParts = (holds: SendPart[], group: ManifestGroup): Inside[] => {
  const stem = stemOf(group)
  const videos = group.files.filter((f) => isVideoFile(f.path)).map((f) => f.filename)
  const photos = group.files.flatMap((f) =>
    !isVideoFile(f.path) && f.processed ? [lastSegment(f.processed.path)] : []
  )
  return [
    ...(holds.includes('videos') && videos.length > 0
      ? [{ kind: 'folder' as const, name: 'videos/', count: videos.length, files: videos }]
      : []),
    ...(holds.includes('photos') && photos.length > 0
      ? [{ kind: 'folder' as const, name: 'photos/', count: photos.length, files: photos }]
      : []),
    ...(holds.includes('film') ? [{ kind: 'file' as const, name: `${stem}.mp4` }] : []),
    ...(holds.includes('project') ? [{ kind: 'file' as const, name: `${stem}.kdenlive` }] : [])
  ]
}

const parcelsFrom = (
  placed: { dir: string; item: ParcelItem; film: boolean }[],
  shareUrl?: string,
  places?: Places
) => {
  const byDir = new Map<string, typeof placed>()
  for (const entry of placed) byDir.set(entry.dir, [...(byDir.get(entry.dir) ?? []), entry])
  const parcels: Parcel[] = [...byDir].map(([dir, here]) => {
    const handed = here.some((entry) => entry.film)
    return {
      key: dir,
      title: destinationNamed(dir, places),
      dir,
      tag: plural(here.length, { one: '# item', other: '# items' }),
      handed,
      ...(handed && shareUrl ? { shareUrl } : {}),
      items: here.map((entry) => entry.item)
    }
  })
  return parcels.sort((a, b) => Number(Boolean(b.handed)) - Number(Boolean(a.handed)))
}

const parcelsOfGroup = (group: ManifestGroup, places?: Places): Parcel[] => {
  const record = group.uploaded
  if (!record) return []
  const shareUrl = record.shareUrl ?? group.publish?.shareUrl
  if (record.sent && record.sent.length > 0)
    return parcelsFrom(
      record.sent.flatMap((sent) =>
        sent.to.map((dir) => {
          const zip = sent.zip ?? sent.name.endsWith('.zip')
          const inside = sent.contents
            ? insideOfEntries(sent.contents)
            : zip
              ? insideOfParts(sent.holds, group)
              : sent.holds.some((p) => p === 'videos' || p === 'photos')
                ? insideOfParts(sent.holds, group).filter((line) => line.kind === 'folder')
                : undefined
          return {
            dir,
            film: sent.holds.includes('film') && !zip,
            item: {
              key: `${dir}/${sent.name}`,
              icon: iconOf(sent.holds, zip),
              name: sent.name,
              ...(sent.size ? { size: sent.size } : {}),
              what: whatOf(sent.holds),
              ...(inside && inside.length > 0 ? { inside } : {})
            }
          }
        })
      ),
      shareUrl,
      places
    )
  const placed: Parameters<typeof parcelsFrom>[0] = []
  const add = (
    remotePath: string,
    size: number,
    what: string,
    film: boolean,
    icon: ParcelItem['icon'],
    inside?: Inside[]
  ) =>
    placed.push({
      dir: parentOf(remotePath),
      film,
      item: {
        key: remotePath,
        icon,
        name: lastSegment(remotePath),
        size,
        what,
        ...(inside && inside.length > 0 ? { inside } : {})
      }
    })
  if (record.film) add(record.film.remotePath, record.film.size, t`the film`, true, 'play')
  if (record.photos)
    add(
      record.photos.remotePath,
      record.photos.size,
      t`the photos`,
      false,
      'zip',
      record.photos.holds ? insideOfParts(record.photos.holds, group) : undefined
    )
  if (record.rushes)
    add(
      record.rushes.remotePath,
      record.rushes.size,
      t`the originals`,
      false,
      'zip',
      record.rushes.holds ? insideOfParts(record.rushes.holds, group) : undefined
    )
  for (const original of record.originals ?? [])
    add(
      original.remotePath,
      original.size,
      record.film && lastSegment(original.remotePath) === lastSegment(record.film.remotePath)
        ? t`a copy of the film`
        : t`original`,
      false,
      'play'
    )
  return parcelsFrom(placed, shareUrl, places)
}

const parcelOfFolder = ({
  dir,
  files,
  hereToo
}: {
  dir: string
  files: { name: string; size: number | null; kind: 'video' | 'photo' | 'other' }[]
  hereToo?: Set<string>
}): Parcel => ({
  key: dir,
  title: '',
  dir,
  tag: plural(files.length, { one: '# file', other: '# files' }),
  items: files.map((file) => ({
    key: `${dir}/${file.name}`,
    icon: file.kind === 'video' ? 'play' : file.kind === 'photo' ? 'photo' : 'zip',
    name: file.name,
    ...(file.size === null ? {} : { size: file.size }),
    what: [
      file.kind === 'video' ? t`video` : file.kind === 'photo' ? t`photo` : t`file`,
      ...(hereToo ? [hereToo.has(file.name) ? t`here too` : t`only there`] : [])
    ].join(' · ')
  }))
})

export { parcelOfFolder, parcelsOfGroup }
export type { Inside, Parcel, Places }
