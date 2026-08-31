import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
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
  const manifestPath = path.join(outputDir, 'manifest.json')

  let output = ''
  try {
    output = execSync(`SKYDOCK_OUTPUT_DIR="${outputDir}" "${scanScript}" 2>&1`, {
      timeout: 300_000
    }).toString()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const scriptMsg = output || msg
    return { ok: false, error: `Scan failed: ${scriptMsg}` }
  }

  if (!fs.existsSync(manifestPath)) {
    return { ok: false, error: 'No media files found. Run process_media.sh first to copy files from cameras.' }
  }

  await ensureManifestFileIds(manifestPath)

  return { ok: true }
}

export { action }
