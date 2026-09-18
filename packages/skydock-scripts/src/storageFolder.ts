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
  defaultFolder: string | null,
  where: { destination?: string; groupId?: string },
  outputDir = getOutputDir()
) => {
  if (where.groupId) {
    const group = manifest.groups.find((g) => g.id === where.groupId)
    if (!group) return null
    const sent = group.uploaded?.film ?? group.uploaded?.photos
    if (sent) return sent.remotePath.slice(0, sent.remotePath.lastIndexOf('/'))
    return targetForGroup(group, outputDir, manifest, defaultFolder).remoteDir
  }
  return where.destination ? destBaseOf(where.destination, manifest, defaultFolder) : null
}

const kindOf = (name: string): StorageFile['kind'] =>
  isVideoFile(name) ? 'video' : PHOTO.test(name) ? 'photo' : 'other'

/* the folder's files, films and clips first, each kind by name — which is by time, since a
   delivered file is named after when it was shot */
const listStorageFolder = async (session: NasSession, dir: string): Promise<StorageFile[]> => {
  const order = { video: 0, photo: 1, other: 2 }
  return (await listNasFiles(session.hostname, session.sessionId, dir))
    .map((f) => ({ ...f, kind: kindOf(f.name) }))
    .sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name))
}

/* The folders SkyDock uploads into, which are the only ones a file is ever opened from: the
   default folder, each dropzone's own, and the backup folder. */
const withinStorage = (manifest: Manifest, session: NasSession, filePath: string) => {
  const target = normalizeNasPath(filePath)
  const roots = [
    session.defaultFolder,
    session.backupFolder,
    ...(manifest.destinations ?? []).map((d) => d.path)
  ].flatMap((root) => (root ? [normalizeNasPath(root)] : []))
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

export { listStorageFolder, openStorageFile, storageDirOf, withinStorage }
