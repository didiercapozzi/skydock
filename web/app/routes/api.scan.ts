import { execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { getOutputDirPath } from '../lib/scanner.server'
import { ensureManifestFileIds } from '../lib/fileId.server'

const SCRIPTS_DIR = path.join(process.cwd(), '..', 'scripts')

const action = async () => {
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, error: 'Scan is only available in development' }
  }

  const outputDir = getOutputDirPath()
  const scanScript = path.join(SCRIPTS_DIR, 'scan_media.sh')

  // Resolve camera directories from CAM_MOUNT_PATH or fall back to simulated
  const camMount = process.env.CAM_MOUNT_PATH
  let cameraDirs: string[] = []

  if (camMount && existsSync(camMount)) {
    // Check for subdirectories (each is a camera)
    const subdirs = readdirSync(camMount).filter((d) =>
      existsSync(path.join(camMount, d))
    )
    if (subdirs.length > 0) {
      cameraDirs = subdirs.map((d) => path.join(camMount, d))
    } else {
      // Treat the mount itself as a single camera
      cameraDirs = [camMount]
    }
  } else {
    // Fall back to simulated cameras
    const simBase = path.join(process.cwd(), '..', '.sim')
    const cam1 = path.join(simBase, 'camera1')
    const cam2 = path.join(simBase, 'camera2')
    if (existsSync(cam1)) cameraDirs.push(cam1)
    if (existsSync(cam2)) cameraDirs.push(cam2)
  }

  if (cameraDirs.length === 0) {
    return { ok: false, error: 'No camera directories found' }
  }

  const cameraArgs = cameraDirs.map((d) => `"${d}"`).join(' ')

  try {
    execSync(`SKYDOCK_OUTPUT_DIR="${outputDir}" "${scanScript}" ${cameraArgs} 2>&1`, {
      timeout: 30_000
    })
  } catch (e) {
    return { ok: false, error: `Scan failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  await ensureManifestFileIds(path.join(outputDir, 'proposed_jumps.json'))

  return { ok: true }
}

export { action }
