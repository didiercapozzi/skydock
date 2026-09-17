import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Route } from './+types/api.manifest'
import { z } from 'zod'
import {
  clearUploadProgress,
  deliverScopeKey,
  destinationSchema,
  ensureNasSession,
  isTandem,
  processJumps,
  getGroupProcessedDir,
  getOutputDir,
  groupFromFiles,
  groupsInScope,
  listRemoteFiles,
  loadManifest,
  manifestFileSchema,
  manifestGroupSchema,
  mergeGroups,
  regroupLooseFiles,
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
    'upload-group',
    'montage',
    'deliver',
    'shift-group-time',
    'move-files',
    'regroup-loose'
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
  anchorEpoch: z.number().optional()
})

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
    if (data.intent === 'merge-groups') {
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
      /* the files leave wherever they were, so their processed copies are stale */
      for (const file of manifest.files) {
        if (!file.id || !ids.has(file.id)) continue
        const output = file.processed?.path
        if (output && fs.existsSync(output)) {
          try {
            fs.unlinkSync(output)
          } catch {
            /* a copy we cannot delete is not worth failing the move over */
          }
        }
        delete file.processed
        delete file.uploaded
        /* a file that lands in a group takes its destination from that group, never its own —
           `file.destination` is what marks a lone file (RULES, Dropzones and tandems) */
        if (data.destination && !data.newGroup && !data.targetGroupId)
          file.destination = data.destination
        else delete file.destination
      }
      const moved = manifest.groups.flatMap((g) => g.files).filter((f) => f.id && ids.has(f.id))
      const seen = new Set<string>()
      const uniqueMoved = moved.filter((f) => {
        if (!f.id || seen.has(f.id)) return false
        seen.add(f.id)
        return true
      })
      manifest.groups = manifest.groups
        .map((g) => ({ ...g, files: g.files.filter((f) => !f.id || !ids.has(f.id)) }))
        .filter((g) => g.files.length > 0 || g.id === data.targetGroupId)
      if (data.targetGroupId) {
        const target = manifest.groups.find((g) => g.id === data.targetGroupId)
        if (!target) {
          errors.addGlobalError('Target jump not found.')
          return errors.toResponse(422)
        }
        target.files = [...target.files, ...uniqueMoved].sort((a, b) => a.mtime - b.mtime)
        target.processed = undefined
      }
      if (data.newGroup) {
        /* loose files are not in `uniqueMoved` (it only sees group refs), so resolve every
           requested id from the registry and keep the group ref when there is one, for its crop */
        const refs = new Map(uniqueMoved.flatMap((f) => (f.id ? [[f.id, f] as const] : [])))
        const picked = manifest.files.flatMap((f) =>
          f.id && ids.has(f.id) ? [refs.get(f.id) ?? f] : []
        )
        if (picked.length === 0) {
          errors.addGlobalError('Those files are no longer in the manifest.')
          return errors.toResponse(422)
        }
        groupFromFiles(manifest, picked, data.destination)
      }
      saveManifest(manifestPath, manifest)
      return boardAnswer(manifest)
    }
    if (data.intent === 'process') {
      const requestedGroups = data.groupIds ?? (data.groupId ? [data.groupId] : undefined)
      try {
        processJumps({
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
        errors.addGlobalError(`${gate.message} — process before delivering.`)
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
        return {
          ...boardAnswer(saved),
          remote: await listRemoteFiles(saved, session),
          uploaded: result.uploaded,
          skipped: result.skipped
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Delivery failed.'
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
          'Use Deliver for a tandem: its film and photos go to the passenger and its original videos to the backup, which an upload of the whole folder cannot do.'
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
            cropEnd: update.cropEnd
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
