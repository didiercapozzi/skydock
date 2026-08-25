import type { Route } from './+types/api.manifest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getOutputDirPath } from '../lib/scanner.server'
import type { Manifest, ManifestJump } from '../lib/types'

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

  if (formAction === 'move-file') {
    const manifest = loadManifest()
    if (!manifest) return { ok: false, error: 'No manifest found' }

    const fromJumpId = String(body.fromJumpId ?? '')
    const toJumpId = String(body.toJumpId ?? '')
    const filePath = String(body.filePath ?? '')

    const fromJump = manifest.jumps.find((j: ManifestJump) => j.id === fromJumpId)
    const toJump = manifest.jumps.find((j: ManifestJump) => j.id === toJumpId)
    if (!fromJump || !toJump) return { ok: false, error: 'Jump not found' }

    const fileIdx = fromJump.files.findIndex((f) => f.path === filePath)
    if (fileIdx === -1) return { ok: false, error: 'File not found in source jump' }

    const [file] = fromJump.files.splice(fileIdx, 1)
    toJump.files.push(file)
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

  return { ok: false, error: 'Invalid action' }
}

export { loader, action }
