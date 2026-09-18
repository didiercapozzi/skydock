import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Route } from './+types/api.manifest'
import { z } from 'zod'
import {
  clearUploadProgress,
  deliverScopeKey,
  destinationSchema,
  EDIT_LOCKED,
  frozenTandems,
  processingNow,
  hasEdit,
  ensureNasSession,
  isTandem,
  processJumps,
  getGroupProcessedDir,
  whenProcessed,
  getOutputDir,
  groupsInScope,
  listRemoteFiles,
  loadManifest,
  manifestFileSchema,
  manifestGroupSchema,
  mergeGroups,
  regroupLooseFiles,
  sameEditedGroup,
  saveManifest,
  scopeKey,
  shiftFiles,
  statProcessedOutputs,
  uploadGate,
  uploadScope,
  writeUploadProgress
} from '@skydock/scripts'
/* both reach the filesystem and the NAS, so they are imported straight from the package rather
   than through the barrel the board also reads */
import { deliverTandem } from '../../../packages/skydock-scripts/src/deliver'
import { deleteTandem, resetTandem } from '../../../packages/skydock-scripts/src/resetTandem'
import { freeTandem, markFreed } from '../../../packages/skydock-scripts/src/freeTandem'
import { moveFiles } from '../../../packages/skydock-scripts/src/moveFiles'
import type { NasSession } from '../../../packages/skydock-scripts/src/nas'
import {
  entryOfTandem,
  parentOf,
  updateTandemIndex,
  upsert
} from '../../../packages/skydock-scripts/src/tandemIndex'
import type { TandemIndex } from '../../../packages/skydock-scripts/src/tandemIndex'
import { openInEditor } from '../../../packages/skydock-scripts/src/editor'
import { createMontageProject } from '../../../packages/skydock-scripts/src/montage'
import { getCutProxyDir } from '../../../packages/skydock-scripts/src/proxy'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { boardAnswer } from '../helpers/manifest'

const actionArgs = z.object({
  intent: z.enum([
    'save-groups',
    'merge-groups',
    'open-montage',
    'process',
    /* a page that came back while something was being prepared waits here for it to finish */
    'process-wait',
    'upload-group',
    'montage',
    'deliver',
    'shift-group-time',
    'move-files',
    'regroup-loose',
    /* back to before processing, keeping every decision — or undone altogether */
    'reset-tandem',
    'delete-tandem',
    /* delete it from this machine, once the storage is proved to hold it all */
    'free-tandem',
    /* files were just added from the computer: the board looks again, and says how it went */
    'imported',
    /* the passenger was emailed — or, taken back, was not — said on the storage's list */
    'mark-emailed'
  ]),
  groupId: z.string().optional(),
  groupIds: z.array(z.string()).optional(),
  fileIds: z.array(z.string()).optional(),
  targetGroupId: z.string().optional(),
  newGroup: z.boolean().optional(),
  destination: z.string().optional(),
  template: z.string().optional(),
  groups: z.array(manifestGroupSchema).optional(),
  fileUpdates: z.array(manifestFileSchema).optional(),
  destinations: z.array(destinationSchema).optional(),
  leftId: z.string().optional(),
  rightId: z.string().optional(),
  anchorEpoch: z.number().optional(),
  /* how a delivery keeps the originals: one zip or plain files, with or without the film */
  backup: z.object({ backupAs: z.enum(['zip', 'folder']), filmToBackup: z.boolean() }).optional(),
  emailed: z
    .object({ folder: z.string(), to: z.string().optional(), sent: z.boolean() })
    .optional(),
  imported: z
    .object({
      added: z.number(),
      moved: z.array(z.object({ name: z.string(), from: z.string() })),
      there: z.number(),
      failed: z.array(z.string()),
      where: z.string()
    })
    .optional()
})

/* The storage's list of tandems changes after the work it describes, and never instead of it: if the
   list cannot be written, the upload or the freeing still stands, and the board says the list did not
   follow. The answer carries the list as it now is, for the board to show. */
const recordOnStorage = async (
  session: NasSession,
  dir: string,
  change: (index: TandemIndex) => void
) => {
  try {
    const index = await updateTandemIndex(session, dir, change)
    return { storage: { dir, tandems: index.tandems } }
  } catch (e) {
    return {
      storageProblem: `the storage’s list of tandems was not updated: ${e instanceof Error ? e.message : String(e)}`
    }
  }
}

const passengerOf = (group: { passenger?: { firstname: string; lastname: string } }) =>
  group.passenger ? `${group.passenger.firstname} ${group.passenger.lastname}` : ''

const action = createValidatedFormAction<Route.ActionArgs>()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    const manifestPath = `${getOutputDir()}/manifest.json`
    const manifest = loadManifest(manifestPath)
    if (!manifest) {
      errors.addGlobalError('No manifest found. Run a scan first.')
      return errors.toResponse(422)
    }
    /* A tandem with an edit is frozen (RULES, Montage): whatever the page sends, nothing that would
       change its copies or its folder gets through — the page hiding the controls is a courtesy,
       this is the rule. */
    const frozen = frozenTandems(manifest, getOutputDir())
    const frozenFiles = new Set(
      manifest.groups
        .filter((g) => frozen.has(g.id))
        .flatMap((g) => g.files.flatMap((f) => (f.id ? [f.id] : [])))
    )
    const refuseFrozen = () => {
      errors.addGlobalError(EDIT_LOCKED)
      return errors.toResponse(422)
    }
    if (data.intent === 'mark-emailed') {
      const session = await ensureNasSession()
      if (!session || !data.emailed) {
        errors.addGlobalError('Connect the NAS first — the list of tandems is kept there.')
        return errors.toResponse(422)
      }
      const { folder, to, sent } = data.emailed
      let known = true
      const listing = await recordOnStorage(session, parentOf(folder), (index) => {
        const entry = index.tandems.find((t) => t.folder === folder)
        if (!entry) known = false
        else if (sent) entry.emailed = { at: Math.floor(Date.now() / 1000), ...(to ? { to } : {}) }
        else delete entry.emailed
      })
      if (!known) {
        errors.addGlobalError('This tandem is not on the storage’s list — upload it first.')
        return errors.toResponse(422)
      }
      return { ...boardAnswer(manifest), ...listing }
    }
    if (data.intent === 'imported') return { ...boardAnswer(manifest), imported: data.imported }
    if (data.intent === 'free-tandem') {
      /* the proof is the storage's own checksum, so it has to be reachable */
      const session = await ensureNasSession()
      if (!session) {
        errors.addGlobalError(
          'Connect the NAS first — freeing needs it to prove it holds the files.'
        )
        return errors.toResponse(422)
      }
      if (processingNow()) {
        errors.addGlobalError('Something is being processed — wait for it to finish.')
        return errors.toResponse(422)
      }
      try {
        const result = await freeTandem({
          manifest,
          outputDir: getOutputDir(),
          groupId: data.groupId ?? '',
          session
        })
        /* checking gigabytes takes a while; whatever was saved meanwhile is kept */
        const saved = loadManifest(manifestPath) ?? manifest
        markFreed(saved, result)
        saveManifest(manifestPath, saved)
        /* the storage's list says it is the only copy now */
        const freedGroup = saved.groups.find((g) => g.id === result.groupId)
        const listed = freedGroup ? entryOfTandem(freedGroup) : null
        const listing = listed
          ? await recordOnStorage(session, listed.dir, (index) => upsert(index, listed.entry))
          : {}
        return {
          ...boardAnswer(saved),
          ...listing,
          freed: { bytes: result.bytes, files: result.fileIds.length, groupId: result.groupId }
        }
      } catch (e) {
        errors.addGlobalError(e instanceof Error ? e.message : String(e))
        return errors.toResponse(422)
      }
    }
    if (data.intent === 'reset-tandem' || data.intent === 'delete-tandem') {
      /* its folder is being written right now; taking it away underneath would leave half of it */
      const running = processingNow()
      if (
        running &&
        (running.groupIds.length === 0 || running.groupIds.includes(data.groupId ?? ''))
      ) {
        errors.addGlobalError('This tandem is being processed — wait for it to finish.')
        return errors.toResponse(422)
      }
      try {
        const take = data.intent === 'reset-tandem' ? resetTandem : deleteTandem
        take(manifest, getOutputDir(), data.groupId ?? '')
      } catch (e) {
        errors.addGlobalError(e instanceof Error ? e.message : String(e))
        return errors.toResponse(422)
      }
      saveManifest(manifestPath, manifest)
      return boardAnswer(manifest)
    }
    if (data.intent === 'merge-groups') {
      if (frozen.has(data.leftId ?? '') || frozen.has(data.rightId ?? '')) return refuseFrozen()
      if (!data.leftId || !data.rightId) {
        errors.addGlobalError('Merge needs two group ids.')
        return errors.toResponse(422)
      }
      manifest.groups = mergeGroups(manifest.groups, data.leftId, data.rightId)
      if (data.anchorEpoch !== undefined && Number.isFinite(data.anchorEpoch)) {
        const merged = manifest.groups.find((g) => g.id === data.leftId)
        if (merged && merged.files.length > 0) {
          const min = Math.min(...merged.files.map((f) => f.mtime))
          const offset = Math.round(data.anchorEpoch) - min
          if (offset !== 0) {
            const ids = new Set<string>()
            for (const f of merged.files) if (f.id) ids.add(f.id)
            shiftFiles(manifest, ids, offset)
          }
        }
      }
      saveManifest(manifestPath, manifest)
      return boardAnswer(manifest)
    }
    if (data.intent === 'shift-group-time') {
      if (frozen.has(data.groupId ?? '')) return refuseFrozen()
      if (!data.groupId) {
        errors.addGlobalError('Shift needs a group id.')
        return errors.toResponse(422)
      }
      if (data.anchorEpoch === undefined || !Number.isFinite(data.anchorEpoch)) {
        errors.addGlobalError('Shift needs a valid anchor time.')
        return errors.toResponse(422)
      }
      const target = manifest.groups.find((g) => g.id === data.groupId)
      if (!target) {
        errors.addGlobalError('Group not found.')
        return errors.toResponse(422)
      }
      if (target.files.length === 0) {
        errors.addGlobalError('Group has no files.')
        return errors.toResponse(422)
      }
      const min = Math.min(...target.files.map((f) => f.mtime))
      const offset = Math.round(data.anchorEpoch) - min
      if (offset !== 0) {
        const ids = new Set<string>()
        for (const f of target.files) if (f.id) ids.add(f.id)
        shiftFiles(manifest, ids, offset)
      }
      saveManifest(manifestPath, manifest)
      return boardAnswer(manifest)
    }
    /* the project is already there — this is the way back into it */
    if (data.intent === 'open-montage') {
      const group = manifest.groups.find((g) => g.id === data.groupId)
      if (!group?.montage) {
        errors.addGlobalError('This tandem has no project yet — make its montage first.')
        return errors.toResponse(422)
      }
      const opened = await openInEditor(group.montage.projectPath)
      if (!opened.opened) {
        errors.addGlobalError(opened.reason ?? 'Could not open the editor.')
        return errors.toResponse(422)
      }
      return {
        ...boardAnswer(manifest),
        montage: { clips: 0, missingAssets: [], opened: true, openCommand: opened.command }
      }
    }

    if (data.intent === 'regroup-loose') {
      const made = regroupLooseFiles(manifest)
      if (made === 0) {
        errors.addGlobalError('Nothing to regroup — the sorting area has no loose files.')
        return errors.toResponse(422)
      }
      saveManifest(manifestPath, manifest)
      return boardAnswer(manifest)
    }
    if (data.intent === 'move-files') {
      const ids = new Set(data.fileIds ?? [])
      if (ids.size === 0) {
        errors.addGlobalError('Select at least one file to move.')
        return errors.toResponse(422)
      }
      if ([...ids].some((id) => frozenFiles.has(id)) || frozen.has(data.targetGroupId ?? ''))
        return refuseFrozen()
      try {
        moveFiles(manifest, ids, {
          targetGroupId: data.targetGroupId,
          newGroup: data.newGroup,
          destination: data.destination
        })
      } catch (e) {
        errors.addGlobalError(e instanceof Error ? e.message : String(e))
        return errors.toResponse(422)
      }
      saveManifest(manifestPath, manifest)
      return boardAnswer(manifest)
    }
    if (data.intent === 'process') {
      const requestedGroups = data.groupIds ?? (data.groupId ? [data.groupId] : undefined)
      /* the same choice of jumps processing makes, so one with an edit is never written over */
      const targets = manifest.groups.filter((g) =>
        requestedGroups && requestedGroups.length > 0
          ? requestedGroups.includes(g.id)
          : !data.destination || g.destination === data.destination
      )
      if (targets.some((g) => frozen.has(g.id))) return refuseFrozen()
      try {
        await processJumps({
          manifestPath,
          outputDir: getOutputDir(),
          groupIds: requestedGroups && requestedGroups.length > 0 ? requestedGroups : undefined,
          destination: data.destination
        })
      } catch (e) {
        errors.addGlobalError(e instanceof Error ? e.message : String(e))
        return errors.toResponse(422)
      }
      const updated = loadManifest(manifestPath)
      return boardAnswer(updated ?? manifest)
    }
    if (data.intent === 'process-wait') {
      await whenProcessed()
      return boardAnswer(loadManifest(manifestPath) ?? manifest)
    }
    if (data.intent === 'montage') {
      const group = manifest.groups.find((g) => g.id === data.groupId)
      if (!group) {
        errors.addGlobalError('Group not found.')
        return errors.toResponse(422)
      }
      if (!isTandem(group)) {
        errors.addGlobalError('Only a tandem gets a montage — give it a passenger first.')
        return errors.toResponse(422)
      }
      if (!group.processed) {
        errors.addGlobalError('Process this tandem before making its montage.')
        return errors.toResponse(422)
      }
      const outputDir = getOutputDir()
      const { dir: groupDir, baseName } = getGroupProcessedDir(outputDir, group)
      if (!fs.existsSync(groupDir)) {
        errors.addGlobalError('Processed folder not found. Process it again.')
        return errors.toResponse(422)
      }
      /* an edit someone has been working on is never overwritten (RULES, Montage) */
      if (fs.readdirSync(groupDir).some((f) => f.endsWith('.kdenlive'))) {
        errors.addGlobalError('This tandem already has a project — open it in kdenlive.')
        return errors.toResponse(422)
      }
      try {
        /* the processed copies are already renamed and cropped — the timeline lays them out */
        const videos = fs
          .readdirSync(path.join(groupDir, 'videos'), { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => path.join(groupDir, 'videos', e.name))
          .sort()
        const made = createMontageProject({
          groupDir,
          outputDir,
          baseName,
          title: passengerOf(group).trim() || group.label,
          template: data.template,
          /* the proxy processing cut for each copy, when it managed to make one */
          clips: videos.map((file) => {
            const proxy = path.join(
              getCutProxyDir(outputDir, group.id),
              `${path.parse(file).name}.mp4`
            )
            return fs.existsSync(proxy) ? { path: file, proxy } : { path: file }
          })
        })
        group.montage = {
          projectPath: made.projectPath,
          filmPath: made.filmPath,
          template: made.template,
          clips: made.clips,
          at: Math.floor(Date.now() / 1000)
        }
        saveManifest(manifestPath, manifest)
        /* writing the project and opening it are one press: the project exists to be edited */
        const opened = await openInEditor(made.projectPath)
        return {
          ...boardAnswer(manifest),
          montage: {
            clips: made.clips,
            missingAssets: made.missingAssets,
            opened: opened.opened,
            openCommand: opened.command,
            openReason: opened.reason
          }
        }
      } catch (e) {
        errors.addGlobalError(e instanceof Error ? e.message : String(e))
        return errors.toResponse(422)
      }
    }
    if (data.intent === 'deliver') {
      const group = manifest.groups.find((g) => g.id === data.groupId)
      if (!group) {
        errors.addGlobalError('Group not found.')
        return errors.toResponse(422)
      }
      const session = await ensureNasSession()
      if (!session) {
        errors.addGlobalError('Not connected to NAS. Please connect first.')
        return errors.toResponse(422)
      }
      const outputDir = getOutputDir()
      /* the same rule upload uses: a film built from a copy that no longer matches its source is
         not this tandem's film */
      const outputs = statProcessedOutputs(manifest)
      const gate = uploadGate(group.files, (file) => ({ output: outputs[file.path] }))
      if (gate.blocked) {
        errors.addGlobalError(`${gate.message} — process before uploading.`)
        return errors.toResponse(422)
      }
      const key = deliverScopeKey(group.id)
      let progress = { filename: '', fileIndex: 0, totalFiles: 0 }
      try {
        clearUploadProgress(outputDir)
        const result = await deliverTandem({
          outputDir,
          manifest,
          group,
          session,
          backup: data.backup,
          onArchive: (archive) =>
            writeUploadProgress(
              {
                scope: key,
                groupId: group.id,
                filename: `${archive.name}.zip`,
                bytesUploaded: archive.bytes,
                totalBytes: Math.max(1, archive.totalBytes),
                fileIndex: archive.entries,
                totalFiles: archive.totalEntries,
                state: 'archiving'
              },
              outputDir
            ),
          onCheck: (check) =>
            writeUploadProgress(
              {
                scope: key,
                groupId: group.id,
                filename: check.filename,
                bytesUploaded: 0,
                totalBytes: 1,
                fileIndex: 0,
                totalFiles: check.total,
                checked: check.checked,
                state: 'checking'
              },
              outputDir
            ),
          onProgress: (p) => {
            progress = {
              filename: p.filename,
              fileIndex: p.fileIndex ?? 0,
              totalFiles: p.totalFiles ?? 0
            }
            writeUploadProgress(
              {
                scope: key,
                groupId: group.id,
                filename: p.filename,
                bytesUploaded: p.bytesUploaded,
                totalBytes: p.totalBytes,
                fileIndex: p.fileIndex ?? 0,
                totalFiles: p.totalFiles ?? 0,
                state: 'uploading'
              },
              outputDir
            )
          }
        })
        /* a delivery runs for minutes; anything saved meanwhile is on disk and must not be
           clobbered by the copy loaded before it started */
        const saved = loadManifest(manifestPath) ?? manifest
        const target = saved.groups.find((g) => g.id === group.id)
        if (target) {
          target.delivered = result.delivered
          if (result.delivered.shareUrl) target.publish = { shareUrl: result.delivered.shareUrl }
        }
        writeUploadProgress(
          {
            scope: key,
            groupId: group.id,
            filename: progress.filename,
            bytesUploaded: 1,
            totalBytes: 1,
            fileIndex: progress.totalFiles,
            totalFiles: progress.totalFiles,
            skipped: result.skipped,
            state: 'done'
          },
          outputDir
        )
        saveManifest(manifestPath, saved)
        /* the storage's own list of tandems follows the upload */
        const listed = target ? entryOfTandem(target) : null
        const listing = listed
          ? await recordOnStorage(session, listed.dir, (index) => upsert(index, listed.entry))
          : {}
        return {
          ...boardAnswer(saved),
          ...listing,
          remote: await listRemoteFiles(saved, session),
          uploaded: result.uploaded,
          skipped: result.skipped
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed.'
        writeUploadProgress(
          {
            scope: key,
            groupId: group.id,
            filename: progress.filename,
            bytesUploaded: 0,
            totalBytes: 1,
            fileIndex: progress.fileIndex,
            totalFiles: progress.totalFiles,
            state: 'error',
            error: msg
          },
          outputDir
        )
        errors.addGlobalError(msg)
        return errors.toResponse(422)
      }
    }
    if (data.intent === 'upload-group') {
      const scope = {
        groupId: data.groupId,
        groupIds: data.groupIds,
        destination: data.destination
      }
      const key = scopeKey(scope)
      if (key === 'group:' && !scope.destination) {
        errors.addGlobalError('Upload needs a group or a destination.')
        return errors.toResponse(422)
      }
      /* A tandem's files reach the storage by delivering (RULES, Network storage), because they do
         not all go to the same folder. The board never offers this for one, so anything arriving
         here asked for it by name and is told why rather than left with an upload that quietly
         covered nothing. */
      const asked = groupsInScope(manifest, scope)
      if (asked.length > 0 && asked.every(isTandem)) {
        errors.addGlobalError(
          'Upload a tandem from its own card: its film and photos go to the passenger and its original videos to the backup, which an upload of the whole folder cannot do.'
        )
        return errors.toResponse(422)
      }
      /* a stored session is only a session if DSM still takes it — this is also what lets an
         expired one refresh itself instead of failing the upload (RULES, Network storage) */
      const session = await ensureNasSession()
      if (!session) {
        errors.addGlobalError('Not connected to NAS. Please connect first.')
        return errors.toResponse(422)
      }
      const outputDir = getOutputDir()
      /* the same rule the button uses, so the server never accepts what the board would refuse —
         and catches a file that changed between the click and the request */
      const outputs = statProcessedOutputs(manifest)
      const scopeFiles = [
        ...groupsInScope(manifest, scope).flatMap((g) => g.files),
        ...(scope.destination
          ? manifest.files.filter((f) => f.destination === scope.destination)
          : [])
      ]
      const gate = uploadGate(scopeFiles, (file) => ({ output: outputs[file.path] }))
      if (gate.blocked) {
        errors.addGlobalError(`${gate.message} — process before uploading.`)
        return errors.toResponse(422)
      }
      let progress = { filename: '', fileIndex: 0, totalFiles: 0 }
      try {
        clearUploadProgress(outputDir)
        const result = await uploadScope({
          outputDir,
          manifest,
          session,
          scope,
          onCheck: (check) =>
            writeUploadProgress(
              {
                scope: key,
                filename: check.filename,
                bytesUploaded: 0,
                totalBytes: 1,
                fileIndex: 0,
                totalFiles: check.total,
                checked: check.checked,
                state: 'checking'
              },
              outputDir
            ),
          onProgress: (p) => {
            progress = {
              filename: p.filename,
              fileIndex: p.fileIndex ?? 0,
              totalFiles: p.totalFiles ?? 0
            }
            writeUploadProgress(
              {
                scope: key,
                groupId: p.groupIds[0],
                filename: p.filename,
                bytesUploaded: p.bytesUploaded,
                totalBytes: p.totalBytes,
                fileIndex: p.fileIndex ?? 0,
                totalFiles: p.totalFiles ?? 0,
                state: 'uploading'
              },
              outputDir
            )
          }
        })
        /* An upload runs for minutes; anything the user saved meanwhile is on disk and would be
           clobbered by writing the copy loaded before it started. */
        const saved = loadManifest(manifestPath) ?? manifest
        /* mark every file now proved to be on the NAS — sent or found identical there */
        const byOutput = new Map(
          saved.files.flatMap((f) => (f.processed ? [[f.processed.path, f] as const] : []))
        )
        for (const verdict of result.files) {
          const file = byOutput.get(verdict.localPath)
          if (file)
            file.uploaded = {
              remotePath: verdict.remotePath,
              md5: verdict.md5,
              size: verdict.size,
              localPath: verdict.localPath,
              at: verdict.at
            }
        }
        /* every group behind a target gets the link, and a destination keeps its own so the
           board can hand out a dropzone folder without opening a group */
        const destinations = saved.destinations ?? []
        for (const { target, shareUrl } of result.shareUrls) {
          for (const id of target.groupIds) {
            const group = saved.groups.find((g) => g.id === id)
            if (group) group.publish = { shareUrl }
          }
          if (target.destination) {
            const dest = destinations.find((d) => d.name === target.destination)
            if (dest) dest.shareUrl = shareUrl
          }
        }
        saved.destinations = destinations
        writeUploadProgress(
          {
            scope: key,
            filename: progress.filename,
            bytesUploaded: 1,
            totalBytes: 1,
            fileIndex: progress.totalFiles,
            totalFiles: progress.totalFiles,
            skipped: result.skipped,
            state: 'done'
          },
          outputDir
        )
        saveManifest(manifestPath, saved)
        return {
          ...boardAnswer(saved),
          /* taken right after the upload, by the session that did it — the board gets the new
             truth without having to go and ask for it */
          remote: await listRemoteFiles(saved, session),
          uploaded: result.uploaded,
          skipped: result.skipped
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed.'
        writeUploadProgress(
          {
            scope: key,
            filename: progress.filename,
            bytesUploaded: 0,
            totalBytes: 1,
            fileIndex: progress.fileIndex,
            totalFiles: progress.totalFiles,
            state: 'error',
            error: msg
          },
          outputDir
        )
        errors.addGlobalError(msg)
        return errors.toResponse(422)
      }
    }
    if (!data.groups) {
      errors.addGlobalError('Save needs groups.')
      return errors.toResponse(422)
    }
    /* a frozen tandem has to arrive exactly as it is, and none of its files may be edited on the side */
    for (const id of frozen) {
      const before = manifest.groups.find((g) => g.id === id)
      const incoming = data.groups.find((g) => g.id === id)
      if (!before || !incoming || !sameEditedGroup(before, incoming)) return refuseFrozen()
    }
    /* nor may another jump be given that passenger's name: it would join the folder the edit is in */
    for (const incoming of data.groups) {
      if (frozen.has(incoming.id) || !hasEdit(getOutputDir(), incoming)) continue
      const before = manifest.groups.find((g) => g.id === incoming.id)
      if (!before || !sameEditedGroup(before, incoming)) return refuseFrozen()
    }
    if (data.fileUpdates?.some((u) => u.id && frozenFiles.has(u.id))) return refuseFrozen()

    /* Renaming a passenger, a label or a destination changes where the files are written, so the
       copies already on disk belong to a folder that is no longer this group's — the source is
       untouched, which is exactly what the stamp compares, so it has to be said explicitly. */
    for (const incoming of data.groups) {
      const before = manifest.groups.find((g) => g.id === incoming.id)
      if (!before) continue
      const movedOutput =
        before.label !== incoming.label ||
        before.destination !== incoming.destination ||
        passengerOf(before) !== passengerOf(incoming)
      if (!movedOutput) continue
      const ids = new Set(incoming.files.flatMap((f) => (f.id ? [f.id] : [])))
      for (const file of manifest.files) {
        if (!file.id || !ids.has(file.id)) continue
        delete file.processed
        delete file.uploaded
      }
    }
    manifest.groups = data.groups
    if (data.destinations) {
      manifest.destinations = data.destinations
    }

    /* named fields only — never a spread of whatever the client sent */
    if (data.fileUpdates) {
      for (const update of data.fileUpdates) {
        const idx = manifest.files.findIndex((f) =>
          update.id ? f.id === update.id : f.path === update.path
        )
        if (idx !== -1) {
          manifest.files[idx] = {
            ...manifest.files[idx],
            destination: update.destination,
            cropStart: update.cropStart,
            cropEnd: update.cropEnd,
            frame: update.frame,
            rotation: update.rotation
          }
        }
      }
    }
    saveManifest(manifestPath, manifest)
    /* answer with what was saved, so the board redraws destinations from the server rather than
       trusting its own optimistic copy — the same rule every other mutation follows (RULES, The board) */
    return boardAnswer(manifest)
  }
})

export { action, actionArgs }
