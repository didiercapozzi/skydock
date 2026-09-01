import * as fs from 'node:fs'
import * as crypto from 'node:crypto'
import { manifestSchema } from './types'
import type { Manifest } from './types'
import { getExtensionSafe, getThumbDir, getProxyDir } from './utils'

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
  if (!fs.existsSync(manifestPath)) return

  let manifest: Manifest
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    manifest = manifestSchema.parse(raw)
  } catch {
    return
  }

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
    if (file.thumbPath === null) {
      delete file.thumbPath
      normalized = true
    }
    if (file.proxyPath === null) {
      delete file.proxyPath
      normalized = true
    }
  }
  if (normalized) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  }

  let changed = false
  const entries = [...manifest.files, ...manifest.theory, ...manifest.jumps.flatMap((j) => j.files)]
  const outputDir = manifestPath.replace(/\/manifest\.json$/, '')
  const thumbDir = getThumbDir(outputDir)
  const proxyDirPath = getProxyDir(outputDir)
  for (const file of entries) {
    if (!file.id) continue
    const ext = getExtensionSafe(file.path)
    const isVideo = ['mp4', 'mov', 'avi', 'mkv'].includes(ext)

    if (isVideo) {
      const expectedThumb = `${thumbDir}/${file.id}.jpg`
      const expectedProxy = `${proxyDirPath}/${file.id}.mp4`
      const thumbExists = fs.existsSync(expectedThumb)
      const proxyExists = fs.existsSync(expectedProxy)

      if (thumbExists) {
        if (file.thumbPath !== expectedThumb) {
          file.thumbPath = expectedThumb
          changed = true
        }
      } else if (file.thumbPath !== undefined) {
        delete file.thumbPath
        changed = true
      }
      if (proxyExists) {
        if (file.proxyPath !== expectedProxy) {
          file.proxyPath = expectedProxy
          changed = true
        }
      } else if (file.proxyPath !== undefined) {
        delete file.proxyPath
        changed = true
      }
    } else {
      if (file.thumbPath !== undefined) {
        delete file.thumbPath
        changed = true
      }
      if (file.proxyPath !== undefined) {
        delete file.proxyPath
        changed = true
      }
    }
  }

  if (!changed) return
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

export { computeFileId, ensureManifestFileIds }
