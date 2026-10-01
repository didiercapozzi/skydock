import { t } from '@lingui/core/macro'
import { isVideoFile, lastSegment, parentOf, stemOf } from '@skydock/scripts'
import type { MontageEntry, SendPart } from '@skydock/scripts'
import type { ManifestGroup } from '../components/types'

/* A montage as it was handed over (RULES, Uploading a montage): one parcel per folder up there, each
   listing what is in it, and for a zip what is inside the zip. It is built from what the upload
   recorded where the board still holds it, and from what the storage's list says where it does not —
   a montage freed from this machine, or uploaded from another — so the same parcels are there to
   look at whichever it is. */

/* what lies inside a zip, or a folder sent as it is: a folder with how many files it holds and, when
   their names are known, the names; or a file at its top */
type Inside =
  | { kind: 'folder'; name: string; count: number; files: string[] }
  | { kind: 'file'; name: string }

type ParcelItem = {
  key: string
  /* what it is drawn as */
  icon: 'play' | 'zip' | 'fresh' | 'photo' | 'project'
  name: string
  /* how big, when that is known: an entry written before sizes were kept has none */
  size?: number
  /* what it is for, in a few words */
  what: string
  inside?: Inside[]
}

type Parcel = {
  key: string
  title: string
  dir: string
  /* said at the top right: handed over with a link, or kept and never shared */
  tag: string
  shareUrl?: string
  /* the one that holds the film: what was handed over, whether or not it has a link now */
  handed?: boolean
  items: ParcelItem[]
}

/* what a part is called, said in the language the app speaks */
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

/* The entries of a zip read back into folders and files: what sits under videos/ and photos/, and
   what sits at the top — the film and the project. */
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

/* What a zip of these parts holds, worked out from the montage where what was recorded does not say:
   its clips under videos/, its prepared photos under photos/, and the film and the project at the top,
   each named as it was sent. */
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

/* the same, from a storage list's entry, which knows how many but not which: the names are only in
   the zip */
const insideOfCounts = (holds: SendPart[], entry: MontageEntry): Inside[] => [
  ...(holds.includes('videos') && entry.videos > 0
    ? [{ kind: 'folder' as const, name: 'videos/', count: entry.videos, files: [] }]
    : []),
  ...(holds.includes('photos') && entry.photos > 0
    ? [{ kind: 'folder' as const, name: 'photos/', count: entry.photos, files: [] }]
    : []),
  ...(holds.includes('film') ? [{ kind: 'file' as const, name: t`the film` }] : []),
  ...(holds.includes('project') ? [{ kind: 'file' as const, name: t`the kdenlive project` }] : [])
]

/* items sharing a folder up there make one parcel; the one that holds the film is what was handed over,
   with its link, and every other is kept and never shared */
const parcelsFrom = (
  placed: { dir: string; item: ParcelItem; film: boolean }[],
  shareUrl?: string
) => {
  const byDir = new Map<string, typeof placed>()
  for (const entry of placed) byDir.set(entry.dir, [...(byDir.get(entry.dir) ?? []), entry])
  const parcels: Parcel[] = [...byDir].map(([dir, here]) => {
    const handed = here.some((entry) => entry.film)
    return {
      key: dir,
      title: handed ? t`To hand over` : t`Backup`,
      dir,
      tag: handed ? t`ready to hand over` : t`never shared`,
      handed,
      ...(handed && shareUrl ? { shareUrl } : {}),
      items: here.map((entry) => entry.item)
    }
  })
  /* what is handed over first, whatever order it was sent in */
  return parcels.sort((a, b) => Number(Boolean(b.handed)) - Number(Boolean(a.handed)))
}

/* The parcels of a montage this board still knows the upload of. */
const parcelsOfGroup = (group: ManifestGroup): Parcel[] => {
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
      shareUrl
    )
  /* uploaded before every item was written down: what the record keeps of each part */
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
  /* the photos as they went up, when there was no film to hand over with them */
  return parcelsFrom(placed, shareUrl).map((parcel) =>
    parcel.items.some((item) => item.what === t`the film`)
      ? parcel
      : { ...parcel, title: t`Backup`, tag: t`never shared` }
  )
}

/* The parcels of a montage the storage's list names: from its items where it kept them, else from the
   three places an older entry says — the film, the photos' zip and the backup. */
const parcelsOfEntry = (entry: MontageEntry): Parcel[] => {
  const shareUrl = entry.shareUrl
  if (entry.items && entry.items.length > 0)
    return parcelsFrom(
      entry.items.map((item) => ({
        dir: item.dir,
        film: item.holds.includes('film') && !item.zip,
        item: {
          key: `${item.dir}/${item.name}`,
          icon: iconOf(item.holds, item.zip),
          name: item.name,
          ...(item.size > 0 ? { size: item.size } : {}),
          what: whatOf(item.holds),
          ...(item.zip || item.holds.some((p) => p === 'videos' || p === 'photos')
            ? { inside: insideOfCounts(item.holds, entry) }
            : {})
        }
      })),
      shareUrl
    )
  const placed: Parameters<typeof parcelsFrom>[0] = []
  if (entry.film)
    placed.push({
      dir: parentOf(entry.film),
      film: true,
      item: { key: entry.film, icon: 'play', name: lastSegment(entry.film), what: t`the film` }
    })
  if (entry.photosZip)
    placed.push({
      dir: parentOf(entry.photosZip),
      film: false,
      item: {
        key: entry.photosZip,
        icon: 'zip',
        name: lastSegment(entry.photosZip),
        what: t`the photos`,
        inside: insideOfCounts(['photos'], entry)
      }
    })
  const parcels = parcelsFrom(placed, shareUrl)
  return entry.backup
    ? [
        ...parcels,
        {
          key: entry.backup,
          title: t`Backup`,
          dir: entry.backup.endsWith('.zip') ? parentOf(entry.backup) : entry.backup,
          tag: t`never shared`,
          items: [
            {
              key: entry.backup,
              icon: entry.backup.endsWith('.zip') ? 'zip' : 'fresh',
              name: entry.backup.endsWith('.zip') ? lastSegment(entry.backup) : t`the originals`,
              what: t`the originals`,
              ...(entry.backup.endsWith('.zip')
                ? { inside: insideOfCounts(['videos'], entry) }
                : {})
            }
          ]
        }
      ]
    : parcels
}

export { parcelsOfEntry, parcelsOfGroup }
export type { Inside, Parcel, ParcelItem }
