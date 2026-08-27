import type { Route } from './+types/api.manifest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { getOutputDirPath } from '../lib/scanner.server'
import type { Manifest, ManifestFile, ManifestJump } from '../lib/types'

const getManifestPath = (): string => {
  return path.join(getOutputDirPath(), 'proposed_jumps.json')
}

const loadManifest = (): Manifest | null => {
  const manifestPath = getManifestPath()
  if (!fs.existsSync(manifestPath)) return null
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest
  } catch {
    return null
  }
}

const saveManifest = (manifest: Manifest): void => {
  fs.writeFileSync(getManifestPath(), JSON.stringify(manifest, null, 2))
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

  manifest.jumps = mergedGroups.map((files, idx) => {
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
    return {
      id: preservedJump?.id ?? `jump_${idx + 1}`,
      label: dominant?.label ?? preservedJump?.label ?? `Jump ${idx + 1}`,
      confirmed: dominant?.confirmed ?? preservedJump?.confirmed ?? false,
      processed: dominant?.processed ?? preservedJump?.processed,
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
}

const loader = async () => {
  const manifest = loadManifest()
  return { manifest }
}

const action = async ({ request }: Route.ActionArgs) => {
  const body = await request.json()
  const formAction = String(body.action ?? '')

  if (formAction === 'update-label') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }

    const jumpId = String(body.jumpId ?? '')
    const label = String(body.label ?? '')
    const jump = manifest.jumps.find((j: ManifestJump) => j.id === jumpId)
    if (!jump) return { ok: false, error: 'Jump not found' }

    jump.label = label
    saveManifest(manifest)
    return { ok: true, manifest }
  }

  if (formAction === 'confirm-jump') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }

    const jumpId = String(body.jumpId ?? '')
    const confirmed = Boolean(body.confirmed)
    const jump = manifest.jumps.find((j: ManifestJump) => j.id === jumpId)
    if (!jump) return { ok: false, error: 'Jump not found' }

    jump.confirmed = confirmed
    saveManifest(manifest)
    return { ok: true, manifest }
  }

  if (formAction === 'confirm-all') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }

    const confirmed = Boolean(body.confirmed)
    for (const jump of manifest.jumps) {
      jump.confirmed = confirmed
    }
    saveManifest(manifest)
    return { ok: true, manifest }
  }

  if (formAction === 'delete-jump') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }

    const jumpId = String(body.jumpId ?? '')
    const idx = manifest.jumps.findIndex((j: ManifestJump) => j.id === jumpId)
    if (idx === -1) return { ok: false, error: 'Jump not found' }

    const jump = manifest.jumps[idx]
    if (jump.processed) {
      const dir = path.join(getOutputDirPath(), 'processed', jumpId)
      try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
      } catch {}
    }

    manifest.jumps.splice(idx, 1)
    saveManifest(manifest)
    return { ok: true, manifest }
  }

  if (formAction === 'create-jump') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }

    const newId = `jump_${Date.now()}`
    const newJump: ManifestJump = {
      id: newId,
      label: `Jump ${manifest.jumps.length + 1}`,
      confirmed: false,
      files: []
    }
    manifest.jumps.push(newJump)
    saveManifest(manifest)
    return { ok: true, manifest }
  }

  if (formAction === 'confirm') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }

    manifest.status = 'confirmed'
    saveManifest(manifest)
    return { ok: true, manifest }
  }

  if (formAction === 'move-files') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }

    const fromJumpId = String(body.fromJumpId ?? '')
    const toJumpId = String(body.toJumpId ?? '')
    const filePaths = body.filePaths as string[] | undefined

    if (!filePaths || filePaths.length === 0) {
      return { ok: false, error: 'No files specified' }
    }

    const fromJump = manifest.jumps.find((j: ManifestJump) => j.id === fromJumpId)
    const toJump = manifest.jumps.find((j: ManifestJump) => j.id === toJumpId)
    if (!fromJump || !toJump) return { ok: false, error: 'Jump not found' }
    if (fromJump.processed || toJump.processed) {
      return { ok: false, error: 'Cannot move files of a processed jump — unprocess first' }
    }

    for (const filePath of filePaths) {
      const fileIdx = fromJump.files.findIndex((f) => f.path === filePath)
      if (fileIdx !== -1) {
        const [file] = fromJump.files.splice(fileIdx, 1)
        toJump.files.push(file)
      }
    }

    saveManifest(manifest)
    return { ok: true, manifest }
  }

  if (formAction === 'add-to-jump') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }

    const jumpId = String(body.jumpId ?? '')
    const filePaths = body.filePaths as string[] | undefined

    if (!filePaths || filePaths.length === 0) {
      return { ok: false, error: 'No files specified' }
    }

    const jump = manifest.jumps.find((j: ManifestJump) => j.id === jumpId)
    if (!jump) return { ok: false, error: 'Jump not found' }
    if (jump.processed) {
      return { ok: false, error: 'Cannot add files to a processed jump — unprocess first' }
    }

    for (const filePath of filePaths) {
      const file = manifest.files.find((f) => f.path === filePath)
      if (file && !jump.files.some((f) => f.path === filePath)) {
        jump.files.push(file)
      }
    }

    saveManifest(manifest)
    return { ok: true, manifest }
  }

  if (formAction === 'remove-files') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }

    const jumpId = String(body.jumpId ?? '')
    const filePaths = body.filePaths as string[] | undefined

    if (!filePaths || filePaths.length === 0) {
      return { ok: false, error: 'No files specified' }
    }

    const jump = manifest.jumps.find((j: ManifestJump) => j.id === jumpId)
    if (!jump) return { ok: false, error: 'Jump not found' }
    if (jump.processed) {
      return { ok: false, error: 'Cannot remove files from a processed jump — unprocess first' }
    }

    for (const filePath of filePaths) {
      const fileIdx = jump.files.findIndex((f) => f.path === filePath)
      if (fileIdx !== -1) {
        jump.files.splice(fileIdx, 1)
      }
    }

    saveManifest(manifest)
    return { ok: true, manifest }
  }

  if (formAction === 'update-start-datetime') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }

    const startDatetime = String(body.startDatetime ?? '')
    if (!startDatetime) return { ok: false, error: 'No datetime provided' }

    manifest.startDatetime = startDatetime
    saveManifest(manifest)
    return { ok: true, manifest }
  }

  if (formAction === 'reset-timestamps') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }

    const jumpId = String(body.jumpId ?? '')
    const jump = manifest.jumps.find((j: ManifestJump) => j.id === jumpId)
    if (!jump) return { ok: false, error: 'Jump not found' }

    const sortedFiles = [...jump.files].sort((a, b) => a.mtime - b.mtime)
    const baseEpoch =
      sortedFiles.length > 0
        ? sortedFiles[0].mtime
        : new Date(manifest.startDatetime).getTime() / 1000

    let offset = 0
    for (const file of jump.files) {
      file.mtime = baseEpoch + offset
      offset += 30
    }

    saveManifest(manifest)
    return { ok: true, manifest }
  }

  if (formAction === 'calibrate-sequences') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }
    if (manifest.status === 'executed' || manifest.jumps.every((j) => j.processed))
      return { ok: false, error: 'All jumps already processed' }

    const referencePaths = (body.referencePaths ?? []) as string[]
    const targetPaths = (body.targetPaths ?? []) as string[]
    const scope = String(body.scope ?? 'single')

    if (referencePaths.length === 0 || targetPaths.length === 0) {
      return { ok: false, error: 'Missing sequence files' }
    }

    const mtimeOf = (p: string): number | undefined =>
      manifest.files.find((f) => f.path === p)?.mtime
    const refTimes = referencePaths.map(mtimeOf).filter((t): t is number => t !== undefined)
    const targetTimes = targetPaths.map(mtimeOf).filter((t): t is number => t !== undefined)

    if (refTimes.length === 0 || targetTimes.length === 0) {
      return { ok: false, error: 'Sequence files not found' }
    }

    const offsetSeconds = Math.min(...refTimes) - Math.min(...targetTimes)
    const pathsToShift =
      scope === 'all' ? new Set(manifest.files.map((f) => f.path)) : new Set(targetPaths)

    shiftFiles(manifest, pathsToShift, offsetSeconds)
    if (scope === 'all') manifest.cameraClockOffsetSeconds = offsetSeconds

    reclusterJumps(manifest, pathsToShift)
    saveManifest(manifest)
    return { ok: true, offsetSeconds }
  }

  if (formAction === 'shift-sequences') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }
    if (manifest.status === 'executed' || manifest.jumps.every((j) => j.processed))
      return { ok: false, error: 'All jumps already processed' }

    const paths = (body.paths ?? []) as string[]
    const offsetSeconds = Number(body.offsetSeconds ?? 0)

    if (paths.length === 0) return { ok: false, error: 'No paths specified' }
    if (offsetSeconds === 0) return { ok: false, error: 'Offset is zero' }

    const processedPaths = new Set(
      manifest.jumps.filter((j) => j.processed).flatMap((j) => j.files.map((f) => f.path))
    )
    if (paths.some((p) => processedPaths.has(p))) {
      return { ok: false, error: 'Cannot shift files of a processed jump — unprocess first' }
    }

    shiftFiles(manifest, new Set(paths), offsetSeconds)
    reclusterJumps(manifest, new Set(paths))
    saveManifest(manifest)
    return { ok: true, offsetSeconds }
  }

  if (formAction === 'reset-calibration') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }
    if (manifest.status === 'executed' || manifest.jumps.every((j) => j.processed))
      return { ok: false, error: 'All jumps already processed' }

    for (const file of manifest.files) {
      if (file.originalMtime !== undefined) {
        file.mtime = file.originalMtime
        delete file.originalMtime
      }
    }
    delete manifest.cameraClockOffsetSeconds

    reclusterJumps(manifest)
    saveManifest(manifest)
    return { ok: true }
  }

  if (formAction === 'execute-jumps') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }

    let jumpIds = (body.jumpIds ?? []) as string[]
    if (jumpIds.length === 0) {
      jumpIds = manifest.jumps.filter((j) => j.confirmed && !j.processed).map((j) => j.id)
    }
    if (jumpIds.length === 0) {
      return { ok: false, error: 'No jumps to process' }
    }

    const toProcess = manifest.jumps.filter((j) => jumpIds.includes(j.id) && !j.processed)
    if (toProcess.length === 0) {
      return { ok: false, error: 'Jumps already processed' }
    }

    for (const jump of toProcess) {
      jump.confirmed = true
    }
    saveManifest(manifest)

    const manifestPath = getManifestPath()
    const scriptsDir = path.join(process.cwd(), '..', 'scripts')
    const executeScript = path.join(scriptsDir, 'execute_media.sh')
    const jumpArgs = toProcess.map((j) => `"${j.id}"`).join(' ')

    try {
      execSync(`"${executeScript}" "${manifestPath}" ${jumpArgs} 2>&1`, {
        timeout: 300_000,
        env: { ...process.env, SKYDOCK_OUTPUT_DIR: getOutputDirPath() }
      })
    } catch (e) {
      return { ok: false, error: `Execution failed: ${e instanceof Error ? e.message : String(e)}` }
    }

    const updated = loadManifest()
    if (updated) {
      for (const jump of updated.jumps) {
        if (jumpIds.includes(jump.id)) jump.processed = true
      }
      if (updated.jumps.length > 0 && updated.jumps.every((j) => j.processed)) {
        updated.status = 'executed'
      } else if (updated.jumps.some((j) => j.processed)) {
        updated.status = 'confirmed'
      }
      saveManifest(updated)
      return { ok: true, manifest: updated }
    }

    return { ok: true, manifest: loadManifest() }
  }

  if (formAction === 'unprocess-jump') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }

    const jumpId = String(body.jumpId ?? '')
    const jump = manifest.jumps.find((j) => j.id === jumpId)
    if (!jump) return { ok: false, error: 'Jump not found' }
    if (!jump.processed) return { ok: false, error: 'Jump not processed' }

    const processedDir = path.join(getOutputDirPath(), 'processed', jumpId)
    try {
      if (fs.existsSync(processedDir)) {
        fs.rmSync(processedDir, { recursive: true, force: true })
      }
    } catch {}

    delete jump.processed
    if (manifest.status === 'executed') manifest.status = 'confirmed'

    saveManifest(manifest)
    return { ok: true, manifest }
  }

  return { ok: false, error: 'Invalid action' }
}

export { loader, action }
