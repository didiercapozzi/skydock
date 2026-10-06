import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import { z } from 'zod'

/* A Synology DSM in miniature, run as a process of its own: the part of the DSM Web API that SkyDock's
   client speaks, over a real folder, so the real app can be pointed at it by typing its address. The
   shares are the top-level folders of the root it is given.

   Beside the DSM API it answers a few commands under /__fake/, which only a test uses: they make it
   misbehave the way a real storage does — a wrong password, a 2-step code, a slow or unreachable
   network, an upload refused, a file changed under the app's feet, a session that ran out. */

const configSchema = z.object({
  root: z.string(),
  user: z.string(),
  password: z.string(),
  shares: z.array(z.string())
})
const config = configSchema.parse(JSON.parse(process.env.FAKE_STORAGE ?? '{}'))

type Link = {
  id: string
  url: string
  path: string
  name: string
  status: string
  link_owner: string
}
type Logged = { api: string; method: string; params: Record<string, string> }
type Answer =
  | { success: true; data?: Record<string, unknown> }
  | { success: false; error: { code: number } }
type Call = {
  params: Record<string, string>
  user: string
  origin: string
  req: http.IncomingMessage
  res: http.ServerResponse
  /* the fields and the file of an upload */
  form?: ReturnType<typeof parseMultipart>
}

/* Everything the storage remembers while it runs; a reset is a return to this. */
const freshState = () => ({
  accounts: new Map([[config.user, config.password]]),
  /* the 2-step code every account is asked for, or null while none is */
  otp: null as string | null,
  /* machines that earned trust with a code, and so are not asked again */
  trusted: new Set<string>(),
  sessions: new Map<string, string>(),
  latencyMs: 0,
  unreachable: false,
  refusedUploads: [] as { pattern: RegExp; code: number }[],
  links: [] as Link[],
  /* checksums and copies the storage is working on, by the id it handed out */
  tasks: new Map<string, Promise<Record<string, unknown>>>(),
  calls: [] as Logged[],
  activeUploads: 0,
  peakUploads: 0
})
const state = freshState()

const ok = (data?: Record<string, unknown>) => ({ success: true as const, ...(data && { data }) })
const fail = (code: number) => ({ success: false as const, error: { code } })

const randomId = () => crypto.randomBytes(8).toString('hex')

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const parseJson = (raw: string) => {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

/* DSM takes a list as a JSON array and a single value as it is */
const listOf = (raw = '') => {
  const parsed = z.array(z.string()).safeParse(parseJson(raw))
  return parsed.success ? parsed.data : [raw]
}

/* a path on the storage, cleaned: `..` can never climb out of the root */
const virtualPath = (raw: string) => path.posix.normalize(`/${raw}`).replace(/\/+$/, '') || '/'

const diskOf = (raw: string) => path.join(config.root, virtualPath(raw))

const readBody = (req: http.IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

/* The parts of a multipart body, cut on the bytes so a file survives intact: its text fields, and
   the one file with the name it was sent under. */
const parseMultipart = (body: Buffer, boundary: string) => {
  const delimiter = Buffer.from(`--${boundary}`)
  const fields: Record<string, string> = {}
  let file: { filename: string; data: Buffer } | undefined
  let at = body.indexOf(delimiter)
  while (at !== -1) {
    const start = at + delimiter.length
    const next = body.indexOf(delimiter, start)
    if (body.subarray(start, start + 2).toString() === '--' || next === -1) break
    const part = body.subarray(start + 2, next - 2)
    const split = part.indexOf('\r\n\r\n')
    const head = part.subarray(0, split).toString()
    const data = part.subarray(split + 4)
    const name = /[; ]name="([^"]*)"/.exec(head)?.[1]
    const filename = /filename="([^"]*)"/.exec(head)?.[1]
    if (filename !== undefined) file = { filename, data }
    else if (name !== undefined) fields[name] = data.toString()
    at = next
  }
  return { fields, file }
}

const entryOf = async (virtual: string, wanted: string[]) => {
  const stat = await fs.promises.stat(diskOf(virtual))
  const seconds = (ms: number) => Math.floor(ms / 1000)
  return {
    name: path.posix.basename(virtual),
    path: virtual,
    isdir: stat.isDirectory(),
    additional: {
      ...(wanted.includes('real_path') && { real_path: `/volume1${virtual}` }),
      ...(wanted.includes('size') && { size: stat.size }),
      ...(wanted.includes('time') && {
        time: {
          mtime: seconds(stat.mtimeMs),
          atime: seconds(stat.atimeMs),
          ctime: seconds(stat.ctimeMs),
          crtime: seconds(stat.birthtimeMs)
        }
      })
    }
  }
}

const exists = (file: string) =>
  fs.promises.access(file).then(
    () => true,
    () => false
  )

const login = async ({ params }: Call) => {
  const { account, passwd, otp_code, device_id, enable_device_token } = params
  const expected = account === undefined ? undefined : state.accounts.get(account)
  if (expected === undefined || expected !== passwd) return fail(400)
  const trusted = device_id !== undefined && state.trusted.has(device_id)
  if (state.otp !== null && !trusted) {
    if (!otp_code) return fail(403)
    if (otp_code !== state.otp) return fail(404)
  }
  const sid = randomId()
  state.sessions.set(sid, account!)
  /* a code that was accepted and asked to be remembered earns this machine a device token */
  const did = state.otp !== null && !trusted && enable_device_token === 'yes' ? randomId() : null
  if (did) state.trusted.add(did)
  return ok({ sid, ...(did && { did }) })
}

const logout = async ({ params }: Call) => {
  state.sessions.delete(params._sid ?? '')
  return ok()
}

const listShare = async () => {
  const names = await fs.promises.readdir(config.root, { withFileTypes: true })
  const shares = names
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: `/${entry.name}`, isdir: true }))
  return ok({ shares, total: shares.length, offset: 0 })
}

const list = async ({ params }: Call) => {
  const folder = virtualPath(params.folder_path ?? '/')
  const names = await fs.promises.readdir(diskOf(folder)).catch(() => null)
  if (!names) return fail(408)
  const wanted = z
    .array(z.string())
    .catch([])
    .parse(parseJson(params.additional ?? ''))
  const all = await Promise.all(names.sort().map((name) => entryOf(`${folder}/${name}`, wanted)))
  const kind = params.filetype ?? 'all'
  const kept = all.filter((entry) => kind === 'all' || entry.isdir === (kind === 'dir'))
  const offset = Number(params.offset ?? 0)
  const limit = Number(params.limit ?? 0)
  return ok({
    total: kept.length,
    offset,
    files: kept.slice(offset, limit > 0 ? offset + limit : undefined)
  })
}

/* The upload of a file, whole: written where DSM would put it, under the date it was sent with.
   A file already there is refused unless the sender said to write over it. */
const upload = async ({ form }: Call) => {
  if (!form?.file) return fail(1802)
  const { fields, file } = form
  const refused = state.refusedUploads.find((r) => r.pattern.test(file.filename))
  if (refused) return fail(refused.code)
  const folder = diskOf(fields.path ?? '/')
  if (!(await exists(folder))) {
    if (fields.create_parents !== 'true') return fail(408)
    await fs.promises.mkdir(folder, { recursive: true })
  }
  const target = path.join(folder, path.basename(file.filename))
  if (fields.overwrite !== 'true' && (await exists(target))) return fail(414)
  await fs.promises.writeFile(target, file.data)
  const mtime = Number(fields.mtime)
  if (Number.isFinite(mtime)) await fs.promises.utimes(target, mtime / 1000, mtime / 1000)
  return ok({ blSkip: false, file: file.filename, pid: process.pid, progress: 1 })
}

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.zip': 'application/zip'
}

/* A file's bytes, the whole of it or the range asked for, as DSM streams it. */
const sendFile = async (
  file: string,
  { req, res }: Pick<Call, 'req' | 'res'>,
  attachment: boolean
) => {
  const { size } = await fs.promises.stat(file)
  const asked = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
  const start = asked?.[1]
    ? Number(asked[1])
    : asked?.[2]
      ? Math.max(0, size - Number(asked[2]))
      : 0
  const end = asked?.[1] && asked[2] ? Math.min(Number(asked[2]), size - 1) : size - 1
  res.writeHead(asked ? 206 : 200, {
    'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Content-Length': size === 0 ? 0 : end - start + 1,
    ...(asked && { 'Content-Range': `bytes ${start}-${end}/${size}` }),
    ...(attachment && {
      'Content-Disposition': `attachment; filename="${path.basename(file)}"`
    })
  })
  if (size === 0) return res.end()
  fs.createReadStream(file, { start, end }).pipe(res)
}

/* DSM answers a download it cannot make as JSON, with a 200 like any other API answer */
const download = async (call: Call) => {
  const file = diskOf(listOf(call.params.path)[0] ?? '')
  const stat = await fs.promises.stat(file).catch(() => null)
  if (!stat?.isFile()) return fail(408)
  await sendFile(file, call, call.params.mode !== 'open')
  return undefined
}

const startMd5 = async ({ params }: Call) => {
  const file = diskOf(params.file_path ?? '')
  if (!(await fs.promises.stat(file).catch(() => null))?.isFile()) return fail(408)
  const taskid = randomId()
  state.tasks.set(
    taskid,
    new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5')
      fs.createReadStream(file)
        .on('data', (chunk) => hash.update(chunk))
        .on('error', reject)
        .on('end', () => resolve({ finished: true, md5: hash.digest('hex') }))
    })
  )
  return ok({ taskid })
}

/* a task is asked about with its id in quotes, as the client sends it */
const taskStatus = async ({ params }: Call) => {
  const task = state.tasks.get((params.taskid ?? '').replace(/"/g, ''))
  return task ? ok(await task) : fail(599)
}

/* What the storage copies or moves by itself. A name already taken at the destination is skipped
   unless overwriting was asked for, as DSM does, and a source that is not there is an error told in
   the answer. The work is done by the time the first status is asked. */
const startCopyMove = async ({ params }: Call) => {
  const sources = listOf(params.path)
  const destination = virtualPath(listOf(params.dest_folder_path)[0] ?? '')
  const folder = diskOf(destination)
  if (!(await exists(folder))) {
    if (params.create_parents !== 'true') return fail(408)
    await fs.promises.mkdir(folder, { recursive: true })
  }
  const taskid = randomId()
  state.tasks.set(
    taskid,
    (async () => {
      const errors: { code: number; path: string }[] = []
      for (const source of sources) {
        const from = diskOf(source)
        const to = path.join(folder, path.basename(from))
        if (!(await exists(from))) errors.push({ code: 408, path: source })
        else if (params.overwrite !== 'true' && (await exists(to))) continue
        else if (params.remove_src === 'true') await fs.promises.rename(from, to)
        else await fs.promises.cp(from, to, { recursive: true, preserveTimestamps: true })
      }
      return {
        finished: true,
        progress: 1,
        dest_folder_path: destination,
        ...(errors.length > 0 && { errors })
      }
    })()
  )
  return ok({ taskid })
}

const rename = async ({ params }: Call) => {
  const from = virtualPath(listOf(params.path)[0] ?? '')
  const name = listOf(params.name)[0] ?? ''
  if (!(await exists(diskOf(from)))) return fail(408)
  const to = path.posix.join(path.posix.dirname(from), name)
  if (!name || name.includes('/')) return fail(418)
  if (await exists(diskOf(to))) return fail(414)
  await fs.promises.rename(diskOf(from), diskOf(to))
  return ok({ files: [await entryOf(to, [])] })
}

const createFolder = async ({ params }: Call) => {
  const parent = virtualPath(listOf(params.folder_path)[0] ?? '')
  const name = listOf(params.name)[0] ?? ''
  if (!name || name.includes('/')) return fail(418)
  const target = path.posix.join(parent, name)
  const recursive = params.force_parent === 'true'
  if (!recursive && !(await exists(diskOf(parent)))) return fail(408)
  if (await exists(diskOf(target))) return fail(1100)
  await fs.promises.mkdir(diskOf(target), { recursive })
  return ok({ folders: [{ path: target, name, isdir: true }] })
}

const createLink = async ({ params, user, origin }: Call) => {
  const target = virtualPath(listOf(params.path)[0] ?? '')
  if (!(await exists(diskOf(target)))) return fail(408)
  const id = randomId().slice(0, 8)
  const link = {
    id,
    url: `${origin}/sharing/${id}`,
    path: target,
    name: path.posix.basename(target),
    status: 'valid',
    link_owner: user
  }
  state.links.push(link)
  return ok({ links: [link] })
}

const listLinks = async ({ params }: Call) => {
  const offset = Number(params.offset ?? 0)
  const limit = Number(params.limit ?? 0)
  return ok({
    links: state.links.slice(offset, limit > 0 ? offset + limit : undefined),
    total: state.links.length,
    offset
  })
}

/* a link taken away: the link goes, the file stays */
const deleteLink = async ({ params }: Call) => {
  const ids = listOf(params.id).flatMap((id) => id.split(','))
  const failed = ids.filter((id) => !state.links.some((link) => link.id === id))
  state.links = state.links.filter((link) => !ids.includes(link.id))
  return ok({ failed_links: failed.map((id) => ({ id, error: { code: 3000 } })) })
}

/* what the storage knows how to do, by the API and method that ask for it */
const handlers: Record<string, (call: Call) => Promise<Answer | undefined>> = {
  'SYNO.API.Auth:login': login,
  'SYNO.API.Auth:logout': logout,
  'SYNO.FileStation.List:list_share': listShare,
  'SYNO.FileStation.List:list': list,
  'SYNO.FileStation.Upload:upload': upload,
  'SYNO.FileStation.Download:download': download,
  'SYNO.FileStation.MD5:start': startMd5,
  'SYNO.FileStation.MD5:status': taskStatus,
  'SYNO.FileStation.CopyMove:start': startCopyMove,
  'SYNO.FileStation.CopyMove:status': taskStatus,
  'SYNO.FileStation.Rename:rename': rename,
  'SYNO.FileStation.CreateFolder:create': createFolder,
  'SYNO.FileStation.Sharing:create': createLink,
  'SYNO.FileStation.Sharing:list': listLinks,
  'SYNO.FileStation.Sharing:delete': deleteLink
}

/* what a call is logged with: never a password or a code */
const SECRETS = new Set(['_sid', 'passwd', 'otp_code'])

const sendJson = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const handleApi = async (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => {
  const params = Object.fromEntries(url.searchParams)
  const boundary = /boundary=(.+)$/.exec(req.headers['content-type'] ?? '')?.[1]
  const body = await readBody(req)
  const form = boundary ? parseMultipart(body, boundary) : undefined
  const api = params.api ?? ''
  const method = params.method ?? ''
  const isUpload = api === 'SYNO.FileStation.Upload'
  state.calls.push({
    api,
    method,
    params: {
      ...Object.fromEntries(Object.entries(params).filter(([key]) => !SECRETS.has(key))),
      ...form?.fields,
      ...(form?.file && { filename: form.file.filename, size: String(form.file.data.length) })
    }
  })
  if (isUpload) state.peakUploads = Math.max(state.peakUploads, ++state.activeUploads)
  try {
    await sleep(state.latencyMs)
    const handler = handlers[`${api}:${method}`]
    if (!handler) return sendJson(res, 200, fail(103))
    const user = state.sessions.get(params._sid ?? '')
    if (api !== 'SYNO.API.Auth' && user === undefined) return sendJson(res, 200, fail(119))
    const answer = await handler({
      params,
      user: user ?? '',
      origin: `http://${req.headers.host}`,
      req,
      res,
      form
    })
    if (answer) sendJson(res, 200, answer)
  } finally {
    if (isUpload) state.activeUploads -= 1
  }
}

/* A shared file opened through its link: the bytes while the link is valid, nothing after. */
const handleSharing = async (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => {
  const link = state.links.find((l) => url.pathname === `/sharing/${l.id}`)
  if (link?.status !== 'valid' || !(await exists(diskOf(link.path)))) {
    res.writeHead(404).end('This link is no longer available')
    return
  }
  await sendFile(diskOf(link.path), { req, res }, true)
}

/* a stored file's bytes changed where it lies, its size and date kept, so only a checksum or a
   download can tell */
const corruptFile = async (virtual: string) => {
  const file = diskOf(virtual)
  const before = await fs.promises.stat(file)
  const handle = await fs.promises.open(file, 'r+')
  try {
    const first = Buffer.alloc(1)
    const { bytesRead } = await handle.read(first, 0, 1, 0)
    await handle.write(Buffer.from([bytesRead === 0 ? 1 : first[0]! ^ 0xff]), 0, 1, 0)
  } finally {
    await handle.close()
  }
  await fs.promises.utimes(file, before.atime, before.mtime)
}

/* back to a storage just started: nothing remembered, nothing in the shares */
const reset = async () => {
  Object.assign(state, freshState())
  await Promise.all(
    (await fs.promises.readdir(config.root)).map((name) =>
      fs.promises.rm(path.join(config.root, name), { recursive: true, force: true })
    )
  )
  await Promise.all(config.shares.map((name) => fs.promises.mkdir(path.join(config.root, name))))
}

const toRegExp = (pattern: { source: string; flags: string }) =>
  new RegExp(pattern.source, pattern.flags)

/* one command a test can give, with the shape of what it sends */
const command = <T extends z.ZodType>(
  schema: T,
  run: (input: z.infer<T>) => unknown | Promise<unknown>
) => ({ schema, run })

const commands = {
  setPassword: command(z.object({ user: z.string(), password: z.string() }), ({ user, password }) =>
    state.accounts.set(user, password)
  ),
  requireOtp: command(z.object({ code: z.string().nullable() }), ({ code }) => {
    state.otp = code
  }),
  latency: command(z.object({ ms: z.number() }), ({ ms }) => {
    state.latencyMs = ms
  }),
  unreachable: command(z.object({ on: z.boolean() }), ({ on }) => {
    state.unreachable = on
  }),
  failUpload: command(
    z.object({
      pattern: z.object({ source: z.string(), flags: z.string() }),
      code: z.number()
    }),
    ({ pattern, code }) => {
      state.refusedUploads.push({ pattern: toRegExp(pattern), code })
    }
  ),
  corrupt: command(z.object({ path: z.string() }), ({ path: virtual }) => corruptFile(virtual)),
  sessionExpire: command(z.object({}), () => state.sessions.clear()),
  shareLinks: command(z.object({}), () => state.links),
  revokeLink: command(z.object({ id: z.string(), status: z.string() }), ({ id, status }) => {
    const link = state.links.find((l) => l.id === id)
    if (link) link.status = status
  }),
  calls: command(z.object({}), () => state.calls),
  peakUploads: command(z.object({}), () => state.peakUploads),
  reset: command(z.object({}), reset)
}

const handleAdmin = async (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => {
  const name = url.pathname.slice('/__fake/'.length)
  const found = Object.entries(commands).find(([key]) => key === name)?.[1]
  const input = found?.schema.safeParse(parseJson((await readBody(req)).toString() || '{}'))
  if (!found || !input?.success) return sendJson(res, 404, { error: `no command ${name}` })
  const result = await (found.run as (input: unknown) => unknown)(input.data)
  sendJson(res, 200, { result: result ?? null })
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://fake')
  const isAdmin = url.pathname.startsWith('/__fake/')
  /* a storage that cannot be reached answers nobody, but the test that made it so */
  if (state.unreachable && !isAdmin) {
    req.socket.destroy()
    return
  }
  const route = isAdmin
    ? handleAdmin
    : url.pathname === '/webapi/entry.cgi'
      ? handleApi
      : url.pathname.startsWith('/sharing/')
        ? handleSharing
        : null
  if (!route) {
    res.writeHead(404).end()
    return
  }
  route(req, res, url).catch((error: unknown) => {
    console.error(error)
    if (!res.headersSent) sendJson(res, 500, { error: String(error) })
    else res.destroy()
  })
})

/* the parent closes this process's input when it goes, and the storage goes with it */
process.stdin.resume()
process.stdin.on('end', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))

await Promise.all(config.shares.map((name) => fs.promises.mkdir(path.join(config.root, name))))
server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  console.log(`listening ${typeof address === 'object' && address ? address.port : 0}`)
})
