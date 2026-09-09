import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { walkFiles } from './lib/fs'
import {
  createShareLink,
  dsmConfigSchema,
  dsmFetch,
  dsmLogin,
  dsmLogout,
  dsmValidateSession,
  loginWithSession
} from './nas'

const CHUNK_SIZE = 10 * 1024 * 1024

const publishArgsSchema = dsmConfigSchema.extend({
  localDir: z.string(),
  remoteDir: z.string(),
  outputDir: z.string().optional()
})
type PublishArgs = z.infer<typeof publishArgsSchema>

const uploadProgressSchema = z.object({
  filename: z.string(),
  bytesUploaded: z.number(),
  totalBytes: z.number()
})
type UploadProgress = z.infer<typeof uploadProgressSchema>

const remoteJoin = (...parts: string[]) => parts.join('/').replace(/\/+/g, '/')

const uploadChunk = async (
  host: string,
  sid: string,
  remoteDir: string,
  filename: string,
  chunk: Blob,
  chunkIndex: number,
  totalChunks: number
) => {
  const form = new FormData()
  form.append('path', remoteDir)
  form.append('create_parents', 'true')
  form.append('overwrite', 'true')
  form.append('file', chunk, filename)

  const body = await dsmFetch(
    host,
    { api: 'SYNO.FileStation.Upload', method: 'upload', version: '2', _sid: sid },
    form
  )
  if (!body.success) throw new Error(`Upload chunk ${chunkIndex + 1}/${totalChunks} failed`)
}

const uploadFile = async (
  host: string,
  sid: string,
  remoteDir: string,
  localPath: string,
  onProgress?: (progress: UploadProgress) => void
) => {
  const filename = path.basename(localPath)
  const stat = fs.statSync(localPath)
  const totalBytes = stat.size
  const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE))
  const fd = fs.openSync(localPath, 'r')

  try {
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const offset = chunkIndex * CHUNK_SIZE
      const length = Math.min(CHUNK_SIZE, totalBytes - offset)
      const buffer = Buffer.alloc(length)
      fs.readSync(fd, buffer, 0, length, offset)

      let lastError: Error | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await uploadChunk(
            host,
            sid,
            remoteDir,
            filename,
            new Blob([buffer]),
            chunkIndex,
            totalChunks
          )
          lastError = null
          break
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e))
        }
      }
      if (lastError) throw lastError

      onProgress?.({ filename, bytesUploaded: offset + length, totalBytes })
    }
  } finally {
    fs.closeSync(fd)
  }
}

const publishJump = async (args: PublishArgs, onProgress?: (progress: UploadProgress) => void) => {
  const { sid } = await loginWithSession(
    args,
    { login: dsmLogin, validate: dsmValidateSession },
    args.outputDir
  )
  try {
    for (const file of walkFiles(args.localDir)) {
      const rel = path.relative(args.localDir, path.dirname(file))
      const remoteDir =
        rel === '.' ? args.remoteDir : remoteJoin(args.remoteDir, rel.split(path.sep).join('/'))
      await uploadFile(args.host, sid, remoteDir, file, onProgress)
    }
    return { shareUrl: await createShareLink(args.host, sid, args.remoteDir) }
  } finally {
    await dsmLogout(args.host, sid)
  }
}

export { publishJump, uploadFile }
export type { PublishArgs, UploadProgress }
