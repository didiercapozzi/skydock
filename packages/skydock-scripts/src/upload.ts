import * as fs from 'node:fs'
import * as path from 'node:path'
import { getDestinationDir, getGroupProcessedDir, isFlatGroup } from './process'
import { parentOf } from './paths'
import {
  deliveryFolders,
  originsDirOf,
  placeFolders,
  readOriginIndex,
  recordOrigins
} from './originIndex'
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

/* every file a montage's upload put on the storage, once each — one zip holding both the videos and
   the photos is recorded for both */
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

/* What the NAS holds right now in the folders we have uploaded into, so a file deleted over there
   stops reading as uploaded. The folders come from the upload records themselves, not from the
   destination list — a montage lives in `{destination}/{Passenger}/`, which listing the destination
   would miss. A folder only counts as checked when its listing came back: one the storage would not
   list is not an empty one, and an unchecked folder demotes nothing. */
const listRemoteFiles = async (manifest: Manifest, session: NasSession) => {
  const wanted = [
    ...new Set([
      ...manifest.files.flatMap((f) => (f.uploaded ? [parentOf(f.uploaded.remotePath)] : [])),
      /* and wherever a montage's upload put its film, photos and originals — an uploaded montage is
         only uploaded while those are still there */
      ...manifest.groups.flatMap((g) =>
        uploadedFiles(g.uploaded).map((f) => parentOf(f.remotePath))
      ),
      /* and every other folder an item of it went to: the whole of where it went, not only each part's
         first place */
      ...manifest.groups.flatMap((g) => g.uploaded?.sent?.flatMap((item) => item.to) ?? []),
      /* and every folder this club delivers into, uploaded into yet or not: a place pointed at a
         folder that was already full of footage is worth looking at from the first day, since what
         is up there is what an upload must not send a second time (RULES, Network storage) */
      ...deliveryFolders(manifest)
    ])
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

/* What of a montage's upload the storage no longer has: gone, or not the size that was sent. Only a
   folder that answered counts — a listing that failed is not evidence of anything, so it takes
   nothing away (RULES, File status). */
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

/* What an upload handed over that the storage no longer has, by where it was: an item of what was sent,
   in a folder that answered and no longer lists it. Only a folder that answered counts, as above. */
const goneSent = (
  record: ManifestGroup['uploaded'],
  remote: { dirs: string[]; sizes: Record<string, number | null> } | null
) =>
  remote
    ? (record?.sent ?? []).flatMap((item) =>
        item.to
          .filter(
            (dir) => remote.dirs.includes(dir) && remote.sizes[`${dir}/${item.name}`] === undefined
          )
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

/* Every place is connected to a folder of its own; one that has not been given yet has nowhere to
   upload into, and asking opens the picker rather than guessing a folder. */
const destBaseOf = (destination: string | undefined, manifest: Manifest) =>
  resolveDestinationPath(destination, manifest.destinations ?? [])

/* Where the storage's list of montages is kept: beside the list of where each file came from, in the
   place fixed for SkyDock's lists — montages go into any destination, so the list belongs to none. */
const montagesRemoteDir = (manifest: Manifest, session: NasSession) => {
  const folders = placeFolders(manifest)
  return session.listsDir ?? (folders.length > 0 ? originsDirOf(folders) : null)
}

/* where that list was kept before its place was fixed: above today's folders */
const earlierMontagesDirs = (manifest: Manifest) => {
  const folders = placeFolders(manifest)
  return folders.length > 0 ? [originsDirOf(folders)] : []
}

/* Where one group's processed folder goes on the NAS.
   A flat fun jump has NO folder of its own: `getGroupProcessedDir` hands back the whole
   destination folder, shared by every day ever shot there, so appending the group's base name
   would upload all those days into a folder named after one jump (and share the wrong folder). */
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
    /* a destination's folder is not given a link by being uploaded into: one is made, and taken away,
       by hand, from the destination's own panel */
    share: false
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
  scope
}: {
  outputDir: string
  manifest: Manifest
  scope: UploadScope
}) => {
  /* A montage's files go to the storage by uploading the montage (RULES, Network storage). Not because they
     are not uploaded — they are — but because they do not all go to the same place: the film and
     the photos to the passenger, the originals to the backup. This upload sends a folder whole,
     which would put the project, the working copies and the originals in with the passenger's.
     Refusing here rather than at the one button that exists means no later caller routes around
     it. */
  /* a jump freed from this machine is on the storage already, with nothing here to send */
  const groups = groupsInScope(manifest, scope).filter((g) => !isNamedMontage(g) && !g.freed)
  const targets = groups.map((g) => targetForGroup(g, outputDir, manifest))
  /* a destination can also hold lone files, which belong to no group and would otherwise
     never be uploaded at all */
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
  return dedupeTargets(targets)
}

/* Uploads a set of targets as one job: the file counter runs across all of them, so a destination
   upload reads `12 / 571`, not `12 / 40` restarting per group. The manifest is not saved here — the
   caller owns that. */
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
  /* where each file that may travel came from, by the path it travels as (RULES, Network storage) */
  origins?: Map<string, { from?: string; cut?: [number, number] }>
  /* every folder this club delivers into: what the storage's list of origins is kept above */
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
  const absent = targets.find((t) => !fs.existsSync(t.localDir))
  if (absent) throw new Error(`Processed files not found for ${absent.label}. Process it again.`)

  const shareUrls: { target: UploadTarget; shareUrl: string }[] = []
  const files: UploadVerdict[] = []
  /* every file the storage was seen to hold in the folders this job touched, ours or not */
  const seen: Seen[] = []
  const listed: string[] = []
  const held: string[] = []
  let uploaded = 0
  let skipped = 0
  /* The storage's own list of what it holds and where it came from, read once for the whole job. A
     list that cannot be read stops nothing: with nothing known, every file is sent, which is the
     safe way to be wrong. */
  const where = folders ?? []
  let known: OriginIndex | null = null
  const theIndex = async () => {
    known ??= await readOriginIndex(session, where).catch((): OriginIndex => ({
      version: 1,
      files: {}
    }))
    return known
  }
  /* every folder looked at before anything is sent, so a file in the way stops the whole job and not
     only the folder it was found in */
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
  /* What this job leaves behind for the next one: every file now known to be up there, with what it
     was made from — and every file the folders were merely seen to hold, with what it weighs. A
     folder SkyDock is pointed at, full of footage from before it ever looked, is learned that way,
     and what is learned about one of them is never asked of the storage twice. It is the storage's
     record and not this machine's, so a machine that never saw this upload knows it too. */
  let originsProblem: string | undefined
  if (origins) {
    const at = Math.floor(Date.now() / 1000)
    const ours = new Set(files.map((file) => file.remotePath))
    /* The footage is up whatever becomes of the list: one the storage will not have written is
       said, and the upload stays done. The next listing puts the list right. */
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
}) =>
  uploadTargets({
    session,
    targets: resolveUploadTargets({ outputDir, manifest, scope }),
    origins: originsOf(manifest),
    folders: deliveryFolders(manifest),
    onProgress,
    onCheck,
    onPlan
  })

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
export type { UploadScope, UploadTarget }
