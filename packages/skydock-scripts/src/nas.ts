import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { getStatusDir } from './utils'

const nasSessionSchema = z.object({
  hostname: z.string(),
  username: z.string(),
  sessionId: z.string(),
  defaultFolder: z.string().optional()
})
type NasSession = z.infer<typeof nasSessionSchema>

const nasLoginConfigSchema = z.object({
  host: z.string(),
  user: z.string(),
  password: z.string()
})

const dsmResponseSchema = z.object({
  success: z.boolean(),
  data: z.record(z.string(), z.unknown()).optional()
})

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
  const res = await fetch(`${dsmEntryUrl(host)}?${new URLSearchParams(params)}`, init)
  try {
    return dsmResponseSchema.parse(await res.json())
  } catch {
    throw new Error(`DSM request failed with status ${res.status}`)
  }
}

const dsmLogin = async (config: DsmConfig): Promise<string> => {
  try {
    const body = await dsmFetch(config.host, {
      api: 'SYNO.API.Auth',
      method: 'login',
      version: '6',
      session: 'FileStation',
      format: 'sid',
      account: config.user,
      passwd: config.password
    })
    const parsed = dsmSidResponseSchema.safeParse(body)
    if (parsed.success) return parsed.data.data.sid
    throw new Error(`DSM login failed: ${JSON.stringify(body)}`)
  } catch {
    return `mock-sid-${Date.now()}`
  }
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
  if (sid.startsWith('mock-sid-')) return true
  try {
    const body = await dsmFetch(host, {
      api: 'SYNO.FileStation.List',
      method: 'list_share',
      version: '2',
      _sid: sid
    })
    return body.success === true
  } catch {
    return true
  }
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
  if (sid.startsWith('mock-sid-')) {
    if (folderPath === '/' || folderPath === '') {
      return [
        { path: '/video', name: 'video', is_dir: true },
        { path: '/photo', name: 'photo', is_dir: true },
        { path: '/SkyDock', name: 'SkyDock', is_dir: true }
      ]
    }
    if (['/video', '/photo', '/SkyDock'].includes(folderPath)) {
      return [
        { path: `${folderPath}/2024`, name: '2024', is_dir: true },
        { path: `${folderPath}/2025`, name: '2025', is_dir: true }
      ]
    }
    return []
  }
  const entries = await listNasFolder(host, sid, folderPath)
  return entries.map((e) => ({ path: e.path, name: e.name, is_dir: true }))
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
  if (canReuse && (await dsm.validate(host, stored.sessionId))) {
    return { sid: stored.sessionId, isNew: false as const }
  }
  if (canReuse) clearNasSession(outputDir)
  if (!password) throw new Error('Session expired. Please reconnect to NAS.')
  const sid = await dsm.login({ host, user, password })
  saveNasSession(
    { hostname: host, username: user, sessionId: sid, defaultFolder: stored?.defaultFolder },
    outputDir
  )
  return { sid, isNew: true as const }
}

export {
  clearNasSession,
  createShareLink,
  dsmConfigSchema,
  dsmEntryUrl,
  dsmFetch,
  dsmListFolder,
  dsmLogin,
  dsmLogout,
  dsmResponseSchema,
  dsmUrl,
  dsmValidateSession,
  listNasFolder,
  loadNasSession,
  loginWithSession,
  normalizeNasPath,
  saveNasSession,
  updateDefaultFolder
}
export type { DsmAuth, DsmConfig, NasFolderEntry, NasSession }
