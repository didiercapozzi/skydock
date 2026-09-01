import * as fs from 'node:fs'
import * as crypto from 'node:crypto'
import { loadManifest, saveManifest } from './manifest'
import { getExtensionSafe, getFilmstripDir, getThumbDir } from './utils'

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
    if (file.thumbPath === null) {
      delete file.thumbPath
      normalized = true
    }
    if (file.filmstripDir === null) {
      delete file.filmstripDir
      normalized = true
    }
    if (file.keyframes === null) {
      delete file.keyframes
      normalized = true
    }
  }
  if (normalized) {
    saveManifest(manifestPath, manifest)
  }

  let changed = false
  const entries = [...manifest.files, ...manifest.theory, ...manifest.jumps.flatMap((j) => j.files)]
  const outputDir = manifestPath.replace(/\/manifest\.json$/, '')
  const thumbDir = getThumbDir(outputDir)
  const filmstripBase = getFilmstripDir(outputDir)
  for (const file of entries) {
    if (!file.id) continue
    const ext = getExtensionSafe(file.path)
    const isVideo = ['mp4', 'mov', 'avi', 'mkv'].includes(ext)

    if (isVideo) {
      const expectedThumb = `${thumbDir}/${file.id}.jpg`
      const expectedFilmstrip = `${filmstripBase}/${file.id}`
      const thumbExists = fs.existsSync(expectedThumb)
      const filmstripExists = fs.existsSync(`${expectedFilmstrip}/0001.jpg`)

      if (thumbExists) {
        if (file.thumbPath !== expectedThumb) {
          file.thumbPath = expectedThumb
          changed = true
        }
      } else if (file.thumbPath !== undefined) {
        delete file.thumbPath
        changed = true
      }
      if (filmstripExists) {
        if (file.filmstripDir !== expectedFilmstrip) {
          file.filmstripDir = expectedFilmstrip
          changed = true
        }
      } else if (file.filmstripDir !== undefined) {
        delete file.filmstripDir
        changed = true
      }
    } else {
      if (file.thumbPath !== undefined) {
        delete file.thumbPath
        changed = true
      }
      if (file.filmstripDir !== undefined) {
        delete file.filmstripDir
        changed = true
      }
      if (file.keyframes !== undefined) {
        delete file.keyframes
        changed = true
      }
    }
  }

  if (!changed) return
  saveManifest(manifestPath, manifest)
}

export { computeFileId, ensureManifestFileIds }
