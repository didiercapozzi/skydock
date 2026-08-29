import { execSync } from 'node:child_process'
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
