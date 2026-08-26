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

const reclusterJumps = (manifest: Manifest): void => {
  const sorted = [...manifest.files].sort((a, b) => a.mtime - b.mtime)
  const groups: ManifestFile[][] = []
  let current: ManifestFile[] = []
  let lastMtime = 0

  for (const file of sorted) {
    if (current.length > 0 && file.mtime - lastMtime > JUMP_GAP_SECONDS) {
      groups.push(current)
      current = []
    }
    current.push(file)
    lastMtime = file.mtime
  }
  if (current.length > 0) groups.push(current)

  const previousByPath = new Map<string, ManifestJump>()
  for (const jump of manifest.jumps) {
    for (const file of jump.files) previousByPath.set(file.path, jump)
  }

  manifest.jumps = groups.map((files, idx) => {
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
    return {
      id: `jump_${idx + 1}`,
      label: dominant?.label ?? `Jump ${idx + 1}`,
      confirmed: dominant?.confirmed ?? false,
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
      offset += file.camera === 'PHOTO' ? 30 : 35
    }

    saveManifest(manifest)
    return { ok: true, manifest }
  }

  if (formAction === 'calibrate-sequences') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }
    if (manifest.status === 'executed') return { ok: false, error: 'Manifest already executed' }

    const referencePaths = (body.referencePaths ?? []) as string[]
    const targetPaths = (body.targetPaths ?? []) as string[]
    const scope = String(body.scope ?? 'single')
    const camera = body.camera === 'VIDEO' ? 'VIDEO' : 'PHOTO'

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
      scope === 'camera'
        ? new Set(manifest.files.filter((f) => f.camera === camera).map((f) => f.path))
        : new Set(targetPaths)

    shiftFiles(manifest, pathsToShift, offsetSeconds)
    if (scope === 'camera') manifest.cameraClockOffsetSeconds = offsetSeconds

    reclusterJumps(manifest)
    saveManifest(manifest)
    return { ok: true, offsetSeconds }
  }

  if (formAction === 'reset-calibration') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }
    if (manifest.status === 'executed') return { ok: false, error: 'Manifest already executed' }

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
    if (manifest.status === 'executed') return { ok: false, error: 'Manifest already executed' }

    const jumpIds = (body.jumpIds ?? []) as string[]
    if (jumpIds.length === 0) {
      return { ok: false, error: 'No jumps specified' }
    }

    for (const jump of manifest.jumps) {
      if (jumpIds.includes(jump.id)) jump.confirmed = true
    }
    manifest.status = 'confirmed'
    saveManifest(manifest)

    const manifestPath = getManifestPath()
    const scriptsDir = path.join(process.cwd(), '..', 'scripts')
    const executeScript = path.join(scriptsDir, 'execute_media.sh')

    try {
      execSync(`"${executeScript}" "${manifestPath}" 2>&1`, {
        timeout: 300_000,
        env: { ...process.env, SKYDOCK_OUTPUT_DIR: getOutputDirPath() }
      })
    } catch (e) {
      return { ok: false, error: `Execution failed: ${e instanceof Error ? e.message : String(e)}` }
    }

    const updated = loadManifest()
    return { ok: true, manifest: updated }
  }

  return { ok: false, error: 'Invalid action' }
}

export { loader, action }
