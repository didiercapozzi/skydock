import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as https from 'node:https'
import * as path from 'node:path'
import { z } from 'zod'
import { walkFiles } from './lib/fs'
import { withRetry } from './utils'
import {
  createShareLink,
  dsmConfigSchema,
  dsmLogin,
  dsmRequestUrl,
  dsmResponseSchema,
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

const PROGRESS_FLUSH_FRACTION = 0.95

const readResponseJson = (res: http.IncomingMessage) =>
  new Promise<unknown>((resolve, reject) => {
    const chunks: Array<Buffer> = []
    res.on('data', (chunk: string | Buffer) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    )
    res.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
    res.on('error', reject)
  })

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

  const sendOnce = () =>
    new Promise<void>((resolve, reject) => {
      let settled = false
      const done = (err?: Error) => {
        if (settled) return
        settled = true
        if (err) reject(err)
        else resolve()
      }

      const cap = Math.floor(totalBytes * PROGRESS_FLUSH_FRACTION)
      let fileFlushed = 0
      let lastReported = 0
      const report = (flushed: number) => {
        const scaled = totalBytes === 0 ? 0 : Math.floor((flushed * cap) / totalBytes)
        if (scaled >= cap || scaled - lastReported >= PROGRESS_REPORT_INTERVAL) {
          lastReported = scaled
          onProgress?.({ filename, bytesUploaded: scaled, totalBytes })
        }
      }

      const endpoint = dsmRequestUrl(host, {
        api: 'SYNO.FileStation.Upload',
        method: 'upload',
        version: '2',
        _sid: sid
      })
      const headers = {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(contentLength)
      }
      const handleResponse = (res: http.IncomingMessage) => {
        readResponseJson(res).then((json) => {
          const parsed = dsmResponseSchema.safeParse(json)
          if (parsed.success && parsed.data.success) {
            onProgress?.({ filename, bytesUploaded: totalBytes, totalBytes })
            done()
          } else done(new Error(`Upload failed for ${filename}`))
        }, done)
      }
      const req =
        endpoint.protocol === 'https:'
          ? https.request(endpoint, { method: 'POST', headers }, handleResponse)
          : http.request(endpoint, { method: 'POST', headers }, handleResponse)
      req.on('error', (err) => {
        nodeStream.destroy()
        done(err instanceof Error ? err : new Error(String(err)))
      })

      const nodeStream = fs.createReadStream(localPath, { highWaterMark: 1024 * 1024 })
      nodeStream.on('error', (err) => {
        req.destroy()
        done(err)
      })
      req.write(preamble)
      nodeStream.on('data', (chunk: string | Buffer) => {
        nodeStream.pause()
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        req.write(buf, () => {
          fileFlushed += buf.byteLength
          report(fileFlushed)
          nodeStream.resume()
        })
      })
      nodeStream.on('end', () => req.end(epilogue))
    })

  await withRetry(sendOnce, 3)
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
