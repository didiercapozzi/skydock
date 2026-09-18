import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as https from 'node:https'
import * as path from 'node:path'
import { z } from 'zod'
import { hashFile, walkFiles } from './lib/fs'
import { mapWithLimit, withRetry } from './utils'
import {
  dsmConfigSchema,
  dsmFileMd5,
  dsmLogin,
  dsmRequestUrl,
  dsmResponseSchema,
  dsmValidateSession,
  ensureShareLink,
  listNasFiles,
  loginWithSession
} from './nas'

const publishArgsSchema = dsmConfigSchema.extend({
  localDir: z.string(),
  remoteDir: z.string(),
  outputDir: z.string().optional(),
  dedupe: z.boolean().optional(),
  md5Concurrency: z.number().optional(),
  /* exactly what to send, when the folder holds more than the recipient should get — a passenger's
     folder also holds the project and the rushes, and neither is theirs */
  files: z.array(z.string()).optional(),
  /* a backup folder gets no public link */
  share: z.boolean().optional()
})
type PublishArgs = z.infer<typeof publishArgsSchema>

const uploadProgressSchema = z.object({
  filename: z.string(),
  bytesUploaded: z.number(),
  totalBytes: z.number(),
  fileIndex: z.number().optional(),
  totalFiles: z.number().optional()
})
type UploadProgress = z.infer<typeof uploadProgressSchema>

type CheckProgress = { checked: number; total: number; filename: string }

/* one file proved to be on the NAS — either just sent, or found identical there */
type UploadVerdict = {
  localPath: string
  remotePath: string
  md5: string
  size: number
  at: number
}

const MD5_CONCURRENCY = 4

const UPLOAD_RETRY_DELAY_MS = 2000

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
  /* The file's own date goes with it, in milliseconds as the storage takes it. Processing stamped
     each copy with when it was shot, and without this the storage dates everything by the day it
     was sent — which is what anyone browsing the folder then sorts by. */
  const preamble = Buffer.from(
    `${field('path', remoteDir)}${field('create_parents', 'true')}${field('overwrite', 'true')}` +
      field('mtime', String(Math.floor(stat.mtimeMs))) +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    'utf8'
  )
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  const contentLength = preamble.length + totalBytes + epilogue.length

  /* the bytes are already streamed past us, so the digest of what actually went up is free —
     and it is what lets the file be marked uploaded without asking the NAS to hash it back */
  const sendOnce = () =>
    new Promise<string>((resolve, reject) => {
      let settled = false
      const digest = crypto.createHash('md5')
      const done = (err?: Error) => {
        if (settled) return
        settled = true
        if (err) reject(err)
        else resolve(digest.digest('hex'))
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
          } else {
            /* DSM says why it refused — quota, permission, missing folder. Swallowing that and
               reporting only "upload failed" leaves the user with nothing to act on. */
            const code = parsed.success ? parsed.data.error?.code : undefined
            done(
              new Error(
                `Upload failed for ${filename}${code !== undefined ? ` (DSM error ${code})` : ''}: ${JSON.stringify(json).slice(0, 200)}`
              )
            )
          }
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
        digest.update(buf)
        req.write(buf, () => {
          fileFlushed += buf.byteLength
          report(fileFlushed)
          nodeStream.resume()
        })
      })
      nodeStream.on('end', () => req.end(epilogue))
    })

  /* a retry re-reads the file, so each attempt hashes afresh and the winner's digest is returned */
  return { md5: await withRetry(sendOnce, 3, UPLOAD_RETRY_DELAY_MS), size: totalBytes }
}

/* `path.relative(dir, dir)` is '', not '.', and joining that on produced a trailing slash —
   which DSM refuses with error 418, "illegal name or path". Only reachable since flat fun jumps
   upload into the destination folder itself, where the files sit directly in `localDir`. */
const remoteDirOf = (localDir: string, remoteDir: string, file: string) => {
  const rel = path.relative(localDir, path.dirname(file))
  return rel === '' || rel === '.'
    ? remoteDir
    : remoteJoin(remoteDir, rel.split(path.sep).join('/'))
}

/* Decides what actually has to travel. A file already on the NAS under the same name and the
   exact same byte size is a candidate; only then is it worth asking DSM to hash it, because a
   size mismatch already proves the files differ. The local and remote digests are computed at
   the same time, so a file costs max(local, remote) rather than the sum, and `mapWithLimit`
   keeps the NAS from being asked for hundreds of hashes at once.
   Anything uncertain — no size, no digest, a failed job — is uploaded. */
const planUpload = async ({
  host,
  sid,
  localDir,
  remoteDir,
  concurrency = MD5_CONCURRENCY,
  onCheck,
  files: only
}: {
  host: string
  sid: string
  localDir: string
  remoteDir: string
  concurrency?: number
  onCheck?: (progress: CheckProgress) => void
  files?: string[]
}) => {
  const files = only ?? walkFiles(localDir)
  const remoteDirs = [...new Set(files.map((f) => remoteDirOf(localDir, remoteDir, f)))]
  const remoteByPath = new Map<string, number | null>()
  for (const dir of remoteDirs) {
    for (const entry of await listNasFiles(host, sid, dir)) {
      remoteByPath.set(`${dir}/${entry.name}`, entry.size)
    }
  }

  const candidates: { local: string; remote: string }[] = []
  const upload: string[] = []
  for (const file of files) {
    const remote = `${remoteDirOf(localDir, remoteDir, file)}/${path.basename(file)}`
    const remoteSize = remoteByPath.get(remote)
    if (remoteSize !== undefined && remoteSize === fs.statSync(file).size) {
      candidates.push({ local: file, remote })
    } else upload.push(file)
  }

  let checked = 0
  const verdicts = await mapWithLimit(candidates, concurrency, async (candidate) => {
    const [local, remote] = await Promise.all([
      hashFile(candidate.local),
      dsmFileMd5(host, sid, candidate.remote)
    ])
    checked += 1
    onCheck?.({ checked, total: candidates.length, filename: path.basename(candidate.local) })
    return remote !== null && remote.toLowerCase() === local.toLowerCase() ? local : null
  })

  /* a skip is a proof that both sides hold the same bytes, which is exactly what the file needs
     to be marked uploaded — so the digest travels out instead of being thrown away */
  const skip: UploadVerdict[] = []
  candidates.forEach((candidate, index) => {
    const md5 = verdicts[index]
    if (md5 === null || md5 === undefined) upload.push(candidate.local)
    else
      skip.push({
        localPath: candidate.local,
        remotePath: candidate.remote,
        md5,
        size: fs.statSync(candidate.local).size,
        at: Math.floor(Date.now() / 1000)
      })
  })
  return { upload: upload.sort(), skip }
}

const publishJump = async (
  args: PublishArgs,
  handlers?: {
    onProgress?: (progress: UploadProgress) => void
    onCheck?: (progress: CheckProgress) => void
  }
) => {
  const sid = await loginWithSession(
    args,
    { login: dsmLogin, validate: dsmValidateSession },
    args.outputDir
  )
  const all = args.files ?? walkFiles(args.localDir)
  const planned: { upload: string[]; skip: UploadVerdict[] } =
    args.dedupe === false
      ? { upload: [...all].sort(), skip: [] }
      : await planUpload({
          host: args.host,
          sid,
          localDir: args.localDir,
          remoteDir: args.remoteDir,
          concurrency: args.md5Concurrency,
          onCheck: handlers?.onCheck,
          files: args.files
        })

  const totalFiles = planned.upload.length
  const sent: UploadVerdict[] = []
  for (const [index, file] of planned.upload.entries()) {
    const remoteDir = remoteDirOf(args.localDir, args.remoteDir, file)
    const { md5, size } = await uploadFile(args.host, sid, remoteDir, file, (progress) =>
      handlers?.onProgress?.({ ...progress, fileIndex: index, totalFiles })
    )
    sent.push({
      localPath: file,
      remotePath: `${remoteDir}/${path.basename(file)}`,
      md5,
      size,
      at: Math.floor(Date.now() / 1000)
    })
  }
  return {
    shareUrl: args.share === false ? null : await ensureShareLink(args.host, sid, args.remoteDir),
    uploaded: planned.upload.length,
    skipped: planned.skip.length,
    /* every file now known to be on the NAS, sent or already there */
    files: [...sent, ...planned.skip]
  }
}

export { planUpload, publishJump, uploadFile }
export type { CheckProgress, PublishArgs, UploadProgress, UploadVerdict }
