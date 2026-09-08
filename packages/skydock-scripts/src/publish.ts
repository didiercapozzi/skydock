import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { clearNasSession, loadNasSession, saveNasSession } from './nas'

const dsmResponseSchema = z.object({
  success: z.boolean(),
  data: z.record(z.string(), z.unknown()).optional()
})

type DsmConfig = {
  host: string
  user: string
  password: string
}

type PublishArgs = DsmConfig & {
  localDir: string
  remoteDir: string
  outputDir?: string
}

const dsmUrl = (host: string) => `${host.replace(/\/+$/, '')}/webapi/entry.cgi`

const dsmFetch = async (host: string, params: Record<string, string>, body?: FormData) => {
  const init: RequestInit = body ? { method: 'POST', body } : {}
  const res = await fetch(`${dsmUrl(host)}?${new URLSearchParams(params)}`, init)
  try {
    return dsmResponseSchema.parse(await res.json())
  } catch {
    throw new Error(`DSM request failed with status ${res.status}`)
  }
}

const dsmLogin = async (config: DsmConfig) => {
  for (const version of ['6', '3']) {
    const body = await dsmFetch(config.host, {
      api: 'SYNO.API.Auth',
      method: 'login',
      version,
      session: 'FileStation',
      format: 'sid',
      account: config.user,
      passwd: config.password
    })
    if (body.success && typeof body.data?.sid === 'string') return body.data.sid
  }
  throw new Error('DSM login failed')
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
      api: 'SYNO.API.Auth',
      method: 'check',
      version: '6',
      session: 'FileStation',
      _sid: sid
    })
    return body.success === true
  } catch {
    return false
  }
}

const walkFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walkFiles(full) : entry.isFile() ? [full] : []
  })

const remoteJoin = (...parts: string[]) => parts.join('/').replace(/\/+/g, '/')

const uploadFile = async (host: string, sid: string, remoteDir: string, localPath: string) => {
  const form = new FormData()
  form.append('path', remoteDir)
  form.append('create_parents', 'true')
  form.append('overwrite', 'true')
  form.append('file', new Blob([fs.readFileSync(localPath)]), path.basename(localPath))

  const body = await dsmFetch(
    host,
    { api: 'SYNO.FileStation.Upload', method: 'upload', version: '2', _sid: sid },
    form
  )
  if (!body.success) throw new Error(`Upload failed for ${localPath}: ${JSON.stringify(body)}`)
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
  const hostBase = dsmUrl(host).replace('/webapi/entry.cgi', '')
  return `${hostBase}${url.startsWith('/') ? url : `/${url}`}`
}

const loginWithSession = async (config: DsmConfig, outputDir?: string) => {
  const stored = loadNasSession(outputDir)
  const canReuse = stored && stored.hostname === config.host && stored.username === config.user
  if (canReuse && (await dsmValidateSession(config.host, stored.sessionId))) {
    return { sid: stored.sessionId, isNew: false as const }
  }
  if (canReuse) clearNasSession(outputDir)

  const sid = await dsmLogin(config)
  saveNasSession({ hostname: config.host, username: config.user, sessionId: sid }, outputDir)
  return { sid, isNew: true as const }
}

const publishJump = async (args: PublishArgs) => {
  const { sid } = await loginWithSession(args, args.outputDir)
  try {
    for (const file of walkFiles(args.localDir)) {
      const rel = path.relative(args.localDir, path.dirname(file))
      const remoteDir =
        rel === '.' ? args.remoteDir : remoteJoin(args.remoteDir, rel.split(path.sep).join('/'))
      await uploadFile(args.host, sid, remoteDir, file)
    }
    return { shareUrl: await createShareLink(args.host, sid, args.remoteDir) }
  } finally {
    await dsmLogout(args.host, sid)
  }
}

export {
  createShareLink,
  dsmLogin,
  dsmLogout,
  dsmValidateSession,
  loginWithSession,
  publishJump,
  remoteJoin,
  uploadFile,
  walkFiles
}
export type { DsmConfig, PublishArgs }
