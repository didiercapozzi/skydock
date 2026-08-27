import type { Route } from './+types/api.manifest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { getOutputDirPath } from '../lib/scanner.server'
import type { Manifest, ManifestFile, ManifestJump } from '../lib/types'

type Body = Record<string, unknown>

const getManifestPath = (): string => path.join(getOutputDirPath(), 'proposed_jumps.json')

const loadManifest = (): Manifest | null => {
  const p = getManifestPath()
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Manifest
  } catch {
    return null
  }
}

const saveManifest = (m: Manifest): void => {
  fs.writeFileSync(getManifestPath(), JSON.stringify(m, null, 2))
}

const JUMP_GAP_SECONDS = 1800

const reclusterJumps = (manifest: Manifest, preservedPaths?: Set<string>): void => {
  const preservedJumpIds = new Set<string>()
  if (preservedPaths) {
    for (const jump of manifest.jumps) {
      if (jump.files.some((f) => preservedPaths.has(f.path))) preservedJumpIds.add(jump.id)
    }
  }

  const preservedGroups: ManifestFile[][] = []
  const preservedFilePaths = new Set<string>()
  for (const jump of manifest.jumps) {
    if (preservedJumpIds.has(jump.id)) {
      const sorted = [...jump.files].sort((a, b) => a.mtime - b.mtime)
      preservedGroups.push(sorted)
      for (const f of sorted) preservedFilePaths.add(f.path)
    }
  }

  const remainingFiles = manifest.files.filter((f) => !preservedFilePaths.has(f.path))
  const sortedRemaining = [...remainingFiles].sort((a, b) => a.mtime - b.mtime)
  const groups: ManifestFile[][] = []
  let current: ManifestFile[] = []
  let lastMtime = 0
  for (const file of sortedRemaining) {
    if (current.length > 0 && file.mtime - lastMtime > JUMP_GAP_SECONDS) {
      groups.push(current)
      current = []
    }
    current.push(file)
    lastMtime = file.mtime
  }
  if (current.length > 0) groups.push(current)

  const allGroups = [...preservedGroups, ...groups].sort((a, b) => {
    const aMin = Math.min(...a.map((f) => f.mtime))
    const bMin = Math.min(...b.map((f) => f.mtime))
    return aMin - bMin
  })

  const mergedGroups: ManifestFile[][] = []
  for (const group of allGroups) {
    if (mergedGroups.length === 0) {
      mergedGroups.push([...group].sort((a, b) => a.mtime - b.mtime))
    } else {
      const last = mergedGroups[mergedGroups.length - 1]
      const lastMax = Math.max(...last.map((f) => f.mtime))
      const curMin = Math.min(...group.map((f) => f.mtime))
      if (curMin - lastMax <= JUMP_GAP_SECONDS) {
        last.push(...group)
        last.sort((a, b) => a.mtime - b.mtime)
      } else {
        mergedGroups.push([...group].sort((a, b) => a.mtime - b.mtime))
      }
    }
  }

  const previousByPath = new Map<string, ManifestJump>()
  for (const jump of manifest.jumps) {
    for (const file of jump.files) previousByPath.set(file.path, jump)
  }

  const usedIds = new Set<string>()
  for (const g of mergedGroups) {
    for (const f of g) {
      const prev = previousByPath.get(f.path)
      if (prev && preservedJumpIds.has(prev.id)) usedIds.add(prev.id)
    }
  }
  let nextIdx = 1
  const getNextId = (): string => {
    while (usedIds.has(`jump_${nextIdx}`)) nextIdx++
    const id = `jump_${nextIdx}`
    usedIds.add(id)
    nextIdx++
    return id
  }

  manifest.jumps = mergedGroups.map((files) => {
    const counts = new Map<string, number>()
    for (const file of files) {
      const prev = previousByPath.get(file.path)
      if (prev) counts.set(prev.id, (counts.get(prev.id) ?? 0) + 1)
    }
    let dominant: ManifestJump | undefined
    let dominantCount = 0
    for (const [jumpId, count] of counts) {
      if (count > dominantCount) {
        dominantCount = count
        dominant = manifest.jumps.find((j) => j.id === jumpId)
      }
    }
    const isPreserved = files.some((f) => preservedFilePaths.has(f.path))
    const preservedJump = isPreserved
      ? manifest.jumps.find(
          (j) => preservedJumpIds.has(j.id) && j.files.some((f) => files.includes(f))
        )
      : undefined
    if (preservedJump) {
      return {
        id: preservedJump.id,
        label: preservedJump.label,
        confirmed: preservedJump.confirmed,
        processed: preservedJump.processed,
        files
      }
    }
    return {
      id: dominant?.id ?? getNextId(),
      label: dominant?.label ?? `Jump ${nextIdx - 1}`,
      confirmed: dominant?.confirmed ?? false,
      processed: dominant?.processed,
      files
    }
  })
}

const shiftFiles = (manifest: Manifest, paths: Set<string>, offsetSeconds: number): void => {
  for (const file of manifest.files) {
    if (!paths.has(file.path)) continue
    if (file.originalMtime === undefined) file.originalMtime = file.mtime
    file.mtime += offsetSeconds
  }
  for (const jump of manifest.jumps) {
    for (const file of jump.files) {
      if (!paths.has(file.path)) continue
      if (file.originalMtime === undefined) file.originalMtime = file.mtime
      file.mtime += offsetSeconds
    }
  }
}

const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]).filter((x) => typeof x === 'string') : []

const requireManifest = (): { manifest: Manifest } | { error: string } => {
  const manifest = loadManifest()
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

const requireProcessedPaths = (manifest: Manifest): Set<string> =>
  new Set(manifest.jumps.filter((j) => j.processed).flatMap((j) => j.files.map((f) => f.path)))

const isAllProcessed = (manifest: Manifest): boolean =>
  manifest.status === 'executed' ||
  (manifest.jumps.length > 0 && manifest.jumps.every((j) => j.processed))

const ok = (manifest?: Manifest, extra?: Record<string, unknown>) => ({
  ok: true as const,
  manifest,
  ...extra
})
const fail = (error: string) => ({ ok: false as const, error })

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
  if (jump.processed) {
    const dir = path.join(getOutputDirPath(), 'processed', jumpId)
    try {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    } catch {}
  }
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
  const filePaths = asStringArray(body.filePaths)
  if (filePaths.length === 0) return fail('No files specified')
  const fromR = requireJump(manifest, fromJumpId)
  const toR = requireJump(manifest, toJumpId)
  if ('error' in fromR) return fail(fromR.error)
  if ('error' in toR) return fail(toR.error)
  if (fromR.jump.processed || toR.jump.processed)
    return fail('Cannot move files of a processed jump — unprocess first')
  for (const filePath of filePaths) {
    const fileIdx = fromR.jump.files.findIndex((f) => f.path === filePath)
    if (fileIdx !== -1) {
      const [file] = fromR.jump.files.splice(fileIdx, 1)
      toR.jump.files.push(file)
    }
  }
  return ok()
}

const handleAddToJump = (manifest: Manifest, body: Body) => {
  const jumpId = asString(body.jumpId)
  const filePaths = asStringArray(body.filePaths)
  if (filePaths.length === 0) return fail('No files specified')
  const r = requireJump(manifest, jumpId)
  if ('error' in r) return fail(r.error)
  if (r.jump.processed) return fail('Cannot add files to a processed jump — unprocess first')
  for (const filePath of filePaths) {
    const file = manifest.files.find((f) => f.path === filePath)
    if (file && !r.jump.files.some((f) => f.path === filePath)) r.jump.files.push(file)
  }
  return ok()
}

const handleRemoveFiles = (manifest: Manifest, body: Body) => {
  const jumpId = asString(body.jumpId)
  const filePaths = asStringArray(body.filePaths)
  if (filePaths.length === 0) return fail('No files specified')
  const r = requireJump(manifest, jumpId)
  if ('error' in r) return fail(r.error)
  if (r.jump.processed) return fail('Cannot remove files from a processed jump — unprocess first')
  for (const filePath of filePaths) {
    const fileIdx = r.jump.files.findIndex((f) => f.path === filePath)
    if (fileIdx !== -1) r.jump.files.splice(fileIdx, 1)
  }
  return ok()
}

const handleShift = (manifest: Manifest, body: Body) => {
  if (isAllProcessed(manifest)) return fail('All jumps already processed')
  const paths = asStringArray(body.paths ?? body.targetPaths ?? body.referencePaths)
  const offsetSeconds =
    typeof body.offsetSeconds === 'number' ? body.offsetSeconds : Number(body.offsetSeconds ?? 0)
  if (paths.length === 0) return fail('No paths specified')
  if (offsetSeconds === 0) return fail('Offset is zero')
  const processedPaths = requireProcessedPaths(manifest)
  if (paths.some((p) => processedPaths.has(p)))
    return fail('Cannot shift files of a processed jump — unprocess first')
  const pathsSet = new Set(paths)
  shiftFiles(manifest, pathsSet, offsetSeconds)
  reclusterJumps(manifest, pathsSet)
  return ok(undefined, { offsetSeconds })
}

const handleCalibrate = (manifest: Manifest, body: Body) => {
  if (isAllProcessed(manifest)) return fail('All jumps already processed')
  const referencePaths = asStringArray(body.referencePaths)
  const targetPaths = asStringArray(body.targetPaths)
  const scope = asString(body.scope, 'single')
  if (referencePaths.length === 0 || targetPaths.length === 0) return fail('Missing sequence files')
  const mtimeOf = (p: string): number | undefined => manifest.files.find((f) => f.path === p)?.mtime
  const refTimes = referencePaths.map(mtimeOf).filter((t): t is number => t !== undefined)
  const targetTimes = targetPaths.map(mtimeOf).filter((t): t is number => t !== undefined)
  if (refTimes.length === 0 || targetTimes.length === 0) return fail('Sequence files not found')
  const offsetSeconds = Math.min(...refTimes) - Math.min(...targetTimes)
  const pathsToShift =
    scope === 'all' ? new Set(manifest.files.map((f) => f.path)) : new Set(targetPaths)
  shiftFiles(manifest, pathsToShift, offsetSeconds)
  if (scope === 'all') manifest.cameraClockOffsetSeconds = offsetSeconds
  reclusterJumps(manifest, pathsToShift)
  return ok(undefined, { offsetSeconds })
}

const handleResetCalibration = (manifest: Manifest) => {
  if (isAllProcessed(manifest)) return fail('All jumps already processed')
  for (const file of manifest.files) {
    if (file.originalMtime !== undefined) {
      file.mtime = file.originalMtime
      delete file.originalMtime
    }
  }
  for (const jump of manifest.jumps) {
    for (const file of jump.files) {
      if (file.originalMtime !== undefined) {
        file.mtime = file.originalMtime
        delete file.originalMtime
      }
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
  saveManifest(manifest)
  const manifestPath = getManifestPath()
  const executeScript = path.join(process.cwd(), '..', 'scripts', 'execute_media.sh')
  const jumpArgs = toProcess.map((j) => `"${j.id}"`).join(' ')
  try {
    execSync(`"${executeScript}" "${manifestPath}" ${jumpArgs} 2>&1`, {
      timeout: 300_000,
      env: { ...process.env, SKYDOCK_OUTPUT_DIR: getOutputDirPath() }
    })
  } catch (e) {
    return fail(`Execution failed: ${e instanceof Error ? e.message : String(e)}`)
  }
  const updated = loadManifest()
  if (updated) {
    for (const jump of updated.jumps) if (jumpIds.includes(jump.id)) jump.processed = true
    if (updated.jumps.length > 0 && updated.jumps.every((j) => j.processed))
      updated.status = 'executed'
    else if (updated.jumps.some((j) => j.processed)) updated.status = 'confirmed'
    saveManifest(updated)
    return ok(updated)
  }
  return ok(loadManifest() ?? undefined)
}

const handleUnprocess = (manifest: Manifest, body: Body) => {
  const jumpId = asString(body.jumpId)
  const r = requireJump(manifest, jumpId)
  if ('error' in r) return fail(r.error)
  if (!r.jump.processed) return fail('Jump not processed')
  const dir = path.join(getOutputDirPath(), 'processed', jumpId)
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  } catch {}
  delete r.jump.processed
  if (manifest.status === 'executed') manifest.status = 'confirmed'
  return ok()
}

const handlers: Record<
  string,
  (
    manifest: Manifest,
    body: Body
  ) => { ok: boolean; error?: string; offsetSeconds?: number } | { ok: boolean; error: string }
> = {
  'update-label': (m, b) => handleUpdateLabel(m, b),
  'confirm-jump': (m, b) => handleConfirmJump(m, b),
  'confirm-all': (m, b) => handleConfirmAll(m, b),
  'delete-jump': (m, b) => handleDeleteJump(m, b),
  'create-jump': (m) => handleCreateJump(m),
  confirm: (m) => {
    m.status = 'confirmed'
    return ok()
  },
  'move-files': (m, b) => handleMoveFiles(m, b),
  'add-to-jump': (m, b) => handleAddToJump(m, b),
  'remove-files': (m, b) => handleRemoveFiles(m, b),
  'update-start-datetime': (m, b) => {
    const startDatetime = asString(b.startDatetime)
    if (!startDatetime) return fail('No datetime provided')
    m.startDatetime = startDatetime
    return ok()
  },
  'reset-timestamps': (m, b) => {
    const jumpId = asString(b.jumpId)
    const r = requireJump(m, jumpId)
    if ('error' in r) return fail(r.error)
    const sortedFiles = [...r.jump.files].sort((a, b) => a.mtime - b.mtime)
    const baseEpoch =
      sortedFiles.length > 0 ? sortedFiles[0].mtime : new Date(m.startDatetime).getTime() / 1000
    let offset = 0
    for (const file of r.jump.files) {
      file.mtime = baseEpoch + offset
      offset += 30
    }
    return ok()
  },
  'calibrate-sequences': (m, b) => handleCalibrate(m, b),
  'shift-sequences': (m, b) => handleShift(m, b),
  'reset-calibration': (m) => handleResetCalibration(m),
  'execute-jumps': (m, b) => handleExecute(m, b),
  'unprocess-jump': (m, b) => handleUnprocess(m, b)
}

const loader = async () => {
  const manifest = loadManifest()
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
    saveManifest(loaded.manifest)
    return { ok: true, manifest: loaded.manifest, ...(result as Record<string, unknown>) }
  }

  return { ok: true, manifest: result.manifest, ...(result as Record<string, unknown>) }
}

export { loader, action }
