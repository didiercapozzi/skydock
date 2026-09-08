import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { walkFiles } from './lib/fs'
import { clearNasSession, loadNasSession, saveNasSession } from './nas'

const CHUNK_SIZE = 10 * 1024 * 1024

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

type UploadProgress = {
  filename: string
  bytesUploaded: number
  totalBytes: number
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

const remoteJoin = (...parts: string[]) => parts.join('/').replace(/\/+/g, '/')

const uploadChunk = async (
  host: string,
  sid: string,
  remoteDir: string,
  filename: string,
  chunk: Blob,
  chunkIndex: number,
  totalChunks: number
) => {
  const form = new FormData()
  form.append('path', remoteDir)
  form.append('create_parents', 'true')
  form.append('overwrite', 'true')
  form.append('file', chunk, filename)

  const body = await dsmFetch(
    host,
    { api: 'SYNO.FileStation.Upload', method: 'upload', version: '2', _sid: sid },
    form
  )
  if (!body.success) throw new Error(`Upload chunk ${chunkIndex + 1}/${totalChunks} failed`)
}

const uploadFile = async (
  host: string,
  sid: string,
  remoteDir: string,
  localPath: string,
  onProgress?: (progress: UploadProgress) => void
) => {
  const filename = path.basename(localPath)
  const stat = fs.statSync(localPath)
  const totalBytes = stat.size
  const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE))
  const fd = fs.openSync(localPath, 'r')

  try {
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const offset = chunkIndex * CHUNK_SIZE
      const length = Math.min(CHUNK_SIZE, totalBytes - offset)
      const buffer = Buffer.alloc(length)
      fs.readSync(fd, buffer, 0, length, offset)

      let lastError: Error | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await uploadChunk(
            host,
            sid,
            remoteDir,
            filename,
            new Blob([buffer]),
            chunkIndex,
            totalChunks
          )
          lastError = null
          break
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e))
        }
      }
      if (lastError) throw lastError

      onProgress?.({ filename, bytesUploaded: offset + length, totalBytes })
    }
  } finally {
    fs.closeSync(fd)
  }
}

const folderItemSchema = z.object({
  path: z.string(),
  name: z.string(),
  is_dir: z.boolean()
})

const folderListSchema = z.object({
  files: z.array(folderItemSchema)
})

const dsmListFolder = async (host: string, sid: string, folderPath: string) => {
  const body = await dsmFetch(host, {
    api: 'SYNO.FileStation.List',
    method: 'list',
    version: '2',
    folder_path: folderPath,
    _sid: sid
  })
  if (!body.success) throw new Error(`Failed to list folder ${folderPath}`)
  const parsed = folderListSchema.parse(body.data)
  return parsed.files.filter((f) => f.is_dir)
}

const dsmCreateFolder = async (host: string, sid: string, parentPath: string, name: string) => {
  const body = await dsmFetch(
    host,
    {
      api: 'SYNO.FileStation.CreateFolder',
      method: 'create',
      version: '2',
      _sid: sid
    },
    (() => {
      const form = new FormData()
      form.append('folder_path', parentPath)
      form.append('name', name)
      form.append('force_parent', 'true')
      return form
    })()
  )
  if (!body.success) throw new Error(`Failed to create folder ${name}`)
  return body.data?.folder as string | undefined
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

  if (!config.password) throw new Error('Session expired. Please reconnect to NAS.')

  const sid = await dsmLogin(config)
  saveNasSession({ hostname: config.host, username: config.user, sessionId: sid }, outputDir)
  return { sid, isNew: true as const }
}

const publishJump = async (args: PublishArgs, onProgress?: (progress: UploadProgress) => void) => {
  const { sid } = await loginWithSession(args, args.outputDir)
  try {
    for (const file of walkFiles(args.localDir)) {
      const rel = path.relative(args.localDir, path.dirname(file))
      const remoteDir =
        rel === '.' ? args.remoteDir : remoteJoin(args.remoteDir, rel.split(path.sep).join('/'))
      await uploadFile(args.host, sid, remoteDir, file, onProgress)
    }
    return { shareUrl: await createShareLink(args.host, sid, args.remoteDir) }
  } finally {
    await dsmLogout(args.host, sid)
  }
}

export {
  createShareLink,
  dsmCreateFolder,
  dsmListFolder,
  dsmLogin,
  dsmLogout,
  dsmValidateSession,
  loginWithSession,
  publishJump,
  remoteJoin,
  uploadFile,
  walkFiles
}
export type { DsmConfig, PublishArgs, UploadProgress }
