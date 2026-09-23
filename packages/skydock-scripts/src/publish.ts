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
  /* where the storage connection is kept; the app's own config folder unless a test says otherwise */
  configDir: z.string().optional(),
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

/* footage the storage already holds, wanted in another of its folders: it copies it to itself
   rather than being sent it again */
type CopyOver = { local: string; from: string; to: string; md5: string }

/* a file the storage was seen to hold, whoever put it there */
type Seen = { remotePath: string; size: number; md5?: string }

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

/* One file sent. Nothing on the storage is written over by this: a file already there under that
   name makes the storage refuse, and the upload has to have put it aside first (RULES, Principles).
   Only SkyDock's own records — the lists it keeps up there — are replaced in place, and say so. */
const uploadFile = async (
  host: string,
  sid: string,
  remoteDir: string,
  localPath: string,
  onProgress?: (progress: UploadProgress) => void,
  options?: { overwrite?: boolean }
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
    `${field('path', remoteDir)}${field('create_parents', 'true')}${field('overwrite', options?.overwrite ? 'true' : 'false')}` +
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

/* Where a file of the same name goes before a different one lands: a bin on the storage, beside
   the folder it was delivered into rather than inside it, which a passenger's link opens, one folder
   per moment. SkyDock deletes nothing up there, so what a better copy replaces is put where it can
   still be fetched from, and that bin is never emptied by SkyDock (RULES, Network storage). A
   share's own recycle bin is not used: it can be switched off per share, and a NAS does not
   reliably say whether it is there. */
const BIN = '.skydock-trash'

/* one step above the folder the file is in, unless that folder is a share, which has nothing above */
const binFor = (remotePath: string, at: Date) => {
  const folder = parentOf(remotePath)
  const above = parentOf(folder)
  return `${above === '/' || above === '' ? folder : above}/${BIN}/${stampOf(at)}`
}

const moveAside = async (host: string, sid: string, remotePath: string, at: Date) =>
  await dsmCopyMove(host, sid, remotePath, binFor(remotePath, at))

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
  /* What the storage already holds, by what each file was made from — so the same footage is
     recognised under the name it went up as, which is never the name it has here (RULES, Network
     storage). */
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

  /* And the same footage under another name, which the name-and-size pass cannot see: a clip whose
     time was put right is delivered under another name, and every name changes again when a
     passenger is renamed or a jump is filed elsewhere.

     A file is only read for this when the storage holds something made from the same original, or
     something that weighs exactly the same — reading is the expensive half, and most files are
     neither. A file of that weight the storage has never been asked about is asked about now, once:
     the storage hashes it on its own side, nothing travels, and what it answers is kept, so the
     same question is never asked twice. That is how a folder full of footage from before SkyDock
     ever saw it becomes known, a file at a time, as it becomes worth knowing.

     What is done about a twin depends on where it is. In the folder this file is going to, it is
     already delivered, under another name, and there is nothing to do but say so. In another
     folder, it is another delivery — a passenger's own folder, a second dropzone — and that folder
     has to hold it: the storage copies it to itself, which sends nothing from here. */
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
    /* nothing known matches: the ones of the same weight are worth one question each */
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
    already.add(twin.file)
    if (parentOf(twin.remotePath) === parentOf(remote))
      skip.push({
        localPath: twin.file,
        remotePath: twin.remotePath,
        md5: twin.md5,
        size: fs.statSync(twin.file).size,
        at: Math.floor(Date.now() / 1000)
      })
    else copyOver.push({ local: twin.file, from: twin.remotePath, to: remote, md5: twin.md5 })
  }

  /* What the storage was seen to hold while this was worked out: every file in the folders this
     upload touched, with what it weighs, and the digest of any that had to be asked about. A folder
     SkyDock was pointed at is learned this way — by looking at it, not by being told about it. */
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
    /* every file the folders were seen to hold, whatever it weighs: what a send must not land on */
    held: [...remoteByPath.keys()]
  }
}

const publishJump = async (
  args: PublishArgs & {
    origins?: {
      index: OriginIndex
      of: (localPath: string) => { from?: string; cut?: [number, number] } | undefined
    }
  },
  handlers?: {
    onProgress?: (progress: UploadProgress) => void
    onCheck?: (progress: CheckProgress) => void
  }
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

  /* What the storage already holds is copied by the storage into the folder that wants it, and
     given the name that folder would have given it — nothing travels from here. A copy the storage
     will not make is simply sent instead: the file has to be there, and how it got there is no
     promise to anybody. */
  const copied: UploadVerdict[] = []
  const couldNotCopy: string[] = []
  for (const over of planned.copyOver ?? []) {
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

  /* A file whose name is already taken up there by different bytes — a clip prepared again after its
     trim was put right, a film rendered again — is not written over: what is there is moved into the
     bin first, and if the storage will not move it the upload stops here, saying which file. What
     was sent before that stands, and the next upload finds it there. */
  const held = new Set(planned.held)
  const asideAt = new Date()
  const totalFiles = planned.upload.length
  const sent: UploadVerdict[] = []
  for (const [index, file] of planned.upload.entries()) {
    const remoteDir = remoteDirOf(args.localDir, args.remoteDir, file)
    const remotePath = `${remoteDir}/${path.basename(file)}`
    if (held.has(remotePath) && !(await moveAside(args.host, sid, remotePath, asideAt)))
      throw new Error(
        `The storage would not put ${lastSegment(remotePath)} aside, so it was not sent — what is up there is untouched.`
      )
    const { md5, size } = await uploadFile(args.host, sid, remoteDir, file, (progress) =>
      handlers?.onProgress?.({ ...progress, fileIndex: index, totalFiles })
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
    /* the storage's own copies: nothing was sent for these, and they are up there all the same */
    copied: copied.length,
    /* what the folders were seen to hold, this upload's own files included */
    seen: planned.seen ?? [],
    /* every file now known to be on the NAS, sent, copied there, or already there */
    files: [...sent, ...copied, ...planned.skip]
  }
}

export { binFor, planUpload, publishJump, uploadFile }
export type { CheckProgress, PublishArgs, Seen, UploadProgress, UploadVerdict }
