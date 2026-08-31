import * as fs from 'node:fs'
import * as nodeCrypto from 'node:crypto'
import { manifestSchema } from './types'
import type { Manifest } from './types'

const HEAD_BYTES = 1_048_576
const TAIL_BYTES = 65_536
const ID_HEX_LENGTH = 16

const getSubtle = (): SubtleCrypto => {
  if (typeof globalThis.crypto !== 'undefined') {
    return globalThis.crypto.subtle
  }
  return nodeCrypto.webcrypto.subtle as unknown as SubtleCrypto
}

export const computeFileId = async (filePath: string): Promise<string> => {
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

export const ensureManifestFileIds = async (manifestPath: string): Promise<void> => {
  if (!fs.existsSync(manifestPath)) return

  let manifest: Manifest
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    manifest = manifestSchema.parse(raw)
    let normalized = false
    for (const jump of manifest.jumps) {
      if ((jump as unknown as { processed: unknown }).processed === null) {
        delete (jump as unknown as Record<string, unknown>).processed
        normalized = true
      }
    }
    if (
      (manifest as unknown as { cameraClockOffsetSeconds: unknown }).cameraClockOffsetSeconds ===
      null
    ) {
      delete (manifest as unknown as Record<string, unknown>).cameraClockOffsetSeconds
      normalized = true
    }
    for (const file of [
      ...manifest.files,
      ...manifest.theory,
      ...manifest.jumps.flatMap((j) => j.files)
    ]) {
      if ((file as unknown as { id: unknown }).id === null)
        delete (file as unknown as Record<string, unknown>).id
      if ((file as unknown as { originalMtime: unknown }).originalMtime === null)
        delete (file as unknown as Record<string, unknown>).originalMtime
      if ((file as unknown as { cropStart: unknown }).cropStart === null)
        delete (file as unknown as Record<string, unknown>).cropStart
      if ((file as unknown as { cropEnd: unknown }).cropEnd === null)
        delete (file as unknown as Record<string, unknown>).cropEnd
      if ((file as unknown as { thumbPath: unknown }).thumbPath === null)
        delete (file as unknown as Record<string, unknown>).thumbPath
      if ((file as unknown as { proxyPath: unknown }).proxyPath === null)
        delete (file as unknown as Record<string, unknown>).proxyPath
    }
    if (normalized) {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    }
  } catch {
    return
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
  const thumbDir = `${outputDir}/.cache/thumbs`
  const proxyDir = `${outputDir}/.cache/proxies`
  for (const file of entries) {
    if (!file.id) continue
    const expectedThumb = `${thumbDir}/${file.id}.jpg`
    const expectedProxy = `${proxyDir}/${file.id}.mp4`
    if (file.thumbPath !== expectedThumb) {
      file.thumbPath = expectedThumb
      changed = true
    }
    if (file.proxyPath !== expectedProxy) {
      file.proxyPath = expectedProxy
      changed = true
    }
  }

  if (!changed) return
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}
