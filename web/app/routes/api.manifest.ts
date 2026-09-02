import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import type { Route } from './+types/api.manifest'
import { getOutputDirPath } from '../lib/scanner.server'
import {
  loadManifest,
  saveManifest,
  reclusterJumps,
  shiftFiles,
  sanitizeLabel
} from '@skydock/scripts'

import type { Manifest, ManifestFile, ManifestJump } from '@skydock/scripts'

type Body = Record<string, unknown>

const getManifestPath = (): string => {
  const outputDir = getOutputDirPath()
  return path.join(outputDir, 'manifest.json')
}

const requireManifest = (): { manifest: Manifest } | { error: string } => {
  const manifest = loadManifest(getManifestPath())
  if (!manifest) return { error: 'No manifest found' }
  return { manifest }
}

const requireJump = (
  manifest: Manifest,
  jumpId: string
): { jump: ManifestJump } | { error: string } => {
  const jump = manifest.jumps.find((j) => j.id === jumpId)
  if (!jump) return { error: 'Jump not found' }
  return { jump }
}

const requireUnprocessed = (jump: ManifestJump): { ok: true } | { error: string } => {
  if (jump.processed) return { error: 'Cannot modify files of a processed jump — unprocess first' }
  return { ok: true }
}

const removeProcessedDir = (label: string): void => {
  const dir = path.join(getOutputDirPath(), 'processed', sanitizeLabel(label))
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  } catch {}
}

const findFileByRef = (manifest: Manifest, ref: string): ManifestFile | undefined =>
  manifest.files.find((f) => f.id === ref || f.path === ref)

const toFileIds = (manifest: Manifest, refs: string[]): string[] => {
  const ids: string[] = []
  for (const ref of refs) {
    const f = findFileByRef(manifest, ref)
    if (f?.id) ids.push(f.id)
  }
  return ids
}

const matchesRef = (file: ManifestFile, ref: string): boolean =>
  file.id === ref || file.path === ref

const requireProcessedIds = (manifest: Manifest): Set<string> =>
  new Set(
    manifest.jumps
      .filter((j) => j.processed)
      .flatMap((j) => j.files.map((f) => f.id).filter((id): id is string => !!id))
  )

const isAllProcessed = (manifest: Manifest): boolean =>
  manifest.status === 'executed' ||
  (manifest.jumps.length > 0 && manifest.jumps.every((j) => j.processed))

const applyShift = (
  manifest: Manifest,
  refs: string[],
  offsetSeconds: number
): { ok: true; offsetSeconds: number } | { ok: false; error: string } => {
  if (refs.length === 0) return { ok: false, error: 'No paths specified' }
  if (offsetSeconds === 0) return { ok: false, error: 'Offset is zero' }
  const ids = toFileIds(manifest, refs)
  if (ids.length === 0) return { ok: false, error: 'Files not found' }
  const processedIds = requireProcessedIds(manifest)
  if (ids.some((id) => processedIds.has(id)))
    return { ok: false, error: 'Cannot shift files of a processed jump — unprocess first' }
  const idsSet = new Set(ids)
  shiftFiles(manifest, idsSet, offsetSeconds)
  reclusterJumps(manifest, idsSet)
  return { ok: true, offsetSeconds }
}

const ok = (manifest?: Manifest, extra?: Record<string, unknown>) => ({
  ok: true as const,
  manifest,
  ...extra
})
const fail = (error: string) => ({ ok: false as const, error })

const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]).filter((x) => typeof x === 'string') : []

const handleUpdateLabel = (manifest: Manifest, body: Body) => {
  const jumpId = asString(body.jumpId)
  const label = asString(body.label)
  const r = requireJump(manifest, jumpId)
  if ('error' in r) return fail(r.error)
  r.jump.label = label
  return ok()
}

const handleConfirmJump = (manifest: Manifest, body: Body) => {
  const jumpId = asString(body.jumpId)
  const confirmed = Boolean(body.confirmed)
  const r = requireJump(manifest, jumpId)
  if ('error' in r) return fail(r.error)
  r.jump.confirmed = confirmed
  return ok()
}

const handleConfirmAll = (manifest: Manifest, body: Body) => {
  const confirmed = Boolean(body.confirmed)
  for (const jump of manifest.jumps) jump.confirmed = confirmed
  return ok()
}

const handleDeleteJump = (manifest: Manifest, body: Body) => {
  const jumpId = asString(body.jumpId)
  const idx = manifest.jumps.findIndex((j) => j.id === jumpId)
  if (idx === -1) return fail('Jump not found')
  const jump = manifest.jumps[idx]
  if (jump.processed) removeProcessedDir(jump.label)
  manifest.jumps.splice(idx, 1)
  return ok()
}

const handleCreateJump = (manifest: Manifest) => {
  const newJump: ManifestJump = {
    id: `jump_${Date.now()}`,
    label: `Jump ${manifest.jumps.length + 1}`,
    confirmed: false,
    files: []
  }
  manifest.jumps.push(newJump)
  return ok()
}

const handleMoveFiles = (manifest: Manifest, body: Body) => {
  const fromJumpId = asString(body.fromJumpId)
  const toJumpId = asString(body.toJumpId)
  const fileRefs = asStringArray(body.fileIds ?? body.filePaths)
  if (fileRefs.length === 0) return fail('No files specified')
  const fromR = requireJump(manifest, fromJumpId)
  const toR = requireJump(manifest, toJumpId)
  if ('error' in fromR) return fail(fromR.error)
  if ('error' in toR) return fail(toR.error)
  const fromCheck = requireUnprocessed(fromR.jump)
  if ('error' in fromCheck) return fail(fromCheck.error)
  const toCheck = requireUnprocessed(toR.jump)
  if ('error' in toCheck) return fail(toCheck.error)
  for (const ref of fileRefs) {
    const fileIdx = fromR.jump.files.findIndex((f) => matchesRef(f, ref))
    if (fileIdx !== -1) {
      const [file] = fromR.jump.files.splice(fileIdx, 1)
      toR.jump.files.push(file)
    }
  }
  return ok()
}

const handleRemoveFiles = (manifest: Manifest, body: Body) => {
  const jumpId = asString(body.jumpId)
  const fileRefs = asStringArray(body.fileIds ?? body.filePaths)
  if (fileRefs.length === 0) return fail('No files specified')
  const r = requireJump(manifest, jumpId)
  if ('error' in r) return fail(r.error)
  const check = requireUnprocessed(r.jump)
  if ('error' in check) return fail(check.error)
  for (const ref of fileRefs) {
    const fileIdx = r.jump.files.findIndex((f) => matchesRef(f, ref))
    if (fileIdx !== -1) r.jump.files.splice(fileIdx, 1)
  }
  return ok()
}

const handleShift = (manifest: Manifest, body: Body) => {
  if (isAllProcessed(manifest)) return fail('All jumps already processed')
  const refs = asStringArray(body.fileIds ?? body.paths ?? body.targetPaths ?? body.referencePaths)
  const offsetSeconds =
    typeof body.offsetSeconds === 'number' ? body.offsetSeconds : Number(body.offsetSeconds ?? 0)
  return applyShift(manifest, refs, offsetSeconds)
}

const handleCalibrate = (manifest: Manifest, body: Body) => {
  if (isAllProcessed(manifest)) return fail('All jumps already processed')
  const referenceRefs = asStringArray(body.referenceIds ?? body.referencePaths)
  const targetRefs = asStringArray(body.targetIds ?? body.targetPaths)
  const scope = asString(body.scope, 'single')
  if (referenceRefs.length === 0 || targetRefs.length === 0) return fail('Missing sequence files')
  const mtimeOf = (ref: string): number | undefined => findFileByRef(manifest, ref)?.mtime
  const refTimes = referenceRefs.map(mtimeOf).filter((t): t is number => t !== undefined)
  const targetTimes = targetRefs.map(mtimeOf).filter((t): t is number => t !== undefined)
  if (refTimes.length === 0 || targetTimes.length === 0) return fail('Sequence files not found')
  const offsetSeconds = Math.min(...refTimes) - Math.min(...targetTimes)
  const refsToShift = scope === 'all' ? manifest.files.map((f) => f.id ?? f.path) : targetRefs
  const result = applyShift(manifest, refsToShift, offsetSeconds)
  if (!result.ok) return result
  if (scope === 'all') manifest.cameraClockOffsetSeconds = offsetSeconds
  return ok(undefined, { offsetSeconds })
}

const handleResetCalibration = (manifest: Manifest) => {
  if (isAllProcessed(manifest)) return fail('All jumps already processed')
  const allFiles = [...manifest.files, ...manifest.jumps.flatMap((j) => j.files)]
  for (const file of allFiles) {
    if (file.originalMtime != null) {
      file.mtime = file.originalMtime
      delete file.originalMtime
    }
  }
  delete manifest.cameraClockOffsetSeconds
  reclusterJumps(manifest)
  return ok()
}

const handleExecute = (manifest: Manifest, body: Body) => {
  let jumpIds = asStringArray(body.jumpIds)
  if (jumpIds.length === 0)
    jumpIds = manifest.jumps.filter((j) => j.confirmed && !j.processed).map((j) => j.id)
  if (jumpIds.length === 0) return fail('No jumps to process')
  const toProcess = manifest.jumps.filter((j) => jumpIds.includes(j.id) && !j.processed)
  if (toProcess.length === 0) return fail('Jumps already processed')
  for (const jump of toProcess) jump.confirmed = true
  saveManifest(getManifestPath(), manifest)

  const manifestPath = getManifestPath()
  const jumpArgs = toProcess.map((j) => `"${j.id}"`).join(' ')
  try {
    execSync(
      `npx tsx "${path.join(process.cwd(), '..', 'packages', 'skydock-scripts', 'src', 'execute.ts')}" "${manifestPath}" ${jumpArgs} 2>&1`,
      {
        timeout: 300_000,
        env: { ...process.env, SKYDOCK_OUTPUT_DIR: getOutputDirPath() }
      }
    )
  } catch (e) {
    return fail(`Execution failed: ${e instanceof Error ? e.message : String(e)}`)
  }

  const updated = loadManifest(manifestPath)
  if (updated) {
    for (const jump of updated.jumps) if (jumpIds.includes(jump.id)) jump.processed = true
    if (updated.jumps.length > 0 && updated.jumps.every((j) => j.processed))
      updated.status = 'executed'
    else if (updated.jumps.some((j) => j.processed)) updated.status = 'confirmed'
    saveManifest(manifestPath, updated)
    return ok(updated)
  }
  return ok(loadManifest(manifestPath) ?? undefined)
}

const handleCopyFiles = (manifest: Manifest, body: Body) => {
  const toJumpId = asString(body.toJumpId)
  const fileRefs = asStringArray(body.fileIds ?? body.filePaths)
  if (fileRefs.length === 0) return fail('No files specified')
  const toR = requireJump(manifest, toJumpId)
  if ('error' in toR) return fail(toR.error)
  const check = requireUnprocessed(toR.jump)
  if ('error' in check) return fail(check.error)
  for (const ref of fileRefs) {
    if (toR.jump.files.some((f) => matchesRef(f, ref))) continue
    const file =
      findFileByRef(manifest, ref) ??
      manifest.jumps.flatMap((j) => j.files).find((f) => matchesRef(f, ref))
    if (file) toR.jump.files.push(file)
  }
  return ok()
}

const handleReorderFiles = (manifest: Manifest, body: Body) => {
  const jumpId = asString(body.jumpId)
  const fileRefs = asStringArray(body.fileIds ?? body.filePaths)
  if (fileRefs.length === 0) return fail('No files specified')
  const r = requireJump(manifest, jumpId)
  if ('error' in r) return fail(r.error)
  const check = requireUnprocessed(r.jump)
  if ('error' in check) return fail(check.error)
  const currentIds = new Set(r.jump.files.map((f) => f.id ?? f.path))
  if (fileRefs.length !== currentIds.size) return fail('File list does not match jump files')
  for (const ref of fileRefs) {
    const id = findFileByRef(manifest, ref)?.id ?? ref
    if (!currentIds.has(id)) return fail('File not found in jump')
  }
  r.jump.files = fileRefs.map((ref) => r.jump.files.find((f) => matchesRef(f, ref))!)
  return ok()
}

const handleMergeJumps = (manifest: Manifest, body: Body) => {
  const sourceJumpIds = asStringArray(body.sourceJumpIds)
  const targetJumpId = asString(body.targetJumpId)
  if (sourceJumpIds.length < 2) return fail('Need at least 2 jumps to merge')
  if (!sourceJumpIds.includes(targetJumpId)) return fail('Target jump must be in the selection')
  const sources = sourceJumpIds.map((id) => manifest.jumps.find((j) => j.id === id))
  for (let i = 0; i < sources.length; i++) {
    if (!sources[i]) return fail(`Jump not found: ${sourceJumpIds[i]}`)
  }
  for (const jump of sources) {
    if (jump!.processed) return fail('Cannot merge processed jumps — unprocess first')
  }
  const target = manifest.jumps.find((j) => j.id === targetJumpId)!
  if (target.files.length > 0) {
    const targetMin = Math.min(...target.files.map((f) => f.mtime))
    for (const src of sources) {
      if (src!.id === targetJumpId || src!.files.length === 0) continue
      const srcMin = Math.min(...src!.files.map((f) => f.mtime))
      const offset = targetMin - srcMin
      if (offset !== 0 && Math.abs(offset) > 12 * 3600) {
        const ids = new Set(src!.files.map((f) => f.id).filter((id): id is string => !!id))
        shiftFiles(manifest, ids, offset)
      }
    }
  }
  const allFiles = sources.flatMap((j) => j!.files).sort((a, b) => a.mtime - b.mtime)
  target.files = allFiles
  manifest.jumps = manifest.jumps.filter(
    (j) => !sourceJumpIds.includes(j.id) || j.id === targetJumpId
  )
  return ok()
}

const handleUnprocess = (manifest: Manifest, body: Body) => {
  const jumpId = asString(body.jumpId)
  const r = requireJump(manifest, jumpId)
  if ('error' in r) return fail(r.error)
  if (!r.jump.processed) return fail('Jump not processed')
  removeProcessedDir(r.jump.label)
  delete r.jump.processed
  if (manifest.status === 'executed') manifest.status = 'confirmed'
  return ok()
}

const handleRenameFile = (manifest: Manifest, body: Body) => {
  const fileRef = asString(body.fileId ?? body.filePath)
  const newFilename = asString(body.newFilename)
  if (!fileRef || !newFilename) return fail('Missing fileId or newFilename')
  const file = findFileByRef(manifest, fileRef)
  if (!file) return fail('File not found')
  file.filename = newFilename
  return ok()
}

const handleSetCrop = (manifest: Manifest, body: Body) => {
  const fileRef = asString(body.fileId ?? body.filePath)
  if (!fileRef) return fail('Missing fileId')
  const cropStart = typeof body.cropStart === 'number' ? body.cropStart : undefined
  const cropEnd = typeof body.cropEnd === 'number' ? body.cropEnd : undefined

  const applyCrop = (file: ManifestFile) => {
    if (cropStart !== undefined) file.cropStart = cropStart
    if (cropEnd !== undefined) file.cropEnd = cropEnd
    if (cropStart === 0 && cropEnd === undefined) {
      delete file.cropStart
      delete file.cropEnd
    }
  }

  let found = false
  const targetId = findFileByRef(manifest, fileRef)?.id ?? fileRef
  for (const jump of manifest.jumps) {
    for (const file of jump.files) {
      if (file.id === targetId || file.path === fileRef) {
        applyCrop(file)
        found = true
      }
    }
  }
  if (!found) return fail('File not found')
  return ok()
}

const handlers: Record<
  string,
  (
    manifest: Manifest,
    body: Body
  ) => { ok: boolean; error?: string; offsetSeconds?: number } | { ok: boolean; error: string }
> = {
  'update-label': handleUpdateLabel,
  'confirm-jump': handleConfirmJump,
  'confirm-all': handleConfirmAll,
  'delete-jump': handleDeleteJump,
  'create-jump': (m) => handleCreateJump(m),
  'move-files': handleMoveFiles,
  'remove-files': handleRemoveFiles,
  'calibrate-sequences': handleCalibrate,
  'shift-sequences': handleShift,
  'reset-calibration': (m) => handleResetCalibration(m),
  'execute-jumps': handleExecute,
  'unprocess-jump': handleUnprocess,
  'reorder-files': handleReorderFiles,
  'merge-jumps': handleMergeJumps,
  'copy-files': handleCopyFiles,
  'rename-file': handleRenameFile,
  'set-crop': handleSetCrop
}

const loader = async () => {
  const manifest = loadManifest(getManifestPath())
  return { manifest }
}

const action = async ({ request }: Route.ActionArgs) => {
  const body = (await request.json()) as Body
  const formAction = String(body.action ?? '')

  const handler = handlers[formAction]
  if (!handler) return { ok: false, error: 'Invalid action' }

  const loaded = requireManifest()
  if ('error' in loaded) return { ok: false, error: loaded.error }

  const result = handler(loaded.manifest, body)
  if (!result.ok) return result

  if (!('manifest' in result) || result.manifest === undefined) {
    saveManifest(getManifestPath(), loaded.manifest)
    return { ok: true, ...(result as Record<string, unknown>), manifest: loaded.manifest }
  }

  return { ok: true, ...(result as Record<string, unknown>), manifest: result.manifest }
}

export { loader, action }
