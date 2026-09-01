import * as fs from 'node:fs'
import path from 'node:path'
import { getOutputDirPath } from '../lib/scanner.server'
import { ensureManifestFileIds } from '@skydock/scripts'
import { simulateCameras, processMedia, scanMedia } from '@skydock/scripts'

const action = async ({ request }: { request: Request }) => {
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, error: 'Simulation is only available in development' }
  }

  const formData = await request.formData()
  const formAction = String(formData.get('action') ?? '')

  const outputDir = getOutputDirPath()
  const simBase = path.join(process.cwd(), '..', '.sim')

  if (formAction === 'add-jump') {
    try {
      await simulateCameras({ outputDir: simBase, numFiles: 4 })
    } catch (e) {
      return {
        ok: false,
        error: `Simulation failed: ${e instanceof Error ? e.message : String(e)}`
      }
    }

    const camera1 = path.join(simBase, 'camera1')
    const camera2 = path.join(simBase, 'camera2')
    const cameraDirs = [camera1, camera2].filter((d) => fs.existsSync(d))

    if (cameraDirs.length > 0) {
      try {
        processMedia({ cameraDirs, outputDir })
      } catch (e) {
        return { ok: false, error: `Process failed: ${e instanceof Error ? e.message : String(e)}` }
      }
    }

    try {
      await scanMedia({ outputDir })
    } catch (e) {
      return { ok: false, error: `Scan failed: ${e instanceof Error ? e.message : String(e)}` }
    }

    await ensureManifestFileIds(path.join(outputDir, 'manifest.json'))
    return { ok: true }
  }

  try {
    fs.rmSync(outputDir, { recursive: true, force: true })
  } catch {}

  try {
    await simulateCameras({ outputDir: simBase, clean: true, devData: true })
  } catch (e) {
    return {
      ok: false,
      error: `Simulation failed: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  const camera1 = path.join(simBase, 'camera1')
  const camera2 = path.join(simBase, 'camera2')
  const cameraDirs = [camera1, camera2].filter((d) => fs.existsSync(d))

  if (cameraDirs.length > 0) {
    try {
      processMedia({ cameraDirs, outputDir })
    } catch (e) {
      return { ok: false, error: `Process failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  }

  try {
    await scanMedia({ outputDir })
  } catch (e) {
    return { ok: false, error: `Scan failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  await ensureManifestFileIds(path.join(outputDir, 'manifest.json'))

  return { ok: true }
}

export { action }
