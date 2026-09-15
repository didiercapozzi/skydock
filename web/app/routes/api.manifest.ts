import * as fs from 'node:fs'
import type { Route } from './+types/api.manifest'
import { z } from 'zod'
import {
  clearUploadProgress,
  destinationSchema,
  executeMedia,
  getGroupProcessedDir,
  getOutputDir,
  loadNasSession,
  loadManifest,
  manifestFileSchema,
  manifestGroupSchema,
  mergeGroups,
  publishJump,
  resolveDestinationPath,
  saveManifest,
  shiftFiles,
  walkFiles,
  writeUploadProgress
} from '@skydock/scripts'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

const actionArgs = z.object({
  intent: z.enum(['save-groups', 'merge-groups', 'process', 'upload-group', 'shift-group-time']),
  groupId: z.string().optional(),
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
    if (data.intent === 'process') {
      executeMedia({
        manifestPath,
        outputDir: getOutputDir(),
        groupIds: data.groupId ? [data.groupId] : undefined,
        destination: data.destination
      })
      const updated = loadManifest(manifestPath)
      return { groups: updated?.groups ?? manifest.groups }
    }
    if (data.intent === 'upload-group') {
      if (!data.groupId) {
        errors.addGlobalError('Upload needs a group id.')
        return errors.toResponse(422)
      }
      const target = manifest.groups.find((g) => g.id === data.groupId)
      if (!target) {
        errors.addGlobalError('Group not found.')
        return errors.toResponse(422)
      }
      if (!target.processed) {
        errors.addGlobalError('Process the group first.')
        return errors.toResponse(422)
      }
      if (target.files.length === 0) {
        errors.addGlobalError('Group has no files.')
        return errors.toResponse(422)
      }
      const session = loadNasSession()
      if (!session) {
        errors.addGlobalError('Not connected to NAS. Please connect first.')
        return errors.toResponse(422)
      }
      if (!session.defaultFolder) {
        errors.addGlobalError('Choose an upload folder first.')
        return errors.toResponse(422)
      }
      const { dir: localDir, baseName } = getGroupProcessedDir(getOutputDir(), target)
      if (!fs.existsSync(localDir)) {
        errors.addGlobalError('Processed files not found. Process the group again.')
        return errors.toResponse(422)
      }
      const remoteBase = target.destination
        ? (resolveDestinationPath(
            target.destination,
            manifest.destinations ?? [],
            session.defaultFolder
          ) ?? session.defaultFolder)
        : session.defaultFolder
      const allFiles = walkFiles(localDir)
      const sortedFiles = [...allFiles].sort()
      const sortedManifestFiles = [...target.files].sort((a, b) => a.mtime - b.mtime)
      const fileIndexByName = new Map<string, number>()
      for (let i = 0; i < sortedFiles.length; i++) {
        const base = sortedFiles[i].split('/').pop() ?? sortedFiles[i]
        if (!fileIndexByName.has(base)) fileIndexByName.set(base, i)
      }
      const totalFiles = sortedFiles.length
      try {
        clearUploadProgress(getOutputDir())
        const { shareUrl } = await publishJump(
          {
            host: session.hostname,
            user: session.username,
            password: '',
            localDir,
            remoteDir: `${remoteBase}/${baseName}`
          },
          (p) => {
            const fileIndex = fileIndexByName.get(p.filename) ?? 0
            const originalFilename = sortedManifestFiles[fileIndex]?.filename ?? p.filename
            writeUploadProgress(
              {
                groupId: target.id,
                filename: originalFilename,
                bytesUploaded: p.bytesUploaded,
                totalBytes: p.totalBytes,
                fileIndex,
                totalFiles,
                state: 'uploading'
              },
              getOutputDir()
            )
          }
        )
        const lastOriginal = sortedManifestFiles[sortedManifestFiles.length - 1]?.filename ?? ''
        writeUploadProgress(
          {
            groupId: target.id,
            filename: lastOriginal,
            bytesUploaded: 1,
            totalBytes: 1,
            fileIndex: Math.max(0, totalFiles - 1),
            totalFiles,
            state: 'done'
          },
          getOutputDir()
        )
        target.publish = { shareUrl }
        saveManifest(manifestPath, manifest)
        return { groups: manifest.groups }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed.'
        writeUploadProgress(
          {
            groupId: target.id,
            filename: '',
            bytesUploaded: 0,
            totalBytes: 1,
            fileIndex: 0,
            totalFiles,
            state: 'error',
            error: msg
          },
          getOutputDir()
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
    return { ok: true as const }
  }
})

export { action, actionArgs }
