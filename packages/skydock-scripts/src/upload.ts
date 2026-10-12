import { pathExists, walkFiles } from './lib/fs'
import * as path from 'node:path'
import { getDestinationDir, getGroupProcessedDir, isFlatGroup } from './process'
import { parentOf } from './paths'
import { remoteMatches } from './fileStatus'
import type { RemoteListing } from './fileStatus'
import { originsDirOf, placeFolders, readOriginIndex, recordOrigins } from './originIndex'
import { originsOf } from './originEntry'
import type { OriginIndex } from './originEntry'
import { checkJump, publishJump, refuseTaken } from './publish'
import type {
  Checked,
  CheckProgress,
  PlanProgress,
  Seen,
  UploadProgress,
  UploadVerdict
} from './publish'
import { listNasFiles } from './nas'
import { isNamedMontage } from './montageArtifacts'
import type { NasSession } from './nas'
import { messageOf } from './lib/words'
import { mapWithLimit } from './utils'
import type { Manifest, ManifestGroup } from './types'
import { resolveDestinationPath } from './workspace'
import { stopIfUploadCancelled } from './uploading'

type UploadScope = { groupId?: string; groupIds?: string[]; destination?: string }

type UploadTarget = {
  key: string
  label: string
  localDir: string
  remoteDir: string | null
  destination: string | null
  groupIds: string[]
  files?: string[]
  share?: boolean
}

const LIST_CONCURRENCY = 4

const uploadedFiles = (record: ManifestGroup['uploaded']) =>
  record
    ? [
        ...new Map(
          [
            record.film,
            record.photos,
            record.rushes,
            ...(record.originals ?? []),
            ...(record.photoFiles ?? [])
          ]
            .filter((f) => f !== undefined)
            .map((f) => [f.remotePath, f])
        ).values()
      ]
    : []

const listRemoteFiles = async (manifest: Manifest, session: NasSession) => {
  const wanted = [
    ...new Set([
      ...manifest.files.flatMap((f) => (f.uploaded ? [parentOf(f.uploaded.remotePath)] : [])),
      ...manifest.groups.flatMap((g) =>
        uploadedFiles(g.uploaded).map((f) => parentOf(f.remotePath))
      ),
      ...manifest.groups.flatMap((g) => g.uploaded?.sent?.flatMap((item) => item.to) ?? []),
      ...placeFolders(manifest)
    ])
  ]
  const sizes: Record<string, number | null> = {}
  const dirs: string[] = []
  await mapWithLimit(wanted, LIST_CONCURRENCY, async (dir) => {
    try {
      const entries = await listNasFiles(session.hostname, session.sessionId, dir)
      dirs.push(dir)
      for (const entry of entries) sizes[`${dir}/${entry.name}`] = entry.size
    } catch {}
  })
  return { dirs, sizes, at: Math.floor(Date.now() / 1000) }
}

const goneFromStorage = (
  record: ManifestGroup['uploaded'],
  remote: { dirs: string[]; sizes: Record<string, number | null> } | null
) =>
  remote
    ? uploadedFiles(record).filter((f) => {
        if (!remote.dirs.includes(parentOf(f.remotePath))) return false
        const size = remote.sizes[f.remotePath]
        return size === undefined || (size !== null && size !== f.size)
      })
    : []

const goneSent = (
  record: ManifestGroup['uploaded'],
  remote: { dirs: string[]; sizes: Record<string, number | null> } | null
) =>
  remote
    ? (record?.sent ?? []).flatMap((item) =>
        item.to
          .filter((dir) => {
            const at = `${dir}/${item.name}`
            return item.name.endsWith('/')
              ? remote.dirs.includes(at.slice(0, -1)) &&
                  !Object.keys(remote.sizes).some((key) => key.startsWith(at))
              : remote.dirs.includes(dir) && remote.sizes[at] === undefined
          })
          .map((dir) => `${dir}/${item.name}`)
      )
    : []

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

const destBaseOf = (destination: string | undefined, manifest: Manifest) =>
  resolveDestinationPath(destination, manifest.destinations ?? [])

const montagesRemoteDir = (manifest: Manifest, session: NasSession) => {
  const folders = placeFolders(manifest)
  return session.listsDir ?? (folders.length > 0 ? originsDirOf(folders) : null)
}

const earlierMontagesDirs = (manifest: Manifest) => {
  const folders = placeFolders(manifest)
  return folders.length > 0 ? [originsDirOf(folders)] : []
}

const targetForGroup = (
  group: ManifestGroup,
  outputDir: string,
  manifest: Manifest
): UploadTarget => {
  const { dir } = getGroupProcessedDir(outputDir, group)
  const destination = group.destination ?? null
  const flat = isFlatGroup(group)
  const base = destination ? destBaseOf(destination, manifest) : null
  return {
    key: `group:${group.id}`,
    label: group.label,
    localDir: dir,
    remoteDir: base === null ? null : flat ? base : `${base}/${path.basename(dir)}`,
    destination,
    groupIds: [group.id],
    share: false
  }
}

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

const resolveUploadTargets = async ({
  outputDir,
  manifest,
  scope,
  remote
}: {
  outputDir: string
  manifest: Manifest
  scope: UploadScope
  remote?: RemoteListing | null
}) => {
  const groups = groupsInScope(manifest, scope).filter((g) => !isNamedMontage(g) && !g.freed)
  const targets = groups.map((g) => targetForGroup(g, outputDir, manifest))
  if (scope.destination) {
    const hasLone = manifest.files.some((f) => f.destination === scope.destination && !f.freed)
    if (hasLone) {
      const base = destBaseOf(scope.destination, manifest)
      targets.push({
        key: `dest:${scope.destination}`,
        label: scope.destination,
        localDir: getDestinationDir(outputDir, scope.destination),
        remoteDir: base,
        destination: scope.destination,
        groupIds: [],
        share: false
      })
    }
  }
  const sent = new Set(
    [...manifest.files, ...manifest.groups.flatMap((g) => g.files)].flatMap((file) =>
      file.uploaded &&
      file.processed &&
      file.uploaded.localPath === file.processed.path &&
      file.uploaded.size === file.processed.size &&
      remoteMatches(file, remote)
        ? [file.processed.path]
        : []
    )
  )
  const pending = await Promise.all(
    targets.map(async (target) => {
      if (!target.destination || target.files || !(await pathExists(target.localDir))) return target
      const left = (await walkFiles(target.localDir)).filter((file) => !sent.has(file))
      return { ...target, files: left }
    })
  )
  return dedupeTargets(
    pending.filter((target) => target.files === undefined || target.files.length > 0)
  )
}

const uploadTargets = async ({
  session,
  targets,
  origins,
  folders,
  onProgress,
  onCheck,
  onPlan
}: {
  session: NasSession
  targets: UploadTarget[]
  origins?: Map<string, { from?: string; cut?: [number, number] }>
  folders?: string[]
  onProgress?: (progress: UploadProgress & { groupIds: string[] }) => void
  onCheck?: (progress: CheckProgress) => void
  onPlan?: (plan: PlanProgress) => void
}) => {
  if (targets.length === 0) throw new Error('Nothing to upload yet — process it first.')
  const missing = targets.find((t) => t.remoteDir === null)
  if (missing)
    throw new Error(
      missing.destination
        ? `Choose a NAS folder for ${missing.destination}, or set a default upload folder.`
        : 'Choose an upload folder first.'
    )
  const present = await Promise.all(targets.map((t) => pathExists(t.localDir)))
  const absent = targets.find((_, index) => !present[index])
  if (absent) throw new Error(`Processed files not found for ${absent.label}. Process it again.`)

  const shareUrls: { target: UploadTarget; shareUrl: string }[] = []
  const files: UploadVerdict[] = []
  const seen: Seen[] = []
  const listed: string[] = []
  const held: string[] = []
  let uploaded = 0
  let skipped = 0
  const where = folders ?? []
  let known: OriginIndex | null = null
  const theIndex = async () => {
    known ??= await readOriginIndex(session, where).catch((): OriginIndex => ({
      version: 1,
      files: {}
    }))
    return known
  }
  const argsOf = async (target: UploadTarget) => ({
    host: session.hostname,
    user: session.username,
    password: '',
    localDir: target.localDir,
    remoteDir: target.remoteDir as string,
    files: target.files,
    share: target.share,
    ...(origins
      ? {
          origins: {
            index: await theIndex(),
            of: (localPath: string) => origins.get(localPath)
          }
        }
      : {})
  })
  const looked: Checked[] = []
  for (const target of targets) {
    stopIfUploadCancelled()
    looked.push(await checkJump(await argsOf(target), { onCheck }))
  }
  refuseTaken(
    looked.flatMap((one) => one.taken),
    onPlan
  )
  for (const [index, target] of targets.entries()) {
    stopIfUploadCancelled()
    const result = await publishJump(
      await argsOf(target),
      {
        onProgress: (progress) => onProgress?.({ ...progress, groupIds: target.groupIds }),
        onCheck,
        onPlan
      },
      looked[index]
    )
    if (result.shareUrl) shareUrls.push({ target, shareUrl: result.shareUrl })
    files.push(...result.files)
    seen.push(...result.seen)
    listed.push(...result.listed)
    held.push(...result.held)
    uploaded += result.uploaded
    skipped += result.skipped
  }
  let originsProblem: string | undefined
  if (origins) {
    const at = Math.floor(Date.now() / 1000)
    const ours = new Set(files.map((file) => file.remotePath))
    await recordOrigins(
      session,
      where,
      [
        ...seen
          .filter((file) => !ours.has(file.remotePath))
          .map((file) => ({
            remotePath: file.remotePath,
            size: file.size,
            at,
            ...(file.md5 ? { md5: file.md5 } : {})
          })),
        ...files.map((file) => ({
          remotePath: file.remotePath,
          md5: file.md5,
          size: file.size,
          at: file.at,
          ...origins.get(file.localPath)
        }))
      ],
      { dirs: listed, paths: held }
    ).catch((e: unknown) => {
      originsProblem = `the storage’s list of what it holds was not updated: ${messageOf(e)}`
    })
  }
  return {
    targets,
    shareUrls,
    uploaded,
    skipped,
    files,
    ...(originsProblem ? { originsProblem } : {})
  }
}

const uploadScope = async ({
  outputDir,
  manifest,
  session,
  scope,
  onProgress,
  onCheck,
  onPlan
}: {
  outputDir: string
  manifest: Manifest
  session: NasSession
  scope: UploadScope
  onProgress?: (progress: UploadProgress & { groupIds: string[] }) => void
  onCheck?: (progress: CheckProgress) => void
  onPlan?: (plan: PlanProgress) => void
}) => {
  const remote = await listRemoteFiles(manifest, session)
  return uploadTargets({
    session,
    targets: await resolveUploadTargets({ outputDir, manifest, scope, remote }),
    origins: originsOf(manifest),
    folders: placeFolders(manifest),
    onProgress,
    onCheck,
    onPlan
  })
}

export {
  destBaseOf,
  LIST_CONCURRENCY,
  goneSent,
  uploadedFiles,
  goneFromStorage,
  groupsInScope,
  listRemoteFiles,
  resolveUploadTargets,
  scopeKey,
  earlierMontagesDirs,
  montagesRemoteDir,
  targetForGroup,
  uploadScope,
  uploadTargets
}
export type { UploadTarget }
