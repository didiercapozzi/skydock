import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { walkFiles } from './lib/fs'
import {
  createShareLink,
  dsmConfigSchema,
  dsmFetch,
  dsmLogin,
  dsmValidateSession,
  loginWithSession
} from './nas'

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
  onProgress?.({ filename, bytesUploaded: 0, totalBytes })
  const chunkSize = 10 * 1024 * 1024
  const chunks = Math.max(1, Math.ceil(totalBytes / chunkSize))
  const buffer = fs.readFileSync(localPath)
  for (let i = 0; i < chunks; i++) {
    const uploaded = Math.min((i + 1) * chunkSize, totalBytes)
    if (uploaded < totalBytes) {
      onProgress?.({ filename, bytesUploaded: uploaded, totalBytes })
      await new Promise<void>((r) => setTimeout(r, 40))
    }
  }
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const form = new FormData()
      form.append('path', remoteDir)
      form.append('create_parents', 'true')
      form.append('overwrite', 'true')
      form.append('file', new Blob([buffer]), filename)
      const body = await dsmFetch(
        host,
        { api: 'SYNO.FileStation.Upload', method: 'upload', version: '2', _sid: sid },
        form
      )
      if (!body.success) throw new Error(`Upload failed for ${filename}`)
      lastError = null
      break
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
  }
  if (lastError) throw lastError
  onProgress?.({ filename, bytesUploaded: totalBytes, totalBytes })
}

const publishJump = async (args: PublishArgs, onProgress?: (progress: UploadProgress) => void) => {
  const sid = await loginWithSession(
    args,
    { login: dsmLogin, validate: dsmValidateSession },
    args.outputDir
  )
  for (const file of walkFiles(args.localDir)) {
    const rel = path.relative(args.localDir, path.dirname(file))
    const remoteDir =
      rel === '.' ? args.remoteDir : remoteJoin(args.remoteDir, rel.split(path.sep).join('/'))
    await uploadFile(args.host, sid, remoteDir, file, onProgress)
  }
  return { shareUrl: await createShareLink(args.host, sid, args.remoteDir) }
}

export { publishJump, uploadFile }
export type { PublishArgs, UploadProgress }
