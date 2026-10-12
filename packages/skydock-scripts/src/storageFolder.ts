import { dsmRequestUrl, listNasFiles, normalizeNasPath } from './nas'
import type { NasSession } from './nas'
import type { StorageFile } from './storageEntry'
import { folderOfUpload } from './montageIndex'
import type { Manifest } from './types'
import { destBaseOf, targetForGroup } from './upload'
import { getOutputDir, isVideoFile } from './utils'

const PHOTO = /\.(jpe?g|png|heic|webp|gif)$/i

const storageDirOf = (
  manifest: Manifest,
  where: { destination?: string; groupId?: string },
  outputDir = getOutputDir()
) => {
  if (where.groupId) {
    const group = manifest.groups.find((g) => g.id === where.groupId)
    if (!group) return null
    if (group.uploaded) return folderOfUpload(group.uploaded)
    return targetForGroup(group, outputDir, manifest).remoteDir
  }
  return where.destination ? destBaseOf(where.destination, manifest) : null
}

const NAMED_TIME =
  /_(\d{4})(\d{2})(\d{2})(?:_(\d{2})(\d{2})(\d{2}))?(?:_\d+)?(?:\.[a-z]+)?\.[^.]+$/i

const shotFromName = (name: string) => {
  const found = NAMED_TIME.exec(name)
  if (!found) return null
  const [year, month, day, hours, minutes, seconds] = found.slice(1).map((n) => Number(n ?? 0))
  const at = new Date(year!, month! - 1, day!, hours, minutes, seconds)
  if (at.getFullYear() !== year || at.getMonth() !== month! - 1 || at.getDate() !== day) return null
  return Math.floor(at.getTime() / 1000)
}

const kindOf = (name: string): StorageFile['kind'] =>
  isVideoFile(name) ? 'video' : PHOTO.test(name) ? 'photo' : 'other'

const KIND_ORDER = { video: 0, photo: 1, other: 2 }

const OWN_RECORDS = new Set(['skydock-montages.json', 'skydock-origins.json'])

const listStorageFolder = async (
  session: NasSession,
  dir: string,
  links?: Map<string, { url: string }>
): Promise<StorageFile[]> => {
  return (await listNasFiles(session.hostname, session.sessionId, dir))
    .filter((f) => !OWN_RECORDS.has(f.name))
    .map((f) => ({
      ...f,
      kind: kindOf(f.name),
      shot: shotFromName(f.name),
      shareUrl: links?.get(normalizeNasPath(f.path))?.url ?? null
    }))
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        (b.shot ?? b.mtime ?? 0) - (a.shot ?? a.mtime ?? 0) ||
        b.name.localeCompare(a.name)
    )
}

const withinStorage = (manifest: Manifest, session: NasSession, filePath: string) => {
  const target = normalizeNasPath(filePath)
  const roots = [session.backupFolder, ...(manifest.destinations ?? []).map((d) => d.path)].flatMap(
    (root) => (root ? [normalizeNasPath(root)] : [])
  )
  return !target.includes('/../') && roots.some((root) => target.startsWith(`${root}/`))
}

const openStorageFile = (session: NasSession, filePath: string, range?: string | null) =>
  fetch(
    dsmRequestUrl(session.hostname, {
      api: 'SYNO.FileStation.Download',
      version: '2',
      method: 'download',
      path: JSON.stringify([normalizeNasPath(filePath)]),
      mode: 'open',
      _sid: session.sessionId
    }).toString(),
    range ? { headers: { Range: range } } : {}
  )

export { listStorageFolder, openStorageFile, shotFromName, storageDirOf, withinStorage }
