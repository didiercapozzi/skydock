import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as https from 'node:https'
import * as path from 'node:path'
import { z } from 'zod'
import { hashFile, walkFiles } from './lib/fs'
import { alreadyUp, sameSizeUnknown, worthReading } from './originEntry'
import type { OriginIndex } from './originEntry'
import { stampOf } from './lib/clock'
import { lastSegment, parentOf } from './paths'
import { stopIfUploadCancelled, stopSignal, UploadCancelled } from './uploading'
import { mapWithLimit, withRetry } from './utils'
import {
  dsmConfigSchema,
  dsmFileMd5,
  dsmLogin,
  dsmRequestUrl,
  dsmResponseSchema,
  dsmCopyMove,
  dsmRenameFile,
  dsmValidateSession,
  ensureShareLink,
  listNasFiles,
  loginWithSession
} from './nas'

const publishArgsSchema = dsmConfigSchema.extend({
  localDir: z.string(),
  remoteDir: z.string(),
  configDir: z.string().optional(),
  md5Concurrency: z.number().optional(),
  files: z.array(z.string()).optional(),
  share: z.boolean().optional()
})
type PublishArgs = z.infer<typeof publishArgsSchema>

const uploadProgressSchema = z.object({
  filename: z.string(),
  bytesUploaded: z.number(),
  totalBytes: z.number(),
  fileIndex: z.number().optional(),
  totalFiles: z.number().optional(),
  to: z.string().optional()
})
type UploadProgress = z.infer<typeof uploadProgressSchema>

type CheckProgress = { checked: number; total: number; filename: string }

type PlannedFile = { name: string; size: number; to: string }
type PlanProgress = { send: PlannedFile[]; there: PlannedFile[]; taken: PlannedFile[] }

class UploadBlocked extends Error {
  override name = 'UploadBlocked'
}

type CopyOver = { local: string; from: string; to: string; md5: string }

type Seen = { remotePath: string; size: number; md5?: string }

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
  onProgress?: (progress: UploadProgress) => void,
  options?: { overwrite?: boolean }
) => {
  stopIfUploadCancelled()
  const filename = path.basename(localPath).replace(/"/g, '')
  const stat = fs.statSync(localPath)
  const totalBytes = stat.size
  onProgress?.({ filename, bytesUploaded: 0, totalBytes })
  const boundary = `----SkyDock${crypto.randomBytes(8).toString('hex')}`
  const field = (name: string, value: string) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
  const preamble = Buffer.from(
    `${field('path', remoteDir)}${field('create_parents', 'true')}${field('overwrite', options?.overwrite ? 'true' : 'false')}` +
      field('mtime', String(Math.floor(stat.mtimeMs))) +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    'utf8'
  )
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  const contentLength = preamble.length + totalBytes + epilogue.length

  const sendOnce = () =>
    new Promise<string>((resolve, reject) => {
      let settled = false
      const digest = crypto.createHash('md5')
      const signal = stopSignal()
      const cutOff = () => {
        req.destroy()
        nodeStream.destroy()
        done(new UploadCancelled())
      }
      const done = (err?: Error) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', cutOff)
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
      signal?.addEventListener('abort', cutOff, { once: true })
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

  return { md5: await withRetry(sendOnce, 3, UPLOAD_RETRY_DELAY_MS), size: totalBytes }
}

const BIN = '.skydock-trash'

const binFor = (remotePath: string, at: Date) => {
  const folder = parentOf(remotePath)
  const above = parentOf(folder)
  return `${above === '/' || above === '' ? folder : above}/${BIN}/${stampOf(at)}`
}

const remoteDirOf = (localDir: string, remoteDir: string, file: string) => {
  const rel = path.relative(localDir, path.dirname(file))
  return rel === '' || rel === '.'
    ? remoteDir
    : remoteJoin(remoteDir, rel.split(path.sep).join('/'))
}

const planUpload = async ({
  host,
  sid,
  localDir,
  remoteDir,
  concurrency = MD5_CONCURRENCY,
  onCheck,
  files: only,
  origins
}: {
  host: string
  sid: string
  localDir: string
  remoteDir: string
  concurrency?: number
  onCheck?: (progress: CheckProgress) => void
  files?: string[]
  origins?: {
    index: OriginIndex
    of: (localPath: string) => { from?: string; cut?: [number, number] } | undefined
  }
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

  const learned = new Map<string, string>()
  const worth = origins
    ? upload.filter((file) =>
        worthReading(origins.index, {
          from: origins.of(file)?.from,
          size: fs.statSync(file).size
        })
      )
    : []
  const twins = await mapWithLimit(worth, concurrency, async (file) => {
    if (!origins) return null
    const md5 = await hashFile(file)
    const known = alreadyUp(origins.index, md5)
    if (known) return { file, md5, remotePath: known.remotePath }
    for (const stranger of sameSizeUnknown(origins.index, fs.statSync(file).size)) {
      const theirs = learned.get(stranger) ?? (await dsmFileMd5(host, sid, stranger))
      if (theirs === null || theirs === undefined) continue
      learned.set(stranger, theirs)
      if (theirs.toLowerCase() === md5.toLowerCase()) return { file, md5, remotePath: stranger }
    }
    return null
  })
  const already = new Set<string>()
  const copyOver: CopyOver[] = []
  for (const twin of twins) {
    if (!twin) continue
    const remote = `${remoteDirOf(localDir, remoteDir, twin.file)}/${path.basename(twin.file)}`
    const size = fs.statSync(twin.file).size
    if (parentOf(twin.remotePath) === parentOf(remote)) {
      if (remoteByPath.get(twin.remotePath) !== size) continue
      already.add(twin.file)
      skip.push({
        localPath: twin.file,
        remotePath: twin.remotePath,
        md5: twin.md5,
        size,
        at: Math.floor(Date.now() / 1000)
      })
    } else {
      already.add(twin.file)
      copyOver.push({ local: twin.file, from: twin.remotePath, to: remote, md5: twin.md5 })
    }
  }

  const seen = [...remoteByPath].flatMap(([remotePath, size]) =>
    size === null
      ? []
      : [{ remotePath, size, ...(learned.has(remotePath) ? { md5: learned.get(remotePath) } : {}) }]
  )

  return {
    upload: upload.filter((file) => !already.has(file)).sort(),
    skip,
    copyOver,
    seen,
    held: [...remoteByPath.keys()],
    listed: remoteDirs
  }
}

type JumpArgs = PublishArgs & {
  origins?: {
    index: OriginIndex
    of: (localPath: string) => { from?: string; cut?: [number, number] } | undefined
  }
}

const checkJump = async (
  args: JumpArgs,
  handlers?: { onCheck?: (progress: CheckProgress) => void }
) => {
  const sid = await loginWithSession(
    args,
    { login: dsmLogin, validate: dsmValidateSession },
    args.configDir
  )
  const planned = await planUpload({
    host: args.host,
    sid,
    localDir: args.localDir,
    remoteDir: args.remoteDir,
    concurrency: args.md5Concurrency,
    onCheck: handlers?.onCheck,
    files: args.files,
    origins: args.origins
  })
  const held = new Set(planned.held)
  const taken: PlannedFile[] = [
    ...[...planned.upload, ...planned.skip.map((verdict) => verdict.localPath)].map((file) => ({
      name: path.basename(file),
      size: fs.statSync(file).size,
      to: remoteDirOf(args.localDir, args.remoteDir, file)
    })),
    ...(planned.copyOver ?? []).map((over) => ({
      name: lastSegment(over.to),
      size: fs.statSync(over.local).size,
      to: parentOf(over.to)
    }))
  ].filter((file) => held.has(`${file.to}/${file.name}`))
  return { sid, planned, taken }
}
type Checked = Awaited<ReturnType<typeof checkJump>>

const refuseTaken = (taken: PlannedFile[], onPlan?: (plan: PlanProgress) => void) => {
  if (taken.length === 0) return
  onPlan?.({ send: [], there: [], taken })
  throw new UploadBlocked(
    taken.length === 1
      ? `${taken[0]?.name} is already on the storage, so nothing was sent. Rename or delete it there, then upload again.`
      : `${taken.length} files are already on the storage, so nothing was sent. Rename or delete them there, then upload again.`
  )
}

const publishJump = async (
  args: JumpArgs,
  handlers?: {
    onProgress?: (progress: UploadProgress) => void
    onCheck?: (progress: CheckProgress) => void
    onPlan?: (plan: PlanProgress) => void
  },
  ahead?: Checked
) => {
  const checked = ahead ?? (await checkJump(args, handlers))
  if (!ahead) refuseTaken(checked.taken, handlers?.onPlan)
  const { sid, planned } = checked

  const copied: UploadVerdict[] = []
  const couldNotCopy: string[] = []
  for (const over of planned.copyOver ?? []) {
    stopIfUploadCancelled()
    const ok =
      (await dsmCopyMove(args.host, sid, over.from, parentOf(over.to), { keepSource: true })) &&
      (lastSegment(over.from) === lastSegment(over.to) ||
        (await dsmRenameFile(
          args.host,
          sid,
          `${parentOf(over.to)}/${lastSegment(over.from)}`,
          lastSegment(over.to)
        )))
    if (ok)
      copied.push({
        localPath: over.local,
        remotePath: over.to,
        md5: over.md5,
        size: fs.statSync(over.local).size,
        at: Math.floor(Date.now() / 1000)
      })
    else couldNotCopy.push(over.local)
  }
  planned.upload.push(...couldNotCopy)

  const totalFiles = planned.upload.length
  const already = (verdict: UploadVerdict) => ({
    name: lastSegment(verdict.remotePath),
    size: verdict.size,
    to: parentOf(verdict.remotePath)
  })
  handlers?.onPlan?.({
    send: planned.upload.map((file) => ({
      name: path.basename(file),
      size: fs.statSync(file).size,
      to: remoteDirOf(args.localDir, args.remoteDir, file)
    })),
    there: [...planned.skip, ...copied].map(already),
    taken: []
  })
  const sent: UploadVerdict[] = []
  for (const [index, file] of planned.upload.entries()) {
    stopIfUploadCancelled()
    const remoteDir = remoteDirOf(args.localDir, args.remoteDir, file)
    const remotePath = `${remoteDir}/${path.basename(file)}`
    const { md5, size } = await uploadFile(args.host, sid, remoteDir, file, (progress) =>
      handlers?.onProgress?.({ ...progress, fileIndex: index, totalFiles, to: remoteDir })
    )
    sent.push({
      localPath: file,
      remotePath,
      md5,
      size,
      at: Math.floor(Date.now() / 1000)
    })
  }
  return {
    shareUrl: args.share === false ? null : await ensureShareLink(args.host, sid, args.remoteDir),
    uploaded: planned.upload.length,
    skipped: planned.skip.length,
    copied: copied.length,
    seen: planned.seen ?? [],
    listed: planned.listed ?? [],
    held: planned.held ?? [],
    files: [...sent, ...copied, ...planned.skip]
  }
}

export { binFor, checkJump, planUpload, publishJump, refuseTaken, uploadFile }
export type { Checked, CheckProgress, PlanProgress, Seen, UploadProgress, UploadVerdict }
