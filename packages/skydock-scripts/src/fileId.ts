import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import { loadManifest, normalizeManifest, saveManifest } from './manifest'

const ID_HEX_LENGTH = 16

const computeFileId = async (filePath: string): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex').slice(0, ID_HEX_LENGTH)))
    stream.on('error', reject)
  })
}

const ensureManifestFileIds = async (manifestPath: string): Promise<void> => {
  const manifest = loadManifest(manifestPath)
  if (!manifest) return
  const changed = normalizeManifest(manifest)
  if (changed) saveManifest(manifestPath, manifest)
}

export { computeFileId, ensureManifestFileIds }
