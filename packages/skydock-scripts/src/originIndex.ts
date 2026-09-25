import { loadNasSession, normalizeNasPath, saveNasSession } from './nas'
import type { NasSession } from './nas'
import { originIndexSchema as indexSchema } from './originEntry'
import type { OriginEntry, OriginIndex } from './originEntry'
import { parentOf } from './paths'
import { findList, writeList } from './storageList'
import type { ListPlace } from './storageList'
import type { Manifest } from './types'

/* Where every file on the storage came from: one small list, one entry per file SkyDock has put up
   there, saying which original it was made from, what it weighed and what it was cut to.

   It is there because every name changes on the way out. A clip delivered as
   `yverdon_20260920_100250.mp4` is made from `DJI_20260920100249_0088_D.MP4`, and the same footage
   is delivered under another name the moment a passenger is renamed or a jump is filed elsewhere.
   Only this machine's registry ties the two together, and only until it is lost; the list says it on
   the storage itself, where any machine can read it — so the same seconds never go up twice.

   Written by read-then-write, as the list of montages is: the latest is read, what this upload
   changes is changed, and it is written back. Two machines keep each other's entries that way. */

const INDEX_NAME = 'skydock-origins.json'

/* The destinations' own folders, which are the club's folders, and every folder SkyDock delivers
   into: a montage's film and its backups go into destinations too. The list of origins is kept above
   these and never in one of them, and what is found in any of them goes in it. */
const placeFolders = (manifest: Manifest) =>
  (manifest.destinations ?? []).flatMap((place) => (place.path ? [place.path] : []))

const deliveryFolders = (manifest: Manifest) => placeFolders(manifest)

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

/* Where the storage's lists live: worked out once, from the folders there are the first time the
   storage is used, and kept with the connection. A destination added later whose folder sits
   elsewhere must not move them — a list that moved would start again empty, and forget everything
   it knew. */
const listsDirOf = (session: NasSession, folders: string[]) =>
  session.listsDir ?? originsDirOf(folders)

/* the place fixed now, if it was not yet; nothing to fix while no place has a folder */
const settleListsDir = (manifest: Manifest, configDir?: string) => {
  const stored = loadNasSession(configDir)
  const folders = placeFolders(manifest)
  if (!stored || stored.listsDir || folders.length === 0) return stored
  const settled = { ...stored, listsDir: originsDirOf(folders) }
  saveNasSession(settled, configDir)
  return settled
}

/* its own place, then the one worked out from today's folders, where it was kept before its place
   was fixed */
const placesOf = (session: NasSession, folders: string[]): ListPlace[] => [
  { dir: listsDirOf(session, folders), name: INDEX_NAME },
  { dir: originsDirOf(folders), name: INDEX_NAME }
]

const empty = (): OriginIndex => ({ version: 1, files: {} })

/* Reads the list off the storage. No file yet is an empty list, which sends a file rather than
   skipping it — the safe way to be wrong. A file that is there but cannot be read is an error,
   never an empty list. */
const readOriginIndex = async (session: NasSession, folders: string[]) =>
  (await findList(session, placesOf(session, folders), indexSchema))?.list ?? empty()

/* What an upload leaves behind: read the latest list, put this job's files in it, write it back.
   Entries are replaced by path and everything else is kept, so two machines, two dropzones and a
   tandem's parcels all add to the same list rather than replacing one another — and a tandem whose
   backup lives on another share writes to that share's list too, since that is where the reading
   will look for it. */
const recordOrigins = async (
  session: NasSession,
  folders: string[],
  files: ({ remotePath: string } & OriginEntry)[],
  /* The folders whose listing just came back, and every file they held. What the list says of a
     file in one of them that the listing no longer shows is dropped: somebody deleted it over
     there, and a list that went on saying it was up would stop it ever being sent again. Folders
     that were not listed — another machine's, or one the storage did not answer for — are left
     exactly as they are. */
  seen?: { dirs: string[]; paths: string[] }
) => {
  const listed = new Set((seen?.dirs ?? []).map(normalizeNasPath))
  if (files.length === 0 && listed.size === 0) return 0
  const places = placesOf(session, folders)
  const found = await findList(session, places, indexSchema)
  const index = found?.list ?? empty()
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
  const there = new Set([
    ...(seen?.paths ?? []).map(normalizeNasPath),
    ...files.map((file) => normalizeNasPath(file.remotePath))
  ])
  for (const where of Object.keys(index.files))
    if (listed.has(parentOf(where)) && !there.has(where)) {
      delete index.files[where]
      changed++
    }
  /* a list that says what it already said is not written again */
  if (changed > 0) await writeList(session, places[0]!, index, indexSchema, found?.from)
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
  remote: { dirs: string[]; sizes: Record<string, number | null> }
) => {
  const at = Math.floor(Date.now() / 1000)
  return await recordOrigins(
    session,
    placeFolders(manifest),
    Object.entries(remote.sizes).flatMap(([remotePath, size]) =>
      size === null ? [] : [{ remotePath, size, at }]
    ),
    /* and what is no longer in the folders that answered is forgotten */
    { dirs: remote.dirs, paths: Object.keys(remote.sizes) }
  )
}

export {
  deliveryFolders,
  INDEX_NAME,
  learnStorage,
  listsDirOf,
  originsDirOf,
  placeFolders,
  readOriginIndex,
  recordOrigins,
  settleListsDir
}
export type { OriginEntry, OriginIndex }
