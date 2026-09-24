import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { z } from 'zod'
import { jsonText } from './lib/json'
import { dsmFetch, dsmRequestUrl, normalizeNasPath } from './nas'
import type { NasSession } from './nas'
import { parentOf } from './paths'
import { uploadFile } from './publish'
import { tandemEntrySchema as entrySchema, tandemIndexSchema as indexSchema } from './tandemEntry'
import type { TandemEntry, TandemIndex } from './tandemEntry'
import type { ManifestGroup } from './types'
import { isVideoFile } from './utils'

/* The storage's own list of tandems: one small file in the Tandems folder, one entry per passenger
   folder, saying who it was for, when it went up, where its link, film, photos and backup are, and
   whether the passenger was emailed. It is what lets the board show every tandem the storage holds —
   including the ones freed from this machine, or uploaded from another one.

   Written by read-then-write: the latest file is read, only this tandem's entry is changed, and it is
   written back. Two machines using SkyDock keep each other's entries that way; the only thing that
   can be lost is a change made to the very same tandem at the very same moment. */

const INDEX_NAME = 'skydock-tandems.json'

/* DSM error 408: no such file or folder */
const NOT_THERE = 408

const listingSchema = z.object({ files: z.array(z.object({ name: z.string() })).optional() })

/* Whether the list is there at all, asked of the folder rather than of the file. Asking for a file
   that does not exist is not answered the same way by every NAS — a Synology behind its own proxy
   answers with a 502 page, which cannot be told apart from a real failure — while a folder listing
   says plainly what is in it. A listing that fails is a failure, never "no list": writing a new list
   over one that could not be seen would throw away every entry in it. */
const indexIsThere = async (session: NasSession, dir: string) => {
  const body = await dsmFetch(session.hostname, {
    api: 'SYNO.FileStation.List',
    version: '2',
    method: 'list',
    folder_path: normalizeNasPath(dir),
    filetype: 'file',
    _sid: session.sessionId
  })
  if (!body.success) {
    /* no such folder yet: nothing has been uploaded into it, so there is no list */
    if (body.error?.code === NOT_THERE) return false
    throw new Error(`The storage would not list ${dir} (${body.error?.code}).`)
  }
  const listed = listingSchema.safeParse(body.data)
  if (!listed.success) throw new Error(`The storage's listing of ${dir} cannot be read.`)
  return (listed.data.files ?? []).some((f) => f.name === INDEX_NAME)
}

/* Reads the list off the storage. No file yet is an empty list; a file that is there but cannot be
   read is an error, never an empty list — writing back over it would throw away every entry in it.
   A list not yet in `dir` is read from `earlier`, where it was kept before montages belonged to no
   place, and the first change writes it where it now lives. */
const readTandemIndex = async (
  session: NasSession,
  dir: string,
  earlier?: string | null
): Promise<TandemIndex> => {
  if (!(await indexIsThere(session, dir)))
    return earlier && earlier !== dir
      ? readTandemIndex(session, earlier)
      : { version: 1, tandems: [] }
  const url = dsmRequestUrl(session.hostname, {
    api: 'SYNO.FileStation.Download',
    version: '2',
    method: 'download',
    path: JSON.stringify([normalizeNasPath(`${dir}/${INDEX_NAME}`)]),
    mode: 'download',
    _sid: session.sessionId
  })
  const res = await fetch(url.toString())
  const text = await res.text()
  if (!res.ok) throw new Error(`The storage answered ${res.status} for ${INDEX_NAME}.`)
  const parsed = jsonText.pipe(indexSchema).safeParse(text)
  if (!parsed.success) throw new Error(`${INDEX_NAME} on the storage cannot be read.`)
  return parsed.data
}

/* Read the latest, change what `change` changes, write it back. */
const updateTandemIndex = async (
  session: NasSession,
  dir: string,
  change: (index: TandemIndex) => void,
  earlier?: string | null
) => {
  const index = await readTandemIndex(session, dir, earlier)
  change(index)
  index.tandems.sort((a, b) => b.uploadedAt - a.uploadedAt)
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), `skydock-index-${crypto.randomUUID()}`))
  const local = path.join(staging, INDEX_NAME)
  try {
    fs.writeFileSync(local, JSON.stringify(indexSchema.parse(index), null, 2))
    /* SkyDock's own list, replaced in place: it is the one thing up there that is written over */
    await uploadFile(session.hostname, session.sessionId, dir, local, undefined, {
      overwrite: true
    })
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
  return index
}

/* This tandem's entry replaced, or added; what the change does not mention is kept. The files are
   added to rather than replaced: a passenger with two jumps is one folder and one entry, and the
   second jump's upload must not make the list forget the first one's files. */
const upsert = (index: TandemIndex, entry: Partial<TandemEntry> & { folder: string }) => {
  const at = index.tandems.findIndex((t) => t.folder === entry.folder)
  if (at === -1) {
    index.tandems.push(entrySchema.parse(entry))
    return
  }
  const before = index.tandems[at]
  const files = entry.files
    ? [
        ...(before?.files ?? []).filter((f) => !entry.files?.some((g) => g.id === f.id)),
        ...entry.files
      ]
    : before?.files
  index.tandems[at] = entrySchema.parse({ ...before, ...entry, ...(files ? { files } : {}) })
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
   `listDir`; without one it is the folder above the montage's, where a tandem's always was. Nothing
   that was not uploaded has an entry. */
const entryOfTandem = (group: ManifestGroup, listDir?: string | null) => {
  const record = group.uploaded
  const folder = record ? folderOfUpload(record) : null
  if (!record || !folder || !group.passenger) return null
  const firstOriginal = record.originals?.[0]
  const entry: Partial<TandemEntry> & { folder: string } = {
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
    ...(group.freed ? { freedAt: group.freed.at } : {}),
    /* by what each file contains — for a copy, that is the identity of the file it is a copy of,
       which is the one a scan from nothing gives back */
    files: group.files.flatMap((f) =>
      f.id ? [{ id: f.copyOf ?? f.id, filename: f.filename, mtime: f.mtime }] : []
    )
  }
  return { dir: listDir ?? parentOf(folder), entry }
}

export { entryOfTandem, folderOfUpload, INDEX_NAME, readTandemIndex, updateTandemIndex, upsert }
export type { TandemEntry, TandemIndex }
