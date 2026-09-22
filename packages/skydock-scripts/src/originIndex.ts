import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { z } from 'zod'
import { jsonText } from './lib/json'
import { dsmFetch, dsmRequestUrl, normalizeNasPath } from './nas'
import type { NasSession } from './nas'
import { originIndexSchema as indexSchema } from './originEntry'
import type { OriginEntry, OriginIndex } from './originEntry'
import { uploadFile } from './publish'
import type { Manifest } from './types'

/* Where every file on the storage came from: one small list, one entry per file SkyDock has put up
   there, saying which original it was made from, what it weighed and what it was cut to.

   It is there because every name changes on the way out. A clip delivered as
   `yverdon_20260920_100250.mp4` is made from `DJI_20260920100249_0088_D.MP4`, and the same footage
   is delivered under another name the moment a passenger is renamed or a jump is filed elsewhere.
   Only this machine's registry ties the two together, and only until it is lost; the list says it on
   the storage itself, where any machine can read it — so the same seconds never go up twice.

   Written by read-then-write, as the list of tandems is: the latest is read, what this upload
   changes is changed, and it is written back. Two machines keep each other's entries that way. */

const INDEX_NAME = 'skydock-origins.json'

/* DSM error 408: no such file or folder */
const NOT_THERE = 408

const listingSchema = z.object({ files: z.array(z.object({ name: z.string() })).optional() })

/* The places' own folders, which are the club's folders: each dropzone's, and the one the
   passengers' folders sit in. The list of origins is kept above these and never in one of them.

   The backup folder is deliberately not one of them. It is often somewhere else entirely — another
   disk, another share — and letting it have a say would drag the list up to the top of a share to
   reach them both, which is where nobody would look for it. */
const placeFolders = (manifest: Manifest) =>
  (manifest.destinations ?? []).flatMap((place) => (place.path ? [place.path] : []))

/* Every folder SkyDock delivers into, the backup one included: all of them are worth looking at,
   and what is found in any of them goes in the list, wherever the list itself lives. */
const deliveryFolders = (manifest: Manifest, session: NasSession) => [
  ...placeFolders(manifest),
  ...(session.backupFolder ? [session.backupFolder] : [])
]

const partsOf = (remotePath: string) => normalizeNasPath(remotePath).split('/').filter(Boolean)

/* The share a path is in, which is the first part of it: there is no file at the top of a NAS — `/`
   is not a folder but the list of shares — so this is the shallowest folder anything can be written
   to, and every path on the storage has one. */
const shareOf = (remotePath: string) => {
  const parts = partsOf(remotePath)
  return parts.length > 0 ? `/${parts[0]}` : '/'
}

/* Where the list lives: the folder that holds every folder SkyDock delivers into. A club keeps its
   dropzones, its passengers and its backup under one folder of the storage, and that folder is the
   one place a list of what is in all of them belongs — not at the top of a share beside everything
   else somebody keeps there, and never inside a delivered folder, which a passenger's link opens.

   It is worked out from the folders themselves rather than chosen, so reading and writing always
   agree: the deepest folder above all of them, one step further up if that is a delivered folder
   itself, and the share when they have nothing else in common. */
const originsDirOf = (folders: string[]) => {
  const paths = folders.filter(Boolean).map(partsOf)
  const first = paths[0]
  if (!first) return '/'
  const common: string[] = []
  for (let at = 0; at < first.length; at++) {
    const segment = first[at]
    if (segment === undefined || !paths.every((p) => p[at] === segment)) break
    common.push(segment)
  }
  /* every folder was the same one: the list goes above it rather than inside it */
  const above = paths.every((p) => p.length === common.length) ? common.slice(0, -1) : common
  return above.length > 0 ? `/${above.join('/')}` : shareOf(first.join('/'))
}

/* Whether the list is there at all, asked of the folder rather than of the file: asking for a file
   that does not exist is not answered the same way by every NAS, while a folder listing says plainly
   what is in it. A listing that fails is a failure, never "no list" — writing a new list over one
   that could not be seen would throw away every entry in it. */
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
    /* nothing has ever been uploaded into it, so there is no list */
    if (body.error?.code === NOT_THERE) return false
    throw new Error(`The storage would not list ${dir} (${body.error?.code}).`)
  }
  const listed = listingSchema.safeParse(body.data)
  if (!listed.success) throw new Error(`The storage's listing of ${dir} cannot be read.`)
  return (listed.data.files ?? []).some((f) => f.name === INDEX_NAME)
}

const empty = (): OriginIndex => ({ version: 1, files: {} })

/* Reads the list off the storage. No file yet is an empty list, which sends a file rather than
   skipping it — the safe way to be wrong. A file that is there but cannot be read is an error,
   never an empty list. */
const readOriginIndex = async (session: NasSession, folders: string[]) => {
  const dir = originsDirOf(folders)
  if (!(await indexIsThere(session, dir))) return empty()
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

const writeIndex = async (session: NasSession, dir: string, index: OriginIndex) => {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), `skydock-origins-${crypto.randomUUID()}`))
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
}

/* What an upload leaves behind: read the latest list, put this job's files in it, write it back.
   Entries are replaced by path and everything else is kept, so two machines, two dropzones and a
   tandem's parcels all add to the same list rather than replacing one another — and a tandem whose
   backup lives on another share writes to that share's list too, since that is where the reading
   will look for it. */
const recordOrigins = async (
  session: NasSession,
  folders: string[],
  files: ({ remotePath: string } & OriginEntry)[]
) => {
  if (files.length === 0) return 0
  const dir = originsDirOf(folders)
  const index = await readOriginIndex(session, folders)
  let changed = 0
  /* what is known about a file is added to, never taken away: a file merely seen in a listing must
     not forget the digest or the origin an earlier upload proved of it */
  for (const { remotePath, ...entry } of files) {
    const where = normalizeNasPath(remotePath)
    const before = index.files[where]
    const after = { ...before, ...entry }
    if (JSON.stringify(before) === JSON.stringify(after)) continue
    index.files[where] = after
    changed++
  }
  /* a list that says what it already said is not written again */
  if (changed > 0) await writeIndex(session, dir, index)
  return changed
}

/* What the storage was seen to hold, written into its own list — the board asks it what is in those
   folders every time it opens, so what is found there is written down whether SkyDock put it there
   or not, with what it weighs and nothing else. Nothing is fetched and nothing is hashed for this: a
   digest is asked for only when it would decide something, and then it is kept. A list that says
   what it already said is not written again, so opening the board over and over costs one question
   and no writing at all. */
const learnStorage = async (
  manifest: Manifest,
  session: NasSession,
  sizes: Record<string, number | null>
) => {
  const at = Math.floor(Date.now() / 1000)
  return await recordOrigins(
    session,
    placeFolders(manifest),
    Object.entries(sizes).flatMap(([remotePath, size]) =>
      size === null ? [] : [{ remotePath, size, at }]
    )
  )
}

export {
  deliveryFolders,
  INDEX_NAME,
  learnStorage,
  originsDirOf,
  placeFolders,
  readOriginIndex,
  recordOrigins
}
export type { OriginEntry, OriginIndex }
