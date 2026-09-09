import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Route } from './+types/api.manifest'
import { z } from 'zod'
import {
  buildJumpBaseName,
  clearUploadProgress,
  executeMedia,
  getOutputDir,
  loadNasSession,
  loadManifest,
  manifestJumpSchema,
  mergeJumps,
  publishJump,
  saveManifest,
  shiftFiles,
  walkFiles,
  writeUploadProgress
} from '@skydock/scripts'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

const actionArgs = z.object({
  intent: z.enum(['save-jumps', 'merge-jumps', 'process-jump', 'upload-jump']),
  jumpId: z.string().optional(),
  jumps: z.array(manifestJumpSchema).optional(),
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
    if (data.intent === 'merge-jumps') {
      if (!data.leftId || !data.rightId) {
        errors.addGlobalError('Merge needs two jump ids.')
        return errors.toResponse(422)
      }
      manifest.jumps = mergeJumps(manifest.jumps, data.leftId, data.rightId)
      if (data.anchorEpoch !== undefined && Number.isFinite(data.anchorEpoch)) {
        const merged = manifest.jumps.find((j) => j.id === data.leftId)
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
      return { jumps: manifest.jumps }
    }
    if (data.intent === 'process-jump') {
      if (!data.jumpId) {
        errors.addGlobalError('Process needs a jump id.')
        return errors.toResponse(422)
      }
      const target = manifest.jumps.find((j) => j.id === data.jumpId)
      if (!target) {
        errors.addGlobalError('Jump not found.')
        return errors.toResponse(422)
      }
      if (target.files.length === 0) {
        errors.addGlobalError('Jump has no files.')
        return errors.toResponse(422)
      }
      executeMedia({ manifestPath, jumpIds: [target.id], outputDir: getOutputDir() })
      const updated = loadManifest(manifestPath)
      return { jumps: updated?.jumps ?? manifest.jumps }
    }
    if (data.intent === 'upload-jump') {
      if (!data.jumpId) {
        errors.addGlobalError('Upload needs a jump id.')
        return errors.toResponse(422)
      }
      const target = manifest.jumps.find((j) => j.id === data.jumpId)
      if (!target) {
        errors.addGlobalError('Jump not found.')
        return errors.toResponse(422)
      }
      if (!target.processed) {
        errors.addGlobalError('Process the jump first.')
        return errors.toResponse(422)
      }
      if (target.files.length === 0) {
        errors.addGlobalError('Jump has no files.')
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
      const parseDay = (day?: string) => {
        if (!day) return null
        const [d, m, y] = day.split('.').map(Number)
        if (!d || !m || !y) return null
        return Math.floor(new Date(y, m - 1, d).getTime() / 1000)
      }
      const dayEpoch = parseDay(target.day) ?? Math.min(...target.files.map((f) => f.mtime))
      const baseName = buildJumpBaseName(target.passenger, target.label, dayEpoch)
      const localDir = path.join(getOutputDir(), 'processed', baseName)
      if (!fs.existsSync(localDir)) {
        errors.addGlobalError('Processed files not found. Process the jump again.')
        return errors.toResponse(422)
      }
      const remoteBase = session.defaultFolder
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
                jumpId: target.id,
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
            jumpId: target.id,
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
        return { jumps: manifest.jumps }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed.'
        writeUploadProgress(
          {
            jumpId: target.id,
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
    if (!data.jumps) {
      errors.addGlobalError('Save needs jumps.')
      return errors.toResponse(422)
    }
    manifest.jumps = data.jumps
    saveManifest(manifestPath, manifest)
    return { ok: true as const }
  }
})

export { action, actionArgs }
