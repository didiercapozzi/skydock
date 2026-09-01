import * as fs from 'node:fs'
import * as nodeCrypto from 'node:crypto'
import { manifestSchema } from './types'
import type { Manifest } from './types'
import { getExtensionSafe, getThumbDir, getProxyDir } from './utils'

const HEAD_BYTES = 1_048_576

const TAIL_BYTES = 65_536

const ID_HEX_LENGTH = 16

const getSubtle = (): SubtleCrypto => {
  if (typeof globalThis.crypto !== 'undefined') {
    return globalThis.crypto.subtle
  }
  return nodeCrypto.webcrypto.subtle as unknown as SubtleCrypto
}

const computeFileId = async (filePath: string): Promise<string> => {
  const stat = await fs.promises.stat(filePath)
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const size = stat.size
    const headLength = Math.min(HEAD_BYTES, size)
    const tailLength = Math.min(TAIL_BYTES, size)
    const head = Buffer.alloc(headLength)
    await handle.read(head, 0, headLength, 0)
    const tail = Buffer.alloc(tailLength)
    await handle.read(tail, 0, tailLength, Math.max(0, size - tailLength))
    const stream = Buffer.concat([head, tail, Buffer.from(`${size}\n`, 'utf-8')])
    const digest = await getSubtle().digest('SHA-256', stream)
    return Buffer.from(digest).toString('hex').slice(0, ID_HEX_LENGTH)
  } finally {
    await handle.close()
  }
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
  for (const file of [...manifest.files, ...manifest.theory, ...manifest.jumps.flatMap((j) => j.files)]) {
    if (file.id === null) { delete file.id; normalized = true }
    if (file.originalMtime === null) { delete file.originalMtime; normalized = true }
    if (file.cropStart === null) { delete file.cropStart; normalized = true }
    if (file.cropEnd === null) { delete file.cropEnd; normalized = true }
    if (file.thumbPath === null) { delete file.thumbPath; normalized = true }
    if (file.proxyPath === null) { delete file.proxyPath; normalized = true }
  }
  if (normalized) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  }

  let changed = false
  const idOwners = new Map<string, string>()
  for (const file of manifest.files) if (file.id) idOwners.set(file.id, file.path)
  for (const jump of manifest.jumps) {
    for (const file of jump.files) if (file.id) idOwners.set(file.id, file.path)
  }

  const entries = [...manifest.files, ...manifest.theory, ...manifest.jumps.flatMap((j) => j.files)]
  for (const file of entries) {
    if (file.id) continue
    if (!fs.existsSync(file.path)) continue
    try {
      file.id = await computeFileId(file.path)
    } catch {
      continue
    }
    const ownerPath = idOwners.get(file.id)
    if (ownerPath !== undefined && ownerPath !== file.path) {
      file.id = `${file.id}:${file.mtime.toString(36)}`
    }
    idOwners.set(file.id, file.path)
    changed = true
  }

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
        if (file.thumbPath !== expectedThumb) { file.thumbPath = expectedThumb; changed = true }
      } else if (file.thumbPath !== undefined) {
        delete file.thumbPath
        changed = true
      }
      if (proxyExists) {
        if (file.proxyPath !== expectedProxy) { file.proxyPath = expectedProxy; changed = true }
      } else if (file.proxyPath !== undefined) {
        delete file.proxyPath
        changed = true
      }
    } else {
      if (file.thumbPath !== undefined) { delete file.thumbPath; changed = true }
      if (file.proxyPath !== undefined) { delete file.proxyPath; changed = true }
    }
  }

  if (!changed) return
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

export { computeFileId, ensureManifestFileIds }
