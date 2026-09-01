import * as fs from 'node:fs'
import { manifestSchema } from './types'
import type { Manifest } from './types'

const loadManifest = (manifestPath: string): Manifest | null => {
  if (!fs.existsSync(manifestPath)) return null
  try {
    return manifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')))
  } catch {
    return null
  }
}

const saveManifest = (manifestPath: string, manifest: Manifest): void => {
  const dir = manifestPath.replace(/\/manifest\.json$/, '')
  fs.mkdirSync(dir, { recursive: true })

  const tmpPath = `${manifestPath}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(manifest, null, 2))
  fs.renameSync(tmpPath, manifestPath)
}

const normalizeManifest = (manifest: Manifest): void => {
  for (const jump of manifest.jumps) {
    if (jump.processed === null) {
      delete jump.processed
    }
  }
  if (manifest.cameraClockOffsetSeconds === null) {
    delete manifest.cameraClockOffsetSeconds
  }
  for (const file of [...manifest.files, ...manifest.theory, ...manifest.jumps.flatMap((j) => j.files)]) {
    if (file.id === null) delete file.id
    if (file.originalMtime === null) delete file.originalMtime
    if (file.cropStart === null) delete file.cropStart
    if (file.cropEnd === null) delete file.cropEnd
    if (file.thumbPath === null) delete file.thumbPath
    if (file.proxyPath === null) delete file.proxyPath
  }
}

export { loadManifest, normalizeManifest, saveManifest }
