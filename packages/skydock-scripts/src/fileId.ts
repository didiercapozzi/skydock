import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import { loadManifest, normalizeManifest, saveManifest } from './manifest'

const ID_HEX_LENGTH = 16

const computeFileId = async (filePath: string) => {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex').slice(0, ID_HEX_LENGTH)))
    stream.on('error', reject)
  })
}

const ensureManifestFileIds = async (manifestPath: string) => {
  const manifest = loadManifest(manifestPath)
  if (!manifest) return
  let changed = false
  for (const file of manifest.files) {
    if (!file.id && fs.existsSync(file.path)) {
      file.id = await computeFileId(file.path)
      changed = true
    }
  }
  if (normalizeManifest(manifest)) changed = true
  if (changed) saveManifest(manifestPath, manifest)
}

export { computeFileId, ensureManifestFileIds }
