import * as fs from 'node:fs'
import type { Route } from './+types/api.manifest'
import { z } from 'zod'
import {
  clearUploadProgress,
  destinationSchema,
  ensureNasSession,
  executeMedia,
  getOutputDir,
  groupFromFiles,
  groupsInScope,
  loadManifest,
  manifestFileSchema,
  manifestGroupSchema,
  mergeGroups,
  regroupLooseFiles,
  saveManifest,
  scopeKey,
  shiftFiles,
  uploadScope,
  writeUploadProgress
} from '@skydock/scripts'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

const actionArgs = z.object({
  intent: z.enum([
    'save-groups',
    'merge-groups',
    'process',
    'upload-group',
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
  groups: z.array(manifestGroupSchema).optional(),
  fileUpdates: z.array(manifestFileSchema).optional(),
  destinations: z.array(destinationSchema).optional(),
  leftId: z.string().optional(),
  rightId: z.string().optional(),
  anchorEpoch: z.number().optional()
})

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
      return { groups: manifest.groups }
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
      return { groups: manifest.groups }
    }
    if (data.intent === 'regroup-loose') {
      const made = regroupLooseFiles(manifest)
      if (made === 0) {
        errors.addGlobalError('Nothing to regroup — the sorting area has no loose files.')
        return errors.toResponse(422)
      }
      saveManifest(manifestPath, manifest)
      const stillGrouped = new Set(
        manifest.groups.flatMap((g) => g.files.map((f) => f.id ?? f.path))
      )
      return {
        groups: manifest.groups,
        looseFiles: manifest.files.filter((f) => !stillGrouped.has(f.id ?? f.path))
      }
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
        if (file.processedPath && fs.existsSync(file.processedPath)) {
          try {
            fs.unlinkSync(file.processedPath)
          } catch {
            /* a copy we cannot delete is not worth failing the move over */
          }
        }
        delete file.processedPath
        /* a file that lands in a group takes its destination from that group, never its own —
           `file.destination` is what marks a lone file (§13.1) */
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
      const stillGrouped = new Set(
        manifest.groups.flatMap((g) => g.files.map((f) => f.id ?? f.path))
      )
      return {
        groups: manifest.groups,
        looseFiles: manifest.files.filter((f) => !stillGrouped.has(f.id ?? f.path))
      }
    }
    if (data.intent === 'process') {
      const requestedGroups = data.groupIds ?? (data.groupId ? [data.groupId] : undefined)
      try {
        executeMedia({
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
      return { groups: updated?.groups ?? manifest.groups }
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
      /* a stored session is only a session if DSM still takes it — this is also what lets an
         expired one refresh itself instead of failing the upload (§12.5) */
      const session = await ensureNasSession()
      if (!session) {
        errors.addGlobalError('Not connected to NAS. Please connect first.')
        return errors.toResponse(422)
      }
      const outputDir = getOutputDir()
      const unprocessed = groupsInScope(manifest, scope).find((g) => !g.processed)
      if (unprocessed) {
        errors.addGlobalError(`Process ${unprocessed.label} first.`)
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
        /* every group behind a target gets the link, and a destination keeps its own so the
           board can hand out a dropzone folder without opening a group */
        const destinations = manifest.destinations ?? []
        for (const { target, shareUrl } of result.shareUrls) {
          for (const id of target.groupIds) {
            const group = manifest.groups.find((g) => g.id === id)
            if (group) group.publish = { shareUrl }
          }
          if (target.destination) {
            const dest = destinations.find((d) => d.name === target.destination)
            if (dest) dest.shareUrl = shareUrl
          }
        }
        manifest.destinations = destinations
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
        saveManifest(manifestPath, manifest)
        return {
          groups: manifest.groups,
          destinations,
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
    manifest.groups = data.groups
    if (data.destinations) {
      manifest.destinations = data.destinations
    }

    if (data.fileUpdates) {
      for (const update of data.fileUpdates) {
        const idx = manifest.files.findIndex((f) => f.path === update.path)
        if (idx !== -1) {
          manifest.files[idx] = { ...manifest.files[idx], destination: update.destination }
        }
      }
    }
    saveManifest(manifestPath, manifest)
    /* answer with what was saved, so the board redraws destinations from the server rather than
       trusting its own optimistic copy — the same rule every other mutation follows (§14.2) */
    return { groups: manifest.groups, destinations: manifest.destinations ?? [] }
  }
})

export { action, actionArgs }
