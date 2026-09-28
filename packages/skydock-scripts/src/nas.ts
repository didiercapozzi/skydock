import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { writeJsonAtomic } from './lib/fs'
import { jsonText } from './lib/json'
import { getConfigDir, getStatusDir } from './utils'
import { stopIfUploadCancelled, stopSignal, UploadCancelled } from './uploading'

const nasSessionSchema = z.object({
  hostname: z.string(),
  username: z.string(),
  sessionId: z.string(),
  /* where the original videos are archived, kept apart from anything a passenger can see */
  backupFolder: z.string().optional(),
  encPasswd: z.string().optional(),
  /* this machine, as the storage trusts it after a login with a 2-step code: a later login naming
     it needs no code, so the session goes on renewing itself */
  deviceId: z.string().optional(),
  /* where SkyDock's own lists are kept on this storage, fixed the first time it was worked out */
  listsDir: z.string().optional()
})
type NasSession = z.infer<typeof nasSessionSchema>

const nasLoginConfigSchema = z.object({
  host: z.string(),
  user: z.string(),
  password: z.string(),
  /* the 6-digit code of an account with 2-step verification */
  otp: z.string().optional()
})

const dsmResponseSchema = z
  .object({
    success: z.boolean(),
    data: z.record(z.string(), z.unknown()).optional(),
    error: z.object({ code: z.number(), errors: z.unknown().optional() }).passthrough().optional(),
    errno: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough()

const dsmSidResponseSchema = z.object({
  success: z.literal(true),
  /* `did` comes back when this machine asked to be trusted */
  data: z.object({ sid: z.string(), did: z.string().optional() }).passthrough()
})

const dsmFileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isdir: z.boolean()
})

const dsmFolderFilesSchema = z.object({
  files: z.array(dsmFileEntrySchema).optional()
})

const dsmSizedFileSchema = z
  .object({
    name: z.string(),
    path: z.string(),
    isdir: z.boolean().optional(),
    additional: z
      .object({
        size: z.number().optional(),
        time: z.object({ mtime: z.number().optional() }).passthrough().optional()
      })
      .passthrough()
      .optional(),
    size: z.number().optional()
  })
  .passthrough()

const dsmSizedFilesSchema = z
  .object({ files: z.array(dsmSizedFileSchema).optional() })
  .passthrough()

const dsmMd5StartSchema = z.object({ taskid: z.string() }).passthrough()

const dsmMd5StatusSchema = z
  .object({ finished: z.boolean().optional(), md5: z.string().optional() })
  .passthrough()

const dsmShareLinkSchema = z
  .object({
    id: z.string().optional(),
    url: z.string().optional(),
    path: z.string().optional(),
    status: z.string().optional(),
    link_owner: z.string().optional()
  })
  .passthrough()

const dsmShareListSchema = z
  .object({ links: z.array(dsmShareLinkSchema).optional(), total: z.number().optional() })
  .passthrough()

const dsmShareEntrySchema = z.object({ name: z.string(), path: z.string() }).passthrough()

const dsmSharesSchema = z.object({ shares: z.array(dsmShareEntrySchema).optional() }).passthrough()

const dsmConfigSchema = z.object({
  host: z.string(),
  user: z.string(),
  password: z.string(),
  otp: z.string().optional(),
  deviceId: z.string().optional()
})
type DsmConfig = z.infer<typeof dsmConfigSchema>

/* The connection is the app's own setting, not part of the work: it lives in the config folder, apart
   from the footage and the records. */
const nasPath = (configDir?: string) => path.join(configDir || getConfigDir(), 'nas.json')

/* where the connection was kept before it had a folder of its own, taken over the first time it is
   looked for so nobody has to connect again */
const adoptLegacySession = () => {
  const legacy = path.join(getStatusDir(), 'nas.json')
  const target = nasPath()
  if (fs.existsSync(target) || !fs.existsSync(legacy)) return
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(legacy, target)
  fs.chmodSync(target, 0o600)
  fs.unlinkSync(legacy)
}

const normalizeHost = (host: string) => host.replace(/\/+$/, '')

const dsmEntryUrl = (host: string) => `${normalizeHost(host)}/webapi/entry.cgi`

const dsmRequestUrl = (host: string, params: Record<string, string>) =>
  new URL(`${dsmEntryUrl(host)}?${new URLSearchParams(params)}`)

/* how long a question to the storage may take before it is taken to be unreachable */
const QUESTION_MS = 15_000

type DsmFetchOptions = {
  headers?: Record<string, string>
  timeoutMs?: number
  duplex?: 'half'
}

type DsmRequestInit = RequestInit & { duplex?: 'half' }

const dsmFetch = async (
  host: string,
  params: Record<string, string>,
  body?: BodyInit,
  options: DsmFetchOptions = {}
) => {
  /* A question with nothing sent has an answer in seconds or not at all: a storage that cannot be
     reached must not hold whoever asked for as long as the network would wait. What sends a file
     takes as long as the file takes, and is given no limit here. */
  const timeoutMs = options.timeoutMs ?? (body ? undefined : QUESTION_MS)
  const controller = timeoutMs ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  /* the work this request is for can be stopped — an upload cancelled — and the request with it */
  const stop = stopSignal()
  const signals = [controller?.signal, stop].filter((s) => s !== undefined)
  try {
    stopIfUploadCancelled()
    const url = dsmRequestUrl(host, params).toString()
    const init: DsmRequestInit = body
      ? { method: 'POST', headers: options.headers, body, duplex: options.duplex ?? 'half' }
      : {}
    const res = await fetch(
      url,
      signals.length > 0 ? { ...init, signal: AbortSignal.any(signals) } : init
    )
    let json: unknown = null
    try {
      json = await res.json()
    } catch {
      throw new Error(`DSM request failed with status ${res.status} at ${url}`)
    }
    try {
      return dsmResponseSchema.parse(json)
    } catch {
      throw new Error(`DSM invalid response at ${url}: ${JSON.stringify(json)}`)
    }
  } catch (err) {
    if (stop?.aborted) throw new UploadCancelled()
    if (controller && err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        `The storage did not answer within ${Math.round((timeoutMs ?? 0) / 1000)} seconds`
      )
    }
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const dsmApiErrorMessage = (body: z.infer<typeof dsmResponseSchema>) => {
  const code = body.error?.code ?? (body.errno ? 400 : undefined)
  if (code === undefined) return `DSM login failed: ${JSON.stringify(body)}`
  const map: Record<number, string> = {
    100: 'Unknown error',
    101: 'No parameter of API, method or version',
    102: 'API does not exist',
    103: 'Method does not exist',
    104: 'This API version is not supported',
    105: 'Insufficient user privilege',
    106: 'Connection time out',
    107: 'Multiple login detected',
    400: 'No such account or incorrect password',
    401: 'Account disabled',
    402: 'Permission denied',
    403: 'One time password not specified',
    404: 'One time password authenticate failed',
    406: 'OTP code enforced',
    407: 'Max Tries (if auto blocking is enabled)',
    408: 'Password expired cannot login',
    409: 'Password must be changed',
    410: 'Permission denied',
    411: 'Account locked',
    412: 'Account expired'
  }
  return `DSM login failed: ${map[code] ?? `DSM error ${code}`}: ${JSON.stringify(body)}`
}

/* A login the storage refused, with the code it gave. 403 and 406 are an account with 2-step
   verification asking for its code; 404 is a code it did not accept. */
class DsmLoginError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined
  ) {
    super(message)
  }
}

/* the account asks for its 2-step code — none was given, or the one given was not accepted */
const needsCode = (e: unknown) =>
  e instanceof DsmLoginError && (e.code === 403 || e.code === 404 || e.code === 406)

const dsmLoginAttempt = async (config: DsmConfig, version: string) => {
  const body = await dsmFetch(config.host, {
    api: 'SYNO.API.Auth',
    method: 'login',
    version,
    session: 'FileStation',
    format: 'sid',
    account: config.user,
    passwd: config.password,
    /* with a code, this machine asks to be trusted, so the next login needs none */
    ...(config.otp
      ? { otp_code: config.otp, enable_device_token: 'yes', device_name: 'SkyDock' }
      : {}),
    ...(config.deviceId ? { device_id: config.deviceId } : {})
  })
  const parsed = dsmSidResponseSchema.safeParse(body)
  if (parsed.success) return { sid: parsed.data.data.sid, deviceId: parsed.data.data.did }
  throw new DsmLoginError(dsmApiErrorMessage(body), body.error?.code)
}

/* API versions differ between DSM releases: one the storage does not know is passed over for the
   next, and anything else — a wrong password, a code asked for — is the answer. */
const dsmLogin = async (config: DsmConfig) => {
  const versions = ['7', '6', '3']
  let lastErr: Error | null = null
  for (const v of versions) {
    try {
      return await dsmLoginAttempt(config, v)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      const code = e instanceof DsmLoginError ? e.code : undefined
      if (code === 102 || code === 103 || code === 104) continue
      if (code === 400 && v !== versions[versions.length - 1]) continue
      if (code === undefined && lastErr.message.includes('not supported')) continue
      throw lastErr
    }
  }
  throw lastErr ?? new Error('DSM login failed: no version succeeded')
}

const dsmLogout = async (host: string, sid: string) => {
  try {
    await dsmFetch(host, {
      api: 'SYNO.API.Auth',
      method: 'logout',
      version: '6',
      session: 'FileStation',
      _sid: sid
    })
  } catch {}
}

const dsmValidateSession = async (host: string, sid: string) => {
  try {
    const body = await dsmFetch(host, {
      api: 'SYNO.FileStation.List',
      method: 'list_share',
      version: '2',
      _sid: sid
    })
    return body.success === true
  } catch {
    return false
  }
}

const getLocalKey = (host: string, user: string) => {
  const base = `${host}:${user}:skydock-v1`
  return crypto.scryptSync(base, 'skydock-salt', 32)
}

const encryptLocal = (host: string, user: string, plain: string) => {
  const key = getLocalKey(host, user)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${enc.toString('base64')}:${tag.toString('base64')}`
}

const decryptLocal = (host: string, user: string, encStr: string) => {
  const parts = encStr.split(':')
  if (parts.length !== 3) throw new Error('Invalid encPasswd format')
  const [ivB64, encB64, tagB64] = parts
  const key = getLocalKey(host, user)
  const iv = Buffer.from(ivB64, 'base64')
  const enc = Buffer.from(encB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString('utf8')
}

/* Always local AES. DSM's public key encrypts a password for one login request, not for storage:
   the stored `dsm:` ciphertext cannot be decrypted here and replaying it as `passwd` is not the
   envelope DSM expects, so an expired session could never refresh itself silently. A session still
   carrying a `dsm:` blob is replayed as it is (see refreshStoredSession) and the blob replaced at the
   next connect. */
const encryptPasswordForStorage = (host: string, user: string, plain: string) =>
  `local:${encryptLocal(host, user, plain)}`

const decryptPasswordFromStorage = (host: string, user: string, stored: string) => {
  if (stored.startsWith('dsm:')) throw new Error('DSM encrypted password requires re-entry')
  if (stored.startsWith('local:')) return decryptLocal(host, user, stored.slice(6))
  return decryptLocal(host, user, stored)
}

type NasFolderEntry = z.infer<typeof dsmFileEntrySchema>

const normalizeNasPath = (input: string) => {
  const trimmed = input.trim()
  if (trimmed === '' || trimmed === '/') return '/'
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withSlash.replace(/\/+/g, '/').replace(/\/+$/, '') || '/'
}

const listNasFolder = async (
  host: string,
  sid: string,
  folderPath: string
): Promise<NasFolderEntry[]> => {
  const cpath = normalizeNasPath(folderPath)
  const body = await dsmFetch(host, {
    api: 'SYNO.FileStation.List',
    version: '2',
    method: 'list',
    folder_path: cpath,
    additional: '["real_path"]',
    sort_by: 'name',
    filetype: 'dir',
    _sid: sid
  })
  if (!body.success) throw new Error(`List failed for ${cpath}: ${JSON.stringify(body)}`)
  const parsed = dsmFolderFilesSchema.safeParse(body.data)
  const files = parsed.success ? (parsed.data.files ?? []) : []
  return files
    .filter((f) => f.isdir)
    .map((f) => ({ name: f.name, path: normalizeNasPath(f.path), isdir: true }))
}

/* DSM's answer for a path that is not there */
const NO_SUCH_PATH = 408

/* The storage did not say what a folder holds — it did not answer, turned the question down, or
   answered something that could not be read. Never the same as an empty folder: what is decided on
   a listing — that a file is gone, that an entry is stale — is decided only on one that came back. */
class StorageUnreadable extends Error {}

/* Files with their byte size — the cheap half of the "is it already up there" question. A folder
   that does not exist yet is not an error: it just holds nothing. Anything else that goes wrong is,
   and is said, rather than read as a folder with nothing in it. */
const listNasFiles = async (host: string, sid: string, folderPath: string) => {
  const cpath = normalizeNasPath(folderPath)
  const body = await dsmFetch(host, {
    api: 'SYNO.FileStation.List',
    version: '2',
    method: 'list',
    folder_path: cpath,
    additional: '["size","time"]',
    filetype: 'file',
    _sid: sid
  }).catch((e: unknown) => {
    throw new StorageUnreadable(
      `The storage did not answer for ${cpath}: ${e instanceof Error ? e.message : String(e)}`
    )
  })
  if (!body.success) {
    if (body.error?.code === NO_SUCH_PATH) return []
    throw new StorageUnreadable(
      `The storage would not list ${cpath}${body.error ? ` (DSM error ${body.error.code})` : ''}.`
    )
  }
  const parsed = dsmSizedFilesSchema.safeParse(body.data)
  if (!parsed.success)
    throw new StorageUnreadable(`The storage's listing of ${cpath} made no sense.`)
  return (parsed.data.files ?? [])
    .filter((f) => f.isdir !== true)
    .map((f) => ({
      name: f.name,
      path: normalizeNasPath(f.path),
      size: f.additional?.size ?? f.size ?? null,
      mtime: f.additional?.time?.mtime ?? null
    }))
}

const MD5_POLL_MS = 500
const MD5_TIMEOUT_MS = 5 * 60 * 1000

/* DSM hashes the file on the NAS itself and hands back an md5 — the only digest available for a
   remote file without downloading it. Returns null whenever the answer is not a usable hash, and
   a null always means "upload it": never skip a file on an uncertain comparison. */
const dsmFileMd5 = async (
  host: string,
  sid: string,
  filePath: string,
  options?: { pollMs?: number; timeoutMs?: number }
) => {
  const pollMs = options?.pollMs ?? MD5_POLL_MS
  const deadline = Date.now() + (options?.timeoutMs ?? MD5_TIMEOUT_MS)
  try {
    const started = await dsmFetch(host, {
      api: 'SYNO.FileStation.MD5',
      version: '2',
      method: 'start',
      file_path: normalizeNasPath(filePath),
      _sid: sid
    })
    if (!started.success) return null
    const task = dsmMd5StartSchema.safeParse(started.data)
    if (!task.success) return null
    for (;;) {
      const body = await dsmFetch(host, {
        /* the taskid goes back quoted. Unquoted, DSM answers the first status call of a session
           and then fails every later one with 599 "no such task" — which silently turns the whole
           dedup pass into "upload everything" after the first file. Verified against DSM 7. */
        api: 'SYNO.FileStation.MD5',
        version: '2',
        method: 'status',
        taskid: `"${task.data.taskid}"`,
        _sid: sid
      })
      if (!body.success) return null
      const status = dsmMd5StatusSchema.safeParse(body.data)
      if (!status.success) return null
      if (status.data.finished) return status.data.md5 ?? null
      if (Date.now() > deadline) return null
      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
  } catch (e) {
    /* a cancel is not an answer: it must not read as "not there, send it" */
    if (e instanceof UploadCancelled) throw e
    return null
  }
}

const dsmMoveStatusSchema = z.object({ finished: z.boolean().optional() }).passthrough()

/* A file moved or copied about on the storage, by the storage itself — one job, started and then
   waited for, as a checksum is.

   Moving is how a file gets out of the way without being deleted: SkyDock deletes nothing up there
   (RULES, Principles), so what a better copy is about to replace is put somewhere it can still be
   fetched from rather than written over. Copying is how footage the storage already holds reaches a
   second folder that needs it — a passenger's own, a second dropzone — without a byte travelling
   from here.

   `overwrite: false` on purpose: neither may bury a file that is already there. */
const dsmCopyMove = async (
  host: string,
  sid: string,
  filePath: string,
  toFolder: string,
  options?: { pollMs?: number; timeoutMs?: number; keepSource?: boolean }
) => {
  const pollMs = options?.pollMs ?? MD5_POLL_MS
  const deadline = Date.now() + (options?.timeoutMs ?? MD5_TIMEOUT_MS)
  try {
    const started = await dsmFetch(host, {
      api: 'SYNO.FileStation.CopyMove',
      version: '3',
      method: 'start',
      path: JSON.stringify([normalizeNasPath(filePath)]),
      dest_folder_path: JSON.stringify([normalizeNasPath(toFolder)]),
      remove_src: options?.keepSource ? 'false' : 'true',
      overwrite: 'false',
      create_parents: 'true',
      _sid: sid
    })
    if (!started.success) return false
    const task = dsmMd5StartSchema.safeParse(started.data)
    /* a move that finished before it answered has nothing to wait for */
    if (!task.success) return true
    for (;;) {
      const body = await dsmFetch(host, {
        api: 'SYNO.FileStation.CopyMove',
        version: '3',
        method: 'status',
        taskid: `"${task.data.taskid}"`,
        _sid: sid
      })
      if (!body.success) return false
      const status = dsmMoveStatusSchema.safeParse(body.data)
      if (!status.success) return false
      if (status.data.finished) return true
      if (Date.now() > deadline) return false
      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
  } catch {
    return false
  }
}

/* A file renamed where it lies. What the storage copied into a folder arrives under the name it had
   in the folder it came from, and a delivered file's name says which place and which moment it
   belongs to — so the copy is given the name that folder would have given it. */
const dsmRenameFile = async (host: string, sid: string, filePath: string, name: string) => {
  try {
    const body = await dsmFetch(host, {
      api: 'SYNO.FileStation.Rename',
      version: '2',
      method: 'rename',
      path: normalizeNasPath(filePath),
      name,
      _sid: sid
    })
    return body.success === true
  } catch {
    return false
  }
}

const dsmListFolder = async (host: string, sid: string, folderPath: string) => {
  const cpath = normalizeNasPath(folderPath)
  if (cpath === '/') {
    const body = await dsmFetch(host, {
      api: 'SYNO.FileStation.List',
      version: '2',
      method: 'list_share',
      _sid: sid
    })
    if (!body.success) throw new Error(`List shares failed: ${JSON.stringify(body)}`)
    const parsed = dsmSharesSchema.safeParse(body.data)
    const shares = parsed.success ? (parsed.data.shares ?? []) : []
    return shares.map((s) => ({ path: normalizeNasPath(s.path), name: s.name, is_dir: true }))
  }
  const entries = await listNasFolder(host, sid, cpath)
  return entries.map((e) => ({ path: e.path, name: e.name, is_dir: true }))
}

const dsmCreateFolder = async (host: string, sid: string, folderPath: string, name: string) => {
  const normalizedParent = normalizeNasPath(folderPath)
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('Folder name is required')
  if (trimmedName.includes('/')) throw new Error('Folder name must not contain "/"')
  const body = await dsmFetch(host, {
    api: 'SYNO.FileStation.CreateFolder',
    version: '2',
    method: 'create',
    folder_path: normalizedParent,
    name: trimmedName,
    _sid: sid
  })
  if (!body.success)
    throw new Error(
      `Create folder failed for ${normalizedParent}/${trimmedName}: ${JSON.stringify(body)}`
    )
}

const shareLinkSchema = z.array(z.object({ url: z.string().optional() })).optional()

const absoluteShareUrl = (host: string, url: string) => {
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${normalizeHost(host)}${url.startsWith('/') ? url : `/${url}`}`
}

const createShareLink = async (host: string, sid: string, remotePath: string) => {
  const body = await dsmFetch(host, {
    api: 'SYNO.FileStation.Sharing',
    method: 'create',
    version: '2',
    path: remotePath,
    _sid: sid
  })
  if (!body.success) throw new Error(`Share failed for ${remotePath}: ${JSON.stringify(body)}`)
  const url = shareLinkSchema.parse(body.data?.links)?.[0]?.url
  if (!url) throw new Error(`Share returned no link for ${remotePath}`)
  return absoluteShareUrl(host, url)
}

const SHARE_PAGE_SIZE = 1000

const listShareLinks = async (host: string, sid: string) => {
  const links: z.infer<typeof dsmShareLinkSchema>[] = []
  for (let offset = 0; ; offset += SHARE_PAGE_SIZE) {
    const body = await dsmFetch(host, {
      api: 'SYNO.FileStation.Sharing',
      method: 'list',
      version: '1',
      offset: String(offset),
      limit: String(SHARE_PAGE_SIZE),
      _sid: sid
    })
    /* a list cut short is not the storage's list: a link it left out would be taken for revoked */
    if (!body.success) throw new StorageUnreadable('The storage would not list its share links.')
    const parsed = dsmShareListSchema.safeParse(body.data)
    if (!parsed.success)
      throw new StorageUnreadable('The storage’s list of share links made no sense.')
    const page = parsed.data.links ?? []
    links.push(...page)
    const total = parsed.data.total ?? links.length
    if (page.length === 0 || links.length >= total) return links
  }
}

/* a link that has been disabled or has expired is worse than no link — it would be handed to a
   passenger and simply fail, so those are ignored and a fresh one is created instead */
const isLiveShareLink = (link: z.infer<typeof dsmShareLinkSchema>) =>
  !!link.url && (link.status === undefined || link.status === 'valid')

/* The live link the storage holds for one path, whole: its address to hand out and the id it is
   known by over there, which is the only thing a link can be taken away by. */
const shareLinkFor = async (host: string, sid: string, remotePath: string) => {
  const wanted = normalizeNasPath(remotePath)
  try {
    const found = liveShareLinks(host, await listShareLinks(host, sid)).get(wanted)
    return found ?? null
  } catch {
    return null
  }
}

/* Every live link the storage holds, by the path it is for. One question answers a whole folder —
   the storage lists all of its links at once — so a listing says which of its files can be handed
   out without asking about them one at a time. A link the storage does not name is still a link: it
   is handed out and reused like any other, and only taking it away needs its id. */
const liveShareLinks = (host: string, links: z.infer<typeof dsmShareLinkSchema>[]) => {
  const byPath = new Map<string, { id: string | null; url: string }>()
  for (const link of links) {
    if (!isLiveShareLink(link) || link.path === undefined || !link.url) continue
    const where = normalizeNasPath(link.path)
    if (!byPath.has(where))
      byPath.set(where, { id: link.id ?? null, url: absoluteShareUrl(host, link.url) })
  }
  return byPath
}

const findShareLink = async (host: string, sid: string, remotePath: string) =>
  (await shareLinkFor(host, sid, remotePath))?.url ?? null

/* A link taken away. The storage knows a link by its own id and not by what it points at, so what
   is removed is the link that was found for that file — and the file itself is untouched: a link is
   a way in, not the thing it opens (RULES, Principles). */
const removeShareLink = async (host: string, sid: string, id: string) => {
  const body = await dsmFetch(host, {
    api: 'SYNO.FileStation.Sharing',
    method: 'delete',
    version: '1',
    id,
    _sid: sid
  })
  return body.success === true
}

/* reuse before creating: re-processing and re-uploading a folder must not invalidate the link
   already sent to the passenger, and must not litter the NAS with a link per upload */
const ensureShareLink = async (host: string, sid: string, remotePath: string) =>
  (await findShareLink(host, sid, remotePath)) ?? (await createShareLink(host, sid, remotePath))

type DsmAuth = {
  login: (config: DsmConfig) => Promise<{ sid: string; deviceId?: string }>
  validate: (host: string, sid: string) => Promise<boolean>
}

const loadNasSession = (configDir?: string) => {
  try {
    if (!configDir) adoptLegacySession()
    return jsonText.pipe(nasSessionSchema).parse(fs.readFileSync(nasPath(configDir), 'utf-8'))
  } catch {
    return null
  }
}

const saveNasSession = (session: NasSession, configDir?: string) => {
  nasSessionSchema.parse(session)
  const target = nasPath(configDir)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  writeJsonAtomic(target, session)
  fs.chmodSync(target, 0o600)
}

const clearNasSession = (configDir?: string) => {
  const target = nasPath(configDir)
  if (fs.existsSync(target)) fs.unlinkSync(target)
}

const refreshStoredSession = async (
  stored: NasSession,
  configDir?: string,
  login: DsmAuth['login'] = dsmLogin
) => {
  const enc = stored.encPasswd
  if (!enc) throw new Error('No stored password to refresh session')
  /* a `dsm:` blob was sealed with the storage's own public key and cannot be opened here; it is
     replayed for the sessions that still carry one and replaced on the next interactive connect */
  if (enc.startsWith('dsm:')) {
    const cipher = enc.slice(4)
    const body = await dsmFetch(stored.hostname, {
      api: 'SYNO.API.Auth',
      method: 'login',
      version: '6',
      session: 'FileStation',
      format: 'sid',
      account: stored.username,
      passwd: cipher
    })
    const parsedSid = dsmSidResponseSchema.safeParse(body)
    if (!parsedSid.success) throw new Error(dsmApiErrorMessage(body))
    const sid = parsedSid.data.data.sid
    saveNasSession({ ...stored, sessionId: sid }, configDir)
    return sid
  }
  const plain = decryptPasswordFromStorage(stored.hostname, stored.username, enc)
  const { sid, deviceId } = await login({
    host: stored.hostname,
    user: stored.username,
    password: plain,
    deviceId: stored.deviceId
  })
  const newEnc = encryptPasswordForStorage(stored.hostname, stored.username, plain)
  saveNasSession(
    { ...stored, sessionId: sid, encPasswd: newEnc, deviceId: deviceId ?? stored.deviceId },
    configDir
  )
  return sid
}

const loginWithSession = async (
  config: z.infer<typeof nasLoginConfigSchema>,
  dsm: DsmAuth,
  configDir?: string
) => {
  const parsed = nasLoginConfigSchema.safeParse(config)
  if (!parsed.success) throw new Error('Invalid login config')
  const { host, user, password, otp } = parsed.data

  const stored = loadNasSession(configDir)
  const canReuse = stored && stored.hostname === host && stored.username === user
  if (canReuse && (await dsm.validate(host, stored.sessionId))) return stored.sessionId
  if (canReuse && stored && !password && stored.encPasswd) {
    try {
      return await refreshStoredSession(stored, configDir, dsm.login)
    } catch {}
  }
  if (!password) throw new Error('Session expired. Please reconnect to NAS.')
  /* The same account on the same storage keeps what was chosen for it — its folders, and the trust
     a 2-step code earned this machine — so a login that has to be tried again with its code loses
     nothing on the way. Another storage or account starts afresh but for the upload folder. */
  const kept = canReuse && stored ? stored : undefined
  const { sid, deviceId } = await dsm.login({ host, user, password, otp, deviceId: kept?.deviceId })
  saveNasSession(
    {
      hostname: host,
      username: user,
      sessionId: sid,
      backupFolder: kept?.backupFolder,
      encPasswd: encryptPasswordForStorage(host, user, password),
      deviceId: deviceId ?? kept?.deviceId,
      listsDir: kept?.listsDir
    },
    configDir
  )
  return sid
}

const tryAutoRefreshSession = async (configDir?: string) => {
  const stored = loadNasSession(configDir)
  if (!stored || !stored.encPasswd) return null
  try {
    const valid = await dsmValidateSession(stored.hostname, stored.sessionId)
    if (valid) return stored
  } catch {}
  try {
    const sid = await refreshStoredSession(stored, configDir)
    return loadNasSession(configDir) ?? { ...stored, sessionId: sid }
  } catch {}
  return null
}

/* The one gate every caller uses before touching the NAS: a stored session is only a session if
   DSM still accepts it, and a dead one refreshes itself silently from the stored password.
   Returns null when the user really does have to log in again. */
const ensureNasSession = async (configDir?: string) => {
  const session = loadNasSession(configDir)
  if (!session) return null
  if (await dsmValidateSession(session.hostname, session.sessionId)) return session
  const refreshed = await tryAutoRefreshSession(configDir)
  if (refreshed && (await dsmValidateSession(refreshed.hostname, refreshed.sessionId)))
    return refreshed
  return null
}

export {
  DsmLoginError,
  clearNasSession,
  createShareLink,
  decryptPasswordFromStorage,
  dsmConfigSchema,
  dsmCreateFolder,
  dsmEntryUrl,
  dsmFetch,
  dsmFileMd5,
  dsmCopyMove,
  dsmListFolder,
  dsmLogin,
  dsmRenameFile,
  dsmLogout,
  dsmRequestUrl,
  dsmResponseSchema,
  dsmValidateSession,
  encryptPasswordForStorage,
  ensureNasSession,
  ensureShareLink,
  findShareLink,
  listNasFiles,
  listNasFolder,
  listShareLinks,
  liveShareLinks,
  loadNasSession,
  loginWithSession,
  needsCode,
  normalizeNasPath,
  refreshStoredSession,
  removeShareLink,
  saveNasSession,
  shareLinkFor,
  tryAutoRefreshSession,
  NO_SUCH_PATH,
  StorageUnreadable
}
export type { DsmAuth, DsmConfig, NasFolderEntry, NasSession }
