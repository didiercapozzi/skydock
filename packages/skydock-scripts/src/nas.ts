import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { getStatusDir } from './utils'

const nasSessionSchema = z.object({
  hostname: z.string(),
  username: z.string(),
  sessionId: z.string(),
  defaultFolder: z.string().optional(),
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

const nasPath = (outputDir?: string): string => path.join(getStatusDir(outputDir), 'nas.json')

const normalizeHost = (host: string): string => host.replace(/\/+$/, '')

const dsmEntryUrl = (host: string): string => `${normalizeHost(host)}/webapi/entry.cgi`

const dsmUrl = dsmEntryUrl

const dsmFetch = async (host: string, params: Record<string, string>, body?: FormData) => {
  const init: RequestInit = body ? { method: 'POST', body } : {}
  const url = `${dsmEntryUrl(host)}?${new URLSearchParams(params)}`
  const res = await fetch(url, init)
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

const encryptWithPublicKey = (publicKey: string, plain: string) => {
  const buffer = Buffer.from(plain, 'utf8')
  const encrypted = crypto.publicEncrypt(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    buffer
  )
  return encrypted.toString('base64')
}

const encryptPasswordForStorage = async (host: string, user: string, plain: string) => {
  try {
    const info = await dsmGetEncryptionInfo(host)
    if (info) {
      try {
        const enc = encryptWithPublicKey(info.publicKey, plain)
        return `dsm:${enc}`
      } catch {}
    }
  } catch {}
  return `local:${encryptLocal(host, user, plain)}`
}

const decryptPasswordFromStorage = (host: string, user: string, stored: string) => {
  if (stored.startsWith('dsm:')) throw new Error('DSM encrypted password requires re-entry')
  if (stored.startsWith('local:')) return decryptLocal(host, user, stored.slice(6))
  return decryptLocal(host, user, stored)
}

type NasFolderEntry = {
  name: string
  path: string
  isdir: boolean
}

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
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${normalizeHost(host)}${url.startsWith('/') ? url : `/${url}`}`
}

type DsmAuth = {
  login: (config: DsmConfig) => Promise<string>
  validate: (host: string, sid: string) => Promise<boolean>
}

const loadNasSession = (outputDir?: string): NasSession | null => {
  try {
    return nasSessionSchema.parse(JSON.parse(fs.readFileSync(nasPath(outputDir), 'utf-8')))
  } catch {
    return null
  }
}

const saveNasSession = (session: NasSession, outputDir?: string): void => {
  nasSessionSchema.parse(session)
  const target = nasPath(outputDir)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(session, null, 2))
  fs.renameSync(tmp, target)
}

const clearNasSession = (outputDir?: string): void => {
  const target = nasPath(outputDir)
  if (fs.existsSync(target)) fs.unlinkSync(target)
}

const updateDefaultFolder = (folder: string, outputDir?: string): void => {
  const session = loadNasSession(outputDir)
  if (session) saveNasSession({ ...session, defaultFolder: folder }, outputDir)
}

const loginWithSession = async (
  config: z.infer<typeof nasLoginConfigSchema>,
  dsm: DsmAuth,
  outputDir?: string
) => {
  const parsed = nasLoginConfigSchema.safeParse(config)
  if (!parsed.success) throw new Error('Invalid login config')
  const { host, user, password } = parsed.data

  const stored = loadNasSession(outputDir)
  const canReuse = stored && stored.hostname === host && stored.username === user
  if (canReuse && (await dsm.validate(host, stored.sessionId))) return stored.sessionId
  if (canReuse && !password && stored.encPasswd) {
    try {
      const enc = stored.encPasswd
      if (enc.startsWith('dsm:')) {
        const cipher = enc.slice(4)
        const body = await dsmFetch(host, {
          api: 'SYNO.API.Auth',
          method: 'login',
          version: '6',
          session: 'FileStation',
          format: 'sid',
          account: user,
          passwd: cipher
        })
        const parsedSid = dsmSidResponseSchema.safeParse(body)
        if (parsedSid.success) {
          const sid = parsedSid.data.data.sid
          saveNasSession({ ...stored, sessionId: sid }, outputDir)
          return sid
        }
      } else {
        const plain = decryptPasswordFromStorage(host, user, enc)
        const sid = await dsm.login({ host, user, password: plain })
        const newEnc = await encryptPasswordForStorage(host, user, plain)
        saveNasSession({ ...stored, sessionId: sid, encPasswd: newEnc }, outputDir)
        return sid
      }
    } catch {}
  }
  if (canReuse) clearNasSession(outputDir)
  if (!password) throw new Error('Session expired. Please reconnect to NAS.')
  const sid = await dsm.login({ host, user, password })
  const encPasswd = await encryptPasswordForStorage(host, user, password)
  saveNasSession(
    {
      hostname: host,
      username: user,
      sessionId: sid,
      defaultFolder: stored?.defaultFolder,
      encPasswd
    },
    outputDir
  )
  return sid
}

const tryAutoRefreshSession = async (outputDir?: string) => {
  const stored = loadNasSession(outputDir)
  if (!stored || !stored.encPasswd) return null
  try {
    const valid = await dsmValidateSession(stored.hostname, stored.sessionId)
    if (valid) return stored
  } catch {}
  try {
    const enc = stored.encPasswd
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
      if (parsedSid.success) {
        const sid = parsedSid.data.data.sid
        const next = { ...stored, sessionId: sid }
        saveNasSession(next, outputDir)
        return next
      }
    } else {
      const plain = decryptPasswordFromStorage(stored.hostname, stored.username, enc)
      const sid = await dsmLogin({ host: stored.hostname, user: stored.username, password: plain })
      const newEnc = await encryptPasswordForStorage(stored.hostname, stored.username, plain)
      const next = { ...stored, sessionId: sid, encPasswd: newEnc }
      saveNasSession(next, outputDir)
      return next
    }
  } catch {}
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
  dsmGetEncryptionInfo,
  dsmListFolder,
  dsmLogin,
  dsmLogout,
  dsmResponseSchema,
  dsmUrl,
  dsmValidateSession,
  encryptPasswordForStorage,
  listNasFolder,
  loadNasSession,
  loginWithSession,
  normalizeNasPath,
  saveNasSession,
  tryAutoRefreshSession,
  updateDefaultFolder
}
export type { DsmAuth, DsmConfig, NasFolderEntry, NasSession }
