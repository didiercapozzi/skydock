import * as fs from 'node:fs'
import * as path from 'node:path'

type DsmConfig = {
  host: string
  user: string
  password: string
}

type PublishArgs = DsmConfig & {
  localDir: string
  remoteDir: string
}

type PublishResult = {
  shareUrl: string
}

const normalizeHost = (host: string): string => host.replace(/\/+$/, '')

const dsmEntryUrl = (host: string): string => `${normalizeHost(host)}/webapi/entry.cgi`

type DsmResponse = {
  success: boolean
  data?: Record<string, unknown>
  errno?: unknown
}

const readDsmBody = async (res: Response): Promise<DsmResponse> => {
  try {
    return (await res.json()) as DsmResponse
  } catch {
    throw new Error(`DSM request failed with status ${res.status}`)
  }
}

const dsmLogin = async (config: DsmConfig): Promise<string> => {
  const params = new URLSearchParams({
    api: 'SYNO.API.Auth',
    method: 'login',
    session: 'FileStation',
    format: 'sid',
    account: config.user,
    passwd: config.password
  })
  let lastError = 'unknown error'
  for (const version of ['6', '3']) {
    params.set('version', version)
    const res = await fetch(`${dsmEntryUrl(config.host)}?${params.toString()}`)
    const body = await readDsmBody(res)
    if (body.success && typeof body.data?.sid === 'string') return body.data.sid
    lastError = JSON.stringify(body)
  }
  throw new Error(`DSM login failed: ${lastError}`)
}

const dsmLogout = async (host: string, sid: string): Promise<void> => {
  try {
    await fetch(
      `${dsmEntryUrl(host)}?api=SYNO.API.Auth&method=logout&version=6&session=FileStation&_sid=${encodeURIComponent(sid)}`
    )
  } catch {}
}

const walkFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

const remoteJoin = (...parts: string[]): string => parts.join('/').replace(/\/+/g, '/')

const uploadFile = async (
  host: string,
  sid: string,
  remoteDir: string,
  localPath: string
): Promise<void> => {
  const form = new FormData()
  form.append('path', remoteDir)
  form.append('create_parents', 'true')
  form.append('overwrite', 'true')
  form.append('file', new Blob([fs.readFileSync(localPath)]), path.basename(localPath))
  const params = new URLSearchParams({
    api: 'SYNO.FileStation.Upload',
    method: 'upload',
    version: '2',
    _sid: sid
  })
  const res = await fetch(`${dsmEntryUrl(host)}?${params.toString()}`, {
    method: 'POST',
    body: form
  })
  const body = await readDsmBody(res)
  if (!body.success) throw new Error(`Upload failed for ${localPath}: ${JSON.stringify(body)}`)
}

const createShareLink = async (host: string, sid: string, remotePath: string): Promise<string> => {
  const params = new URLSearchParams({
    api: 'SYNO.FileStation.Sharing',
    method: 'create',
    version: '2',
    path: remotePath,
    _sid: sid
  })
  const res = await fetch(`${dsmEntryUrl(host)}?${params.toString()}`)
  const body = await readDsmBody(res)
  if (!body.success) throw new Error(`Share failed for ${remotePath}: ${JSON.stringify(body)}`)
  const links = body.data?.links as Array<{ url?: string }> | undefined
  const url = links?.[0]?.url
  if (!url) throw new Error(`Share returned no link for ${remotePath}`)
  return `${normalizeHost(host)}${url.startsWith('/') ? url : `/${url}`}`
}

const publishJump = async (args: PublishArgs): Promise<PublishResult> => {
  const sid = await dsmLogin(args)
  try {
    for (const file of walkFiles(args.localDir)) {
      const rel = path.relative(args.localDir, path.dirname(file))
      const remoteDir =
        rel === '' || rel === '.'
          ? args.remoteDir
          : remoteJoin(args.remoteDir, rel.split(path.sep).join('/'))
      await uploadFile(args.host, sid, remoteDir, file)
    }
    return { shareUrl: await createShareLink(args.host, sid, args.remoteDir) }
  } finally {
    await dsmLogout(args.host, sid)
  }
}

export {
  createShareLink,
  dsmEntryUrl,
  dsmLogin,
  dsmLogout,
  publishJump,
  remoteJoin,
  uploadFile,
  walkFiles
}
export type { DsmConfig, PublishArgs, PublishResult }
