import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { writeJsonAtomic } from './lib/fs'
import { getConfigDir, getStatusDir } from './utils'

const nasSessionSchema = z.object({
  hostname: z.string(),
  username: z.string(),
  sessionId: z.string(),
  defaultFolder: z.string().optional(),
  /* where the original videos are archived, kept apart from anything a passenger can see */
  backupFolder: z.string().optional(),
  encPasswd: z.string().optional()
})
type NasSession = z.infer<typeof nasSessionSchema>

const nasLoginConfigSchema = z.object({
  host: z.string(),
  user: z.string(),
  password: z.string()
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
  data: z.object({ sid: z.string() }).passthrough()
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

const dsmEncryptionInfoSchema = z
  .object({
    public_key: z.string().optional(),
    publicKey: z.string().optional(),
    key: z.string().optional()
  })
  .passthrough()

const dsmConfigSchema = z.object({
  host: z.string(),
  user: z.string(),
  password: z.string()
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

const normalizeHost = (host: string): string => host.replace(/\/+$/, '')

const dsmEntryUrl = (host: string): string => `${normalizeHost(host)}/webapi/entry.cgi`

const dsmRequestUrl = (host: string, params: Record<string, string>) =>
  new URL(`${dsmEntryUrl(host)}?${new URLSearchParams(params)}`)

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
  const controller = options.timeoutMs ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs) : null
  try {
    const url = dsmRequestUrl(host, params).toString()
    const init: DsmRequestInit = body
      ? { method: 'POST', headers: options.headers, body, duplex: options.duplex ?? 'half' }
      : {}
    const res = await fetch(url, controller ? { ...init, signal: controller.signal } : init)
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
    if (controller && err instanceof Error && err.name === 'AbortError') {
      throw new Error(`DSM request timed out after ${options.timeoutMs}ms`)
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

const dsmLoginAttempt = async (config: DsmConfig, version: string) => {
  const body = await dsmFetch(config.host, {
    api: 'SYNO.API.Auth',
    method: 'login',
    version,
    session: 'FileStation',
    format: 'sid',
    account: config.user,
    passwd: config.password
  })
  const parsed = dsmSidResponseSchema.safeParse(body)
  if (parsed.success) return parsed.data.data.sid
  throw new Error(dsmApiErrorMessage(body))
}

const dsmLogin = async (config: DsmConfig): Promise<string> => {
  const versions = ['7', '6', '3']
  let lastErr: Error | null = null
  for (const v of versions) {
    try {
      return await dsmLoginAttempt(config, v)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      const msg = lastErr.message
      if (
        msg.includes('not supported') ||
        msg.includes('102') ||
        msg.includes('103') ||
        msg.includes('104')
      )
        continue
      if (msg.includes('400') && v !== versions[versions.length - 1]) continue
    }
  }
  throw lastErr ?? new Error('DSM login failed: no version succeeded')
}

const dsmLogout = async (host: string, sid: string): Promise<void> => {
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

const dsmGetEncryptionInfo = async (host: string) => {
  try {
    const body = await dsmFetch(host, {
      api: 'SYNO.API.Encryption',
      method: 'getinfo',
      version: '1'
    })
    const parsed = dsmEncryptionInfoSchema.safeParse(body.data)
    if (!parsed.success) return null
    const raw = parsed.data.public_key ?? parsed.data.publicKey ?? parsed.data.key
    if (!raw) return null
    const pem = raw.includes('BEGIN PUBLIC KEY')
      ? raw
      : `-----BEGIN PUBLIC KEY-----\n${raw}\n-----END PUBLIC KEY-----`
    return { publicKey: pem }
  } catch {
    return null
  }
}

/* Always local AES. DSM's public key encrypts a password for one login request, not for storage:
   the stored `dsm:` ciphertext cannot be decrypted here and replaying it as `passwd` is not the
   envelope DSM expects, so an expired session could never refresh itself silently. `dsm:` blobs
   written by older versions are still read (see refreshStoredSession) and replaced on next connect. */
const encryptPasswordForStorage = (host: string, user: string, plain: string) =>
  `local:${encryptLocal(host, user, plain)}`

const decryptPasswordFromStorage = (host: string, user: string, stored: string) => {
  if (stored.startsWith('dsm:')) throw new Error('DSM encrypted password requires re-entry')
  if (stored.startsWith('local:')) return decryptLocal(host, user, stored.slice(6))
  return decryptLocal(host, user, stored)
}

type NasFolderEntry = z.infer<typeof dsmFileEntrySchema>

type NasFileEntry = { name: string; path: string; size: number | null }

const normalizeNasPath = (input: string): string => {
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

/* files with their byte size — the cheap half of the "is it already up there" question.
   A folder that does not exist yet is not an error: it just holds nothing. */
const listNasFiles = async (host: string, sid: string, folderPath: string) => {
  const cpath = normalizeNasPath(folderPath)
  try {
    const body = await dsmFetch(host, {
      api: 'SYNO.FileStation.List',
      version: '2',
      method: 'list',
      folder_path: cpath,
      additional: '["size","time"]',
      filetype: 'file',
      _sid: sid
    })
    if (!body.success) return []
    const parsed = dsmSizedFilesSchema.safeParse(body.data)
    if (!parsed.success) return []
    return (parsed.data.files ?? [])
      .filter((f) => f.isdir !== true)
      .map((f) => ({
        name: f.name,
        path: normalizeNasPath(f.path),
        size: f.additional?.size ?? f.size ?? null,
        mtime: f.additional?.time?.mtime ?? null
      }))
  } catch {
    return []
  }
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
  } catch {
    return null
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
    if (!body.success) return links
    const parsed = dsmShareListSchema.safeParse(body.data)
    if (!parsed.success) return links
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

const findShareLink = async (host: string, sid: string, remotePath: string) => {
  const wanted = normalizeNasPath(remotePath)
  try {
    const links = await listShareLinks(host, sid)
    const match = links.find(
      (l) => isLiveShareLink(l) && l.path !== undefined && normalizeNasPath(l.path) === wanted
    )
    return match?.url ? absoluteShareUrl(host, match.url) : null
  } catch {
    return null
  }
}

/* reuse before creating: re-processing and re-uploading a folder must not invalidate the link
   already sent to the passenger, and must not litter the NAS with a link per upload */
const ensureShareLink = async (host: string, sid: string, remotePath: string) =>
  (await findShareLink(host, sid, remotePath)) ?? (await createShareLink(host, sid, remotePath))

type DsmAuth = {
  login: (config: DsmConfig) => Promise<string>
  validate: (host: string, sid: string) => Promise<boolean>
}

const loadNasSession = (configDir?: string): NasSession | null => {
  try {
    if (!configDir) adoptLegacySession()
    return nasSessionSchema.parse(JSON.parse(fs.readFileSync(nasPath(configDir), 'utf-8')))
  } catch {
    return null
  }
}

const saveNasSession = (session: NasSession, configDir?: string): void => {
  nasSessionSchema.parse(session)
  const target = nasPath(configDir)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  writeJsonAtomic(target, session)
  fs.chmodSync(target, 0o600)
}

const clearNasSession = (configDir?: string): void => {
  const target = nasPath(configDir)
  if (fs.existsSync(target)) fs.unlinkSync(target)
}

/* Two folders are remembered: where uploads go, and where the original videos are kept. They are
   chosen the same way and never derived from each other — a backup that falls back to the upload
   folder puts gigabytes of rushes in a passenger's hands. */
const updateNasFolder = (kind: 'default' | 'backup', folder: string, configDir?: string): void => {
  const session = loadNasSession(configDir)
  if (!session) return
  const key = kind === 'backup' ? 'backupFolder' : 'defaultFolder'
  saveNasSession({ ...session, [key]: folder }, configDir)
}

const refreshStoredSession = async (
  stored: NasSession,
  configDir?: string,
  login: (config: DsmConfig) => Promise<string> = dsmLogin
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
  const sid = await login({ host: stored.hostname, user: stored.username, password: plain })
  const newEnc = encryptPasswordForStorage(stored.hostname, stored.username, plain)
  saveNasSession({ ...stored, sessionId: sid, encPasswd: newEnc }, configDir)
  return sid
}

const loginWithSession = async (
  config: z.infer<typeof nasLoginConfigSchema>,
  dsm: DsmAuth,
  configDir?: string
) => {
  const parsed = nasLoginConfigSchema.safeParse(config)
  if (!parsed.success) throw new Error('Invalid login config')
  const { host, user, password } = parsed.data

  const stored = loadNasSession(configDir)
  const canReuse = stored && stored.hostname === host && stored.username === user
  if (canReuse && (await dsm.validate(host, stored.sessionId))) return stored.sessionId
  if (canReuse && stored && !password && stored.encPasswd) {
    try {
      return await refreshStoredSession(stored, configDir, dsm.login)
    } catch {}
  }
  if (canReuse) clearNasSession(configDir)
  if (!password) throw new Error('Session expired. Please reconnect to NAS.')
  const sid = await dsm.login({ host, user, password })
  const encPasswd = encryptPasswordForStorage(host, user, password)
  saveNasSession(
    {
      hostname: host,
      username: user,
      sessionId: sid,
      defaultFolder: stored?.defaultFolder,
      encPasswd
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
  clearNasSession,
  createShareLink,
  decryptPasswordFromStorage,
  dsmConfigSchema,
  dsmCreateFolder,
  dsmEntryUrl,
  dsmFetch,
  dsmFileMd5,
  dsmGetEncryptionInfo,
  dsmListFolder,
  dsmLogin,
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
  loadNasSession,
  loginWithSession,
  normalizeNasPath,
  refreshStoredSession,
  saveNasSession,
  tryAutoRefreshSession,
  updateNasFolder
}
export type { DsmAuth, DsmConfig, NasFileEntry, NasFolderEntry, NasSession }
