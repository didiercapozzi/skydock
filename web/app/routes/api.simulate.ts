import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import path from 'node:path'
import { getOutputDirPath } from '../lib/scanner.server'
import { ensureManifestFileIds } from '../lib/fileId.server'

const SCRIPTS_DIR = path.join(process.cwd(), '..', 'scripts')

const action = async ({ request }: { request: Request }) => {
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, error: 'Simulation is only available in development' }
  }

  const formData = await request.formData()
  const formAction = String(formData.get('action') ?? '')

  const outputDir = getOutputDirPath()
  const simBase = path.join(process.cwd(), '..', '.sim')
  const processScript = path.join(SCRIPTS_DIR, 'process_media.sh')
  const scanScript = path.join(SCRIPTS_DIR, 'scan_media.sh')

  if (formAction === 'add-jump') {
    const simulateScript = path.join(SCRIPTS_DIR, 'simulate_cameras.sh')
    try {
      execSync(`"${simulateScript}" --output "${simBase}" --num-files 4`, { timeout: 30_000 })
    } catch (e) {
      return {
        ok: false,
        error: `Simulation failed: ${e instanceof Error ? e.message : String(e)}`
      }
    }

    const camera1 = path.join(simBase, 'camera1')
    const camera2 = path.join(simBase, 'camera2')
    const cameraDirs = []
    if (camera1) cameraDirs.push(`"${camera1}"`)
    if (camera2) cameraDirs.push(`"${camera2}"`)

    if (cameraDirs.length > 0) {
      try {
        execSync(
          `SKYDOCK_OUTPUT_DIR="${outputDir}" "${processScript}" ${cameraDirs.join(' ')} 2>&1`,
          {
            timeout: 60_000
          }
        )
      } catch (e) {
        return { ok: false, error: `Process failed: ${e instanceof Error ? e.message : String(e)}` }
      }
    }

    try {
      execSync(`SKYDOCK_OUTPUT_DIR="${outputDir}" "${scanScript}" 2>&1`, {
        timeout: 30_000
      })
    } catch (e) {
      return { ok: false, error: `Scan failed: ${e instanceof Error ? e.message : String(e)}` }
    }

    await ensureManifestFileIds(path.join(outputDir, 'manifest.json'))
    return { ok: true }
  }

  try {
    fs.rmSync(outputDir, { recursive: true, force: true })
  } catch {}

  const simulateScript = path.join(SCRIPTS_DIR, 'simulate_cameras.sh')
  try {
    execSync(`"${simulateScript}" --output "${simBase}" --clean --dev-data`, {
      timeout: 30_000
    })
  } catch (e) {
    return { ok: false, error: `Simulation failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  const camera1 = path.join(simBase, 'camera1')
  const camera2 = path.join(simBase, 'camera2')
  const cameraDirs = []
  if (camera1) cameraDirs.push(`"${camera1}"`)
  if (camera2) cameraDirs.push(`"${camera2}"`)

  if (cameraDirs.length > 0) {
    try {
      execSync(
        `SKYDOCK_OUTPUT_DIR="${outputDir}" "${processScript}" ${cameraDirs.join(' ')} 2>&1`,
        {
          timeout: 60_000
        }
      )
    } catch (e) {
      return { ok: false, error: `Process failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  }

  try {
    execSync(`SKYDOCK_OUTPUT_DIR="${outputDir}" "${scanScript}" 2>&1`, {
      timeout: 30_000
    })
  } catch (e) {
    return { ok: false, error: `Scan failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  await ensureManifestFileIds(path.join(outputDir, 'manifest.json'))

  return { ok: true }
}

export { action }
