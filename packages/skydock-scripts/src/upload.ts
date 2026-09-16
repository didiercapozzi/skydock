import * as fs from 'node:fs'
import * as path from 'node:path'
import { getDestinationDir, getGroupProcessedDir, isFlatGroup } from './process'
import { publishJump } from './publish'
import type { CheckProgress, UploadProgress, UploadVerdict } from './publish'
import { listNasFiles } from './nas'
import type { NasSession } from './nas'
import { mapWithLimit } from './utils'
import type { Manifest, ManifestGroup } from './types'
import { resolveDestinationPath } from './workspace'

type UploadScope = { groupId?: string; groupIds?: string[]; destination?: string }

type UploadTarget = {
  key: string
  label: string
  localDir: string
  /* null means no NAS folder could be resolved — reported to the user, never guessed at */
  remoteDir: string | null
  destination: string | null
  groupIds: string[]
  /* set when the folder holds more than this target should receive; unset sends the whole folder */
  files?: string[]
  /* false for a folder nobody is given a link to, such as the rushes backup */
  share?: boolean
}

const LIST_CONCURRENCY = 4

const dirOfRemote = (remotePath: string) => {
  const cut = remotePath.lastIndexOf('/')
  return cut <= 0 ? '/' : remotePath.slice(0, cut)
}

/* What the NAS holds right now in the folders we have uploaded into, so a file deleted over there
   stops reading as uploaded. The folders come from the upload records themselves, not from the
   destination list — a tandem lives in `{destination}/{Passenger}/`, which listing the destination
   would miss. `listNasFiles` answers [] both for an empty folder and for a call that failed, so a
   folder only counts as checked when its listing came back: an unchecked folder demotes nothing. */
const listRemoteFiles = async (manifest: Manifest, session: NasSession) => {
  const wanted = [
    ...new Set(
      manifest.files.flatMap((f) => (f.uploaded ? [dirOfRemote(f.uploaded.remotePath)] : []))
    )
  ]
  const sizes: Record<string, number | null> = {}
  const dirs: string[] = []
  await mapWithLimit(wanted, LIST_CONCURRENCY, async (dir) => {
    try {
      const entries = await listNasFiles(session.hostname, session.sessionId, dir)
      dirs.push(dir)
      for (const entry of entries) sizes[`${dir}/${entry.name}`] = entry.size
    } catch {
      /* left out of `dirs`, so nothing in it is demoted */
    }
  })
  return { dirs, sizes, at: Math.floor(Date.now() / 1000) }
}

const scopeKey = (scope: UploadScope) => {
  if (scope.destination) return `dest:${scope.destination}`
  const ids = scope.groupIds ?? (scope.groupId ? [scope.groupId] : [])
  return `group:${ids.join('+')}`
}

const groupsInScope = (manifest: Manifest, scope: UploadScope) => {
  if (scope.destination) return manifest.groups.filter((g) => g.destination === scope.destination)
  const ids = new Set(scope.groupIds ?? (scope.groupId ? [scope.groupId] : []))
  return manifest.groups.filter((g) => ids.has(g.id))
}

/* A group carrying a destination is the truth; the destinations list is only where custom paths
   live. A destination missing from that list (never given a path, or added by a drop) therefore
   behaves like a path-less one instead of becoming unuploadable. */
const destBaseOf = (
  destination: string | undefined,
  manifest: Manifest,
  defaultFolder: string | null
) =>
  resolveDestinationPath(destination, manifest.destinations ?? [], defaultFolder) ??
  (destination && defaultFolder ? `${defaultFolder}/${destination}` : null)

/* Where one group's processed folder goes on the NAS.
   A flat fun jump has NO folder of its own: `getGroupProcessedDir` hands back the whole
   destination folder, shared by every day ever shot there, so appending the group's base name
   would upload all those days into a folder named after one jump (and share the wrong folder). */
const targetForGroup = (
  group: ManifestGroup,
  outputDir: string,
  manifest: Manifest,
  defaultFolder: string | null
): UploadTarget => {
  const { dir } = getGroupProcessedDir(outputDir, group)
  const destination = group.destination ?? null
  const base = destination ? destBaseOf(destination, manifest, defaultFolder) : defaultFolder
  const flat = isFlatGroup(group)
  return {
    key: `group:${group.id}`,
    label: group.label,
    localDir: dir,
    remoteDir: base === null ? null : flat ? base : `${base}/${path.basename(dir)}`,
    destination,
    groupIds: [group.id]
  }
}

/* One target per remote folder. Two fun jumps filed to the same destination share a folder both
   locally and on the NAS, so they are one upload, not two of the same folder. */
const dedupeTargets = (targets: UploadTarget[]) => {
  const byRemote = new Map<string, UploadTarget>()
  const unresolved: UploadTarget[] = []
  for (const target of targets) {
    if (target.remoteDir === null) {
      unresolved.push(target)
      continue
    }
    const existing = byRemote.get(target.remoteDir)
    if (existing) {
      existing.groupIds = [...new Set([...existing.groupIds, ...target.groupIds])]
      continue
    }
    byRemote.set(target.remoteDir, { ...target })
  }
  return [...byRemote.values(), ...unresolved]
}

const resolveUploadTargets = ({
  outputDir,
  manifest,
  defaultFolder,
  scope
}: {
  outputDir: string
  manifest: Manifest
  defaultFolder: string | null
  scope: UploadScope
}) => {
  const groups = groupsInScope(manifest, scope)
  const targets = groups.map((g) => targetForGroup(g, outputDir, manifest, defaultFolder))
  /* a destination can also hold lone files, which belong to no group and would otherwise
     never be uploaded at all */
  if (scope.destination) {
    const hasLone = manifest.files.some((f) => f.destination === scope.destination)
    if (hasLone) {
      const base = destBaseOf(scope.destination, manifest, defaultFolder)
      targets.push({
        key: `dest:${scope.destination}`,
        label: scope.destination,
        localDir: getDestinationDir(outputDir, scope.destination),
        remoteDir: base,
        destination: scope.destination,
        groupIds: []
      })
    }
  }
  return dedupeTargets(targets)
}

/* Uploads a set of targets as one job: the file counter runs across all of them, so a destination
   upload reads `12 / 571`, not `12 / 40` restarting per group. The manifest is not saved here — the
   caller owns that. */
const uploadTargets = async ({
  outputDir,
  session,
  targets,
  onProgress,
  onCheck
}: {
  outputDir: string
  session: NasSession
  targets: UploadTarget[]
  onProgress?: (progress: UploadProgress & { groupIds: string[] }) => void
  onCheck?: (progress: CheckProgress) => void
}) => {
  if (targets.length === 0) throw new Error('Nothing to upload yet — process it first.')
  const missing = targets.find((t) => t.remoteDir === null)
  if (missing)
    throw new Error(
      missing.destination
        ? `Choose a NAS folder for ${missing.destination}, or set a default upload folder.`
        : 'Choose an upload folder first.'
    )
  const absent = targets.find((t) => !fs.existsSync(t.localDir))
  if (absent) throw new Error(`Processed files not found for ${absent.label}. Process it again.`)

  const shareUrls: { target: UploadTarget; shareUrl: string }[] = []
  const files: UploadVerdict[] = []
  let uploaded = 0
  let skipped = 0
  for (const target of targets) {
    const result = await publishJump(
      {
        host: session.hostname,
        user: session.username,
        password: '',
        localDir: target.localDir,
        remoteDir: target.remoteDir as string,
        outputDir,
        files: target.files,
        share: target.share
      },
      {
        onProgress: (progress) => onProgress?.({ ...progress, groupIds: target.groupIds }),
        onCheck
      }
    )
    if (result.shareUrl) shareUrls.push({ target, shareUrl: result.shareUrl })
    files.push(...result.files)
    uploaded += result.uploaded
    skipped += result.skipped
  }
  return { targets, shareUrls, uploaded, skipped, files }
}

const uploadScope = async ({
  outputDir,
  manifest,
  session,
  scope,
  onProgress,
  onCheck
}: {
  outputDir: string
  manifest: Manifest
  session: NasSession
  scope: UploadScope
  onProgress?: (progress: UploadProgress & { groupIds: string[] }) => void
  onCheck?: (progress: CheckProgress) => void
}) =>
  uploadTargets({
    outputDir,
    session,
    targets: resolveUploadTargets({
      outputDir,
      manifest,
      defaultFolder: session.defaultFolder ?? null,
      scope
    }),
    onProgress,
    onCheck
  })

export {
  groupsInScope,
  listRemoteFiles,
  resolveUploadTargets,
  scopeKey,
  targetForGroup,
  uploadScope,
  uploadTargets
}
export type { UploadScope, UploadTarget }
