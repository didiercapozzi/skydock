import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as stream from 'node:stream'
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

const PROGRESS_REPORT_INTERVAL = 1024 * 1024

const uploadFile = async (
  host: string,
  sid: string,
  remoteDir: string,
  localPath: string,
  onProgress?: (progress: UploadProgress) => void
) => {
  const filename = path.basename(localPath).replace(/"/g, '')
  const stat = fs.statSync(localPath)
  const totalBytes = stat.size
  onProgress?.({ filename, bytesUploaded: 0, totalBytes })
  const boundary = `----SkyDock${crypto.randomBytes(8).toString('hex')}`
  const field = (name: string, value: string) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
  const preamble = Buffer.from(
    `${field('path', remoteDir)}${field('create_parents', 'true')}${field('overwrite', 'true')}` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    'utf8'
  )
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  const contentLength = preamble.length + totalBytes + epilogue.length

  const sendOnce = async () => {
    let fileSent = 0
    let lastReported = 0
    const report = (sent: number) => {
      const clamped = Math.max(0, Math.min(totalBytes, sent))
      if (clamped === totalBytes || clamped - lastReported >= PROGRESS_REPORT_INTERVAL) {
        lastReported = clamped
        onProgress?.({ filename, bytesUploaded: clamped, totalBytes })
      }
    }
    const nodeStream = fs.createReadStream(localPath, { highWaterMark: 1024 * 1024 })
    const webStream = stream.Readable.toWeb(nodeStream)
    const body = new ReadableStream({
      async start(controller) {
        controller.enqueue(preamble)
        const reader = webStream.getReader()
        try {
          for (;;) {
            const next = await reader.read()
            if (next.done) break
            fileSent += next.value.byteLength
            report(fileSent)
            controller.enqueue(next.value)
          }
        } catch (err) {
          nodeStream.destroy()
          controller.error(err)
          return
        } finally {
          reader.releaseLock()
        }
        controller.enqueue(epilogue)
        controller.close()
      },
      cancel() {
        nodeStream.destroy()
      }
    })
    const res = await dsmFetch(
      host,
      { api: 'SYNO.FileStation.Upload', method: 'upload', version: '2', _sid: sid },
      body,
      {
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(contentLength)
        }
      }
    )
    if (!res.success) throw new Error(`Upload failed for ${filename}`)
  }

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await sendOnce()
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
