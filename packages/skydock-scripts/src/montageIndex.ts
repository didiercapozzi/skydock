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

/* The storage's own list of montages: one small file beside the list of what the storage holds, one
   entry per montage folder. What the storage can say for itself — which files are there, whether a
   link still works — is asked of the storage; the list keeps what it cannot: who a montage was for,
   whether the passenger was emailed and at which address, that it was freed from the machine that
   made it, and which files it was made of. That last is what puts a montage back on a board that has
   forgotten it, on this machine or another.

   Written by read-then-write: the latest file is read, only this montage's entry is changed, and it
   is written back. Two machines using SkyDock keep each other's entries that way; the only thing
   that can be lost is a change made to the very same montage at the very same moment. */

const INDEX_NAME = 'skydock-montages.json'

/* its own place first, then each place it was kept before */
const placesOf = (dir: string, earlier: string[]): ListPlace[] =>
  [dir, ...earlier].map((at) => ({ dir: at, name: INDEX_NAME }))

const empty = (): MontageIndex => ({ version: 1, montages: [] })

/* Reads the list off the storage. No file yet is an empty list; a file that is there but cannot be
   read is an error, never an empty list — writing back over it would throw away every entry in it. */
const readMontageIndex = async (session: NasSession, dir: string, earlier: string[] = []) =>
  (await findList(session, placesOf(dir, earlier), indexSchema))?.list ?? empty()

/* Read the latest, change what `change` changes, write it back — always to its own place under its
   own name, and a list found anywhere else is put away once it has been. */
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

/* What the storage says now of the montages its list names: which folders it no longer holds, and
   which no longer have a live link. One question for every link, and one listing per folder the
   montages sit in, never one per montage. Only what the storage answered counts: a question that
   failed takes nothing away. */
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
  /* a folder that is gone has no link either, and is said to be gone rather than unlinked */
  return { folders, links: links.filter((folder) => !folders.includes(folder)) }
}

/* This montage's entry replaced, or added; what the change does not mention is kept. The files are
   added to rather than replaced: a passenger with two jumps is one folder and one entry, and the
   second jump's upload must not make the list forget the first one's files. */
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

/* The folder a montage is known by on the list: the one its film went to, which is the one with the
   share link — or, when the film went up inside a zip or not at all, the first folder anything went
   to. An older record, from before a montage chose where things go, knows its film and photos only. */
const folderOfUpload = (record: NonNullable<ManifestGroup['uploaded']>) => {
  const withFilm = record.sent?.find((item) => item.holds.includes('film'))
  const first = withFilm?.to[0] ?? record.sent?.[0]?.to[0]
  if (first) return first
  const sent = record.film ?? record.photos
  return sent ? parentOf(sent.remotePath) : null
}

/* A montage's entry, from what its upload recorded. The list lives above every destination's folder,
   `listDir`; without one it is the folder above the montage's, where a montage's always was. Nothing
   that was not uploaded has an entry. */
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
    /* by what each file contains — for a copy, that is the identity of the file it is a copy of,
       which is the one a scan from nothing gives back */
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
