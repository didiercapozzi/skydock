import { execSync } from 'node:child_process'
import path from 'node:path'
import { getOutputDirPath } from '../lib/scanner.server'

const SCRIPTS_DIR = path.join(process.cwd(), '..', 'scripts')

const action = async () => {
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, error: 'Simulation is only available in development' }
  }

  const outputDir = getOutputDirPath()
  const simBase = path.join(process.cwd(), '..', '.sim')

  try {
    execSync(
      `"${path.join(SCRIPTS_DIR, 'simulate_cameras.sh')}" --output "${simBase}" --jumps 2 --clean`,
      { timeout: 30_000, stdio: 'pipe' }
    )
  } catch (e) {
    return { ok: false, error: `Simulation failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  const photoDir = path.join(simBase, 'photo_cam')
  const videoDir = path.join(simBase, 'video_cam')

  try {
    execSync(
      `SKYDOCK_OUTPUT_DIR="${outputDir}" "${path.join(SCRIPTS_DIR, 'process_media.sh')}" "${photoDir}" "${videoDir}"`,
      { timeout: 30_000, stdio: 'pipe' }
    )
  } catch (e) {
    return {
      ok: false,
      error: `Processing failed: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  return { ok: true }
}

export { action }
