import { loadNasSession, normalizeNasPath, saveNasSession } from './nas'
import type { NasSession } from './nas'
import { originIndexSchema as indexSchema } from './originEntry'
import type { OriginEntry, OriginIndex } from './originEntry'
import { parentOf } from './paths'
import { findList, writeList } from './storageList'
import type { ListPlace } from './storageList'
import type { Manifest } from './types'

const INDEX_NAME = 'skydock-origins.json'

const placeFolders = (manifest: Manifest) =>
  (manifest.destinations ?? []).flatMap((place) => (place.path ? [place.path] : []))

const partsOf = (remotePath: string) => normalizeNasPath(remotePath).split('/').filter(Boolean)

const shareOf = (remotePath: string) => {
  const parts = partsOf(remotePath)
  return parts.length > 0 ? `/${parts[0]}` : '/'
}

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
  const above = paths.every((p) => p.length === common.length) ? common.slice(0, -1) : common
  return above.length > 0 ? `/${above.join('/')}` : shareOf(first.join('/'))
}

const listsDirOf = (session: NasSession, folders: string[]) =>
  session.listsDir ?? originsDirOf(folders)

const settleListsDir = async (manifest: Manifest, configDir?: string) => {
  const stored = await loadNasSession(configDir)
  const folders = placeFolders(manifest)
  if (!stored || stored.listsDir || folders.length === 0) return stored
  const settled = { ...stored, listsDir: originsDirOf(folders) }
  await saveNasSession(settled, configDir)
  return settled
}

const placesOf = (session: NasSession, folders: string[]): ListPlace[] => [
  { dir: listsDirOf(session, folders), name: INDEX_NAME },
  { dir: originsDirOf(folders), name: INDEX_NAME }
]

const empty = (): OriginIndex => ({ version: 1, files: {} })

const readOriginIndex = async (session: NasSession, folders: string[]) =>
  (await findList(session, placesOf(session, folders), indexSchema))?.list ?? empty()

const recordOrigins = async (
  session: NasSession,
  folders: string[],
  files: ({ remotePath: string } & OriginEntry)[],
  seen?: { dirs: string[]; paths: string[] }
) => {
  const listed = new Set((seen?.dirs ?? []).map(normalizeNasPath))
  if (files.length === 0 && listed.size === 0) return 0
  const places = placesOf(session, folders)
  const found = await findList(session, places, indexSchema)
  const index = found?.list ?? empty()
  let changed = 0
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
  if (changed > 0) await writeList(session, places[0]!, index, indexSchema, found?.from)
  return changed
}

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
    { dirs: remote.dirs, paths: Object.keys(remote.sizes) }
  )
}

export { learnStorage, originsDirOf, placeFolders, readOriginIndex, recordOrigins, settleListsDir }
