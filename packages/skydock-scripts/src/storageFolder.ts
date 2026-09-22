import { dsmRequestUrl, listNasFiles, normalizeNasPath } from './nas'
import type { NasSession } from './nas'
import type { StorageFile } from './storageEntry'
import type { Manifest } from './types'
import { destBaseOf, targetForGroup } from './upload'
import { getOutputDir, isVideoFile } from './utils'

/* A place on the board is connected to its folder on the storage: a dropzone to the folder its days
   are uploaded into, a passenger to their own. What is up there can be listed and played from the
   board whether or not any of it is still on this machine — a freed tandem, last month's dropzone
   days — because the storage is where the work ends up, and the board is where it is looked for.

   Read-only, all of it. SkyDock never deletes from the storage, and nothing here writes to it. */

const PHOTO = /\.(jpe?g|png|heic|webp|gif)$/i

/* Where a place's folder is on the storage: the very folder its uploads go to, worked out the same
   way the upload works it out — and for a tandem already uploaded, the folder it actually went to,
   which is what stays true if the default folder is changed afterwards. */
const storageDirOf = (
  manifest: Manifest,
  where: { destination?: string; groupId?: string },
  outputDir = getOutputDir()
) => {
  if (where.groupId) {
    const group = manifest.groups.find((g) => g.id === where.groupId)
    if (!group) return null
    const sent = group.uploaded?.film ?? group.uploaded?.photos
    if (sent) return sent.remotePath.slice(0, sent.remotePath.lastIndexOf('/'))
    return targetForGroup(group, outputDir, manifest).remoteDir
  }
  return where.destination ? destBaseOf(where.destination, manifest) : null
}

/* When a delivered file was shot, read off its name: `yverdon_20260913_013417.mp4`, a film named for
   its day alone, `luc_favre_20260802.mp4`, or an archive, `luc_favre_20260802.photos.zip` — the time
   as the machine that named it kept it. The storage's own date is when the file was put there, which
   for a file sent without its date is the upload's day, not the jump's. */
const NAMED_TIME =
  /_(\d{4})(\d{2})(\d{2})(?:_(\d{2})(\d{2})(\d{2}))?(?:_\d+)?(?:\.[a-z]+)?\.[^.]+$/i

const shotFromName = (name: string) => {
  const found = NAMED_TIME.exec(name)
  if (!found) return null
  const [year, month, day, hours, minutes, seconds] = found.slice(1).map((n) => Number(n ?? 0))
  const at = new Date(year!, month! - 1, day!, hours, minutes, seconds)
  /* a name whose digits are not a date is not a date: 20261399 must not become next spring */
  if (at.getFullYear() !== year || at.getMonth() !== month! - 1 || at.getDate() !== day) return null
  return Math.floor(at.getTime() / 1000)
}

const kindOf = (name: string): StorageFile['kind'] =>
  isVideoFile(name) ? 'video' : PHOTO.test(name) ? 'photo' : 'other'

/* What SkyDock keeps on the storage about the storage: the list of tandems and the list of where
   each file came from. They are the app's own bookkeeping, not somebody's footage, so the page that
   lists a folder leaves them out — there is nothing to play, and nothing to do with them here. */
const OWN_RECORDS = new Set(['skydock-tandems.json', 'skydock-origins.json'])

/* the folder's files, films and clips first, each kind newest first — by when it was shot, read off
   its name, or else when it was put there */
const listStorageFolder = async (session: NasSession, dir: string): Promise<StorageFile[]> => {
  const order = { video: 0, photo: 1, other: 2 }
  return (await listNasFiles(session.hostname, session.sessionId, dir))
    .filter((f) => !OWN_RECORDS.has(f.name))
    .map((f) => ({ ...f, kind: kindOf(f.name), shot: shotFromName(f.name) }))
    .sort(
      (a, b) =>
        order[a.kind] - order[b.kind] ||
        (b.shot ?? b.mtime ?? 0) - (a.shot ?? a.mtime ?? 0) ||
        b.name.localeCompare(a.name)
    )
}

/* The folders SkyDock uploads into, which are the only ones a file is ever opened from: each
   place's own, and the backup folder. */
const withinStorage = (manifest: Manifest, session: NasSession, filePath: string) => {
  const target = normalizeNasPath(filePath)
  const roots = [session.backupFolder, ...(manifest.destinations ?? []).map((d) => d.path)].flatMap(
    (root) => (root ? [normalizeNasPath(root)] : [])
  )
  return !target.includes('/../') && roots.some((root) => target.startsWith(`${root}/`))
}

/* One file off the storage, as the storage sends it. The byte range the player asks for is passed
   on and the partial answer passed back, which is what lets a film be scrubbed without first being
   downloaded whole. */
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
