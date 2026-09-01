import * as fs from 'node:fs'
import path from 'node:path'
import { getOutputDirPath } from '../lib/scanner.server'
import { ensureManifestFileIds } from '@skydock/scripts'
import { scanMedia } from '@skydock/scripts'

const action = async () => {
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, error: 'Scan is only available in development' }
  }

  const outputDir = getOutputDirPath()
  const manifestPath = path.join(outputDir, 'manifest.json')

  try {
    await scanMedia({ outputDir })
  } catch (e) {
    return { ok: false, error: `Scan failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  if (!fs.existsSync(manifestPath)) {
    return {
      ok: false,
      error: 'No media files found. Run processMedia first to copy files from cameras.'
    }
  }

  await ensureManifestFileIds(manifestPath)

  return { ok: true }
}

export { action }
