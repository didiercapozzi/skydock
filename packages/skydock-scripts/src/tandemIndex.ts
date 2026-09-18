import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { z } from 'zod'
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
    /* no Tandems folder yet: nothing has been uploaded into it, so there is no list */
    if (body.error?.code === NOT_THERE) return false
    throw new Error(`The storage would not list ${dir} (${body.error?.code}).`)
  }
  const listed = listingSchema.safeParse(body.data)
  if (!listed.success) throw new Error(`The storage's listing of ${dir} cannot be read.`)
  return (listed.data.files ?? []).some((f) => f.name === INDEX_NAME)
}

/* Reads the list off the storage. No file yet is an empty list; a file that is there but cannot be
   read is an error, never an empty list — writing back over it would throw away every entry in it. */
const readTandemIndex = async (session: NasSession, dir: string): Promise<TandemIndex> => {
  if (!(await indexIsThere(session, dir))) return { version: 1, tandems: [] }
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
  const parsed = (() => {
    try {
      return indexSchema.safeParse(JSON.parse(text))
    } catch {
      return null
    }
  })()
  if (!parsed?.success) throw new Error(`${INDEX_NAME} on the storage cannot be read.`)
  return parsed.data
}

/* Read the latest, change what `change` changes, write it back. */
const updateTandemIndex = async (
  session: NasSession,
  dir: string,
  change: (index: TandemIndex) => void
) => {
  const index = await readTandemIndex(session, dir)
  change(index)
  index.tandems.sort((a, b) => b.uploadedAt - a.uploadedAt)
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), `skydock-index-${crypto.randomUUID()}`))
  const local = path.join(staging, INDEX_NAME)
  try {
    fs.writeFileSync(local, JSON.stringify(indexSchema.parse(index), null, 2))
    await uploadFile(session.hostname, session.sessionId, dir, local)
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

/* A tandem's entry, from what its upload recorded: the passenger's folder is where the film and the
   photos went, and the list lives in the folder above it — the Tandems folder. Nothing that was not
   uploaded has an entry. */
const entryOfTandem = (group: ManifestGroup) => {
  const record = group.uploaded
  const sent = record?.film ?? record?.photos
  if (!record || !sent || !group.passenger) return null
  const folder = parentOf(sent.remotePath)
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
    files: group.files.flatMap((f) =>
      f.id ? [{ id: f.id, filename: f.filename, mtime: f.mtime }] : []
    )
  }
  return { dir: parentOf(folder), entry }
}

export { entryOfTandem, INDEX_NAME, readTandemIndex, updateTandemIndex, upsert }
export type { TandemEntry, TandemIndex }
