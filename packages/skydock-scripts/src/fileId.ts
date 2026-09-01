import * as fs from 'node:fs'
import * as crypto from 'node:crypto'
import { loadManifest, saveManifest } from './manifest'

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

  let normalized = false
  for (const jump of manifest.jumps) {
    if (jump.processed === null) {
      delete jump.processed
      normalized = true
    }
  }
  if (manifest.cameraClockOffsetSeconds === null) {
    delete manifest.cameraClockOffsetSeconds
    normalized = true
  }
  for (const file of [
    ...manifest.files,
    ...manifest.theory,
    ...manifest.jumps.flatMap((j) => j.files)
  ]) {
    if (file.originalMtime === null) {
      delete file.originalMtime
      normalized = true
    }
    if (file.cropStart === null) {
      delete file.cropStart
      normalized = true
    }
    if (file.cropEnd === null) {
      delete file.cropEnd
      normalized = true
    }
  }
  if (normalized) {
    saveManifest(manifestPath, manifest)
  }

  let changed = false
  const entries = [...manifest.files, ...manifest.theory, ...manifest.jumps.flatMap((j) => j.files)]
  for (const file of entries) {
    if (!file.id) continue
    // no thumb/filmstrip backfill in live mode — thumbs are live via api/stream
    if ((file as unknown as Record<string, unknown>).thumbPath !== undefined) {
      delete (file as unknown as Record<string, unknown>).thumbPath
      changed = true
    }
    if ((file as unknown as Record<string, unknown>).filmstripDir !== undefined) {
      delete (file as unknown as Record<string, unknown>).filmstripDir
      changed = true
    }
    if ((file as unknown as Record<string, unknown>).keyframes !== undefined) {
      delete (file as unknown as Record<string, unknown>).keyframes
      changed = true
    }
  }

  if (!changed && !normalized) return
  if (changed) saveManifest(manifestPath, manifest)
}

export { computeFileId, ensureManifestFileIds }
