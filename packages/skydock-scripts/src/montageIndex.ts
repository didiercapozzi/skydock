import { listNasFolder, listShareLinks, liveShareLinks, normalizeNasPath } from './nas'
import type { NasSession } from './nas'
import { lastSegment, parentOf } from './paths'
import { findList, writeList } from './storageList'
import type { ListPlace } from './storageList'
import {
  montageEntrySchema as entrySchema,
  montageIndexSchema as indexSchema
} from './montageEntry'
import type { MontageEntry, MontageIndex } from './montageEntry'
import type { ManifestGroup } from './types'
import { LIST_CONCURRENCY } from './upload'
import { isVideoFile, mapWithLimit } from './utils'

const INDEX_NAME = 'skydock-montages.json'

const placesOf = (dir: string, earlier: string[]): ListPlace[] =>
  [dir, ...earlier].map((at) => ({ dir: at, name: INDEX_NAME }))

const empty = (): MontageIndex => ({ version: 1, montages: [] })

const readMontageIndex = async (session: NasSession, dir: string, earlier: string[] = []) =>
  (await findList(session, placesOf(dir, earlier), indexSchema))?.list ?? empty()

const updateMontageIndex = async (
  session: NasSession,
  dir: string,
  change: (index: MontageIndex) => void,
  earlier: string[] = []
) => {
  const places = placesOf(dir, earlier)
  const found = await findList(session, places, indexSchema)
  const index = found?.list ?? empty()
  change(index)
  index.montages.sort((a, b) => b.uploadedAt - a.uploadedAt)
  await writeList(session, places[0]!, index, indexSchema, found?.from)
  return index
}

const lostOnStorage = async (session: NasSession, montages: MontageEntry[]) => {
  const { hostname: host, sessionId: sid } = session
  const live = await listShareLinks(host, sid)
    .then((links) => liveShareLinks(host, links))
    .catch(() => null)
  const links = live
    ? montages.flatMap((t) =>
        t.shareUrl && !live.has(normalizeNasPath(t.folder)) ? [t.folder] : []
      )
    : []
  const folders: string[] = []
  const parents = [...new Set(montages.map((t) => parentOf(normalizeNasPath(t.folder))))]
  await mapWithLimit(parents, LIST_CONCURRENCY, async (parent) => {
    const held = await listNasFolder(host, sid, parent)
      .then((entries) => new Set(entries.map((entry) => entry.name)))
      .catch(() => null)
    if (!held) return
    for (const t of montages)
      if (parentOf(normalizeNasPath(t.folder)) === parent && !held.has(lastSegment(t.folder)))
        folders.push(t.folder)
  })
  return { folders, links: links.filter((folder) => !folders.includes(folder)) }
}

const upsert = (index: MontageIndex, entry: Partial<MontageEntry> & { folder: string }) => {
  const at = index.montages.findIndex((t) => t.folder === entry.folder)
  if (at === -1) {
    index.montages.push(entrySchema.parse(entry))
    return
  }
  const before = index.montages[at]
  const files = entry.files
    ? [
        ...(before?.files ?? []).filter((f) => !entry.files?.some((g) => g.id === f.id)),
        ...entry.files
      ]
    : before?.files
  index.montages[at] = entrySchema.parse({ ...before, ...entry, ...(files ? { files } : {}) })
}

const folderOfUpload = (record: NonNullable<ManifestGroup['uploaded']>) => {
  const withFilm = record.sent?.find((item) => item.holds.includes('film'))
  const first = withFilm?.to[0] ?? record.sent?.[0]?.to[0]
  if (first) return first
  const sent = record.film ?? record.photos
  return sent ? parentOf(sent.remotePath) : null
}

const entryOfMontage = (group: ManifestGroup, listDir?: string | null) => {
  const record = group.uploaded
  const folder = record ? folderOfUpload(record) : null
  if (!record || !folder || !group.passenger) return null
  const firstOriginal = record.originals?.[0]
  const entry: Partial<MontageEntry> & { folder: string } = {
    folder,
    firstname: group.passenger.firstname.trim(),
    lastname: group.passenger.lastname.trim(),
    day: group.day,
    videos: group.files.filter((f) => isVideoFile(f.path)).length,
    photos: group.files.filter((f) => !isVideoFile(f.path)).length,
    uploadedAt: record.at,
    shareUrl: record.shareUrl ?? group.publish?.shareUrl,
    film: record.film?.remotePath,
    photosZip: record.photos?.remotePath,
    backup:
      record.rushes?.remotePath ?? (firstOriginal ? parentOf(firstOriginal.remotePath) : undefined),
    ...(record.sent
      ? {
          items: record.sent.flatMap((item) =>
            item.to.map((dir) => ({
              name: item.name,
              dir,
              size: item.size ?? 0,
              holds: item.holds,
              zip: item.zip ?? item.name.endsWith('.zip')
            }))
          )
        }
      : {}),
    ...(group.freed ? { freedAt: group.freed.at } : {}),
    files: group.files.flatMap((f) =>
      f.id ? [{ id: f.copyOf ?? f.id, filename: f.filename, mtime: f.mtime }] : []
    )
  }
  return { dir: listDir ?? parentOf(folder), entry }
}

export {
  entryOfMontage,
  folderOfUpload,
  INDEX_NAME,
  lostOnStorage,
  readMontageIndex,
  updateMontageIndex,
  upsert
}
export type { MontageEntry, MontageIndex }
