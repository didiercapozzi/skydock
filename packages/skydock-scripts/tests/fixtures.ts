import * as fs from 'node:fs'
import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'
import { vi } from 'vitest'
import type { NasSession } from '../src/nas'
import { lastSegment, parentOf } from '../src/paths'
import type { ManifestFile } from '../src/types'

type SeenCall = { url: string; init: RequestInit }

type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>

const createTmpDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

const writeTempFile = (dir: string, name: string, content?: Buffer) => {
  const filePath = path.join(dir, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content || Buffer.alloc(1024, 1))
  return filePath
}

const TOOL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-tools-'))

const TOOL_ENV: Record<string, string> = {
  ffmpeg: 'SKYDOCK_FFMPEG_PATH',
  ffprobe: 'SKYDOCK_FFPROBE_PATH',
  exiftool: 'SKYDOCK_EXIFTOOL_PATH'
}

const tellTools = (missing: string[] = []) => {
  for (const [name, variable] of Object.entries(TOOL_ENV)) {
    const target = path.join(TOOL_DIR, missing.includes(name) ? `no-${name}` : name)
    if (!missing.includes(name) && !fs.existsSync(target)) fs.writeFileSync(target, '')
    vi.stubEnv(variable, target)
  }
}

const onPlatform = <T>(name: string, look: () => T) => {
  const real = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { value: name, configurable: true })
  const restore = () => Object.defineProperty(process, 'platform', real)
  let result: T
  try {
    result = look()
  } catch (e) {
    restore()
    throw e
  }
  if (!(result instanceof Promise)) {
    restore()
    return result
  }
  return result.finally(restore) as T
}

const execSyncMock = vi.fn()

const asLine = (program: string, args: readonly string[]) =>
  [path.basename(program), ...args.map((arg) => (path.isAbsolute(arg) ? `"${arg}"` : arg))].join(
    ' '
  )

const execFileSyncMock = (program: string, args: string[] = [], options?: unknown) =>
  execSyncMock(asLine(program, args), options)

const execFileViaSyncMock = (
  program: string,
  args: string[],
  options: unknown,
  callback: (error: Error | null, stdout: string, stderr: string) => void
) => {
  const fail = (e: unknown) => {
    const stderr = (e as { stderr?: Buffer | string }).stderr
    callback(e instanceof Error ? e : new Error(String(e)), '', stderr ? String(stderr) : '')
  }
  try {
    Promise.resolve(execSyncMock(asLine(program, args), options)).then(
      (out) => callback(null, out ? String(out) : '', ''),
      fail
    )
  } catch (e) {
    queueMicrotask(() => fail(e))
  }
}

const makeFfmpegMock = () => () => Buffer.from('')

const manifestFile = (
  id: string,
  mtime: number,
  over: Partial<ManifestFile> = {}
): ManifestFile => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 10,
  mtime,
  ...over
})

const seen: SeenCall[] = []

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

const stubFetch = (handler: FetchHandler) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return handler(url, init)
    })
  )
}

const loginSuccess = (sid: string) => jsonResponse({ success: true, data: { sid } })

const loginFailure = () =>
  jsonResponse({ success: false, errno: { section: 'auth', key: 'login' } })

const makeTmpTree = () => {
  const dir = createTmpDir('skydock-publish-test-')
  fs.mkdirSync(path.join(dir, 'videos'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'videos', 'a.mp4'), Buffer.from('video'))
  fs.writeFileSync(path.join(dir, 'photos', 'b.jpg'), Buffer.from('photo'))
  return dir
}

const nasStubs = ({
  files = {},
  md5 = {},
  links = []
}: {
  files?: Record<string, { name: string; size: number }[]>
  md5?: Record<string, string>
  links?: { url: string; path: string; status?: string }[]
}) => {
  const tasks = new Map<string, string>()
  let nextTask = 0
  return (url: string): Response | null => {
    const params = new URL(url, 'http://stub').searchParams
    const api = params.get('api')
    const method = params.get('method')
    if (api === 'SYNO.FileStation.List' && method === 'list' && params.get('filetype') === 'file') {
      const folder = params.get('folder_path') ?? ''
      const entries = files[folder] ?? []
      return jsonResponse({
        success: true,
        data: {
          files: entries.map((f) => ({
            name: f.name,
            path: `${folder}/${f.name}`,
            isdir: false,
            additional: { size: f.size }
          }))
        }
      })
    }
    if (api === 'SYNO.FileStation.MD5' && method === 'start') {
      const id = `task-${nextTask++}`
      tasks.set(id, md5[params.get('file_path') ?? ''] ?? '')
      return jsonResponse({ success: true, data: { taskid: id } })
    }
    if (api === 'SYNO.FileStation.MD5' && method === 'status') {
      const raw = params.get('taskid') ?? ''
      const digest = tasks.get(raw.replace(/^"|"$/g, ''))
      return jsonResponse({ success: true, data: { finished: true, md5: digest || undefined } })
    }
    if (api === 'SYNO.FileStation.Sharing' && method === 'list') {
      return jsonResponse({ success: true, data: { links, total: links.length } })
    }
    return null
  }
}

const startListStorage = async (
  initial: Record<string, string>,
  { listing = 'works', refuse }: { listing?: 'works' | 'fails'; refuse?: string } = {}
) => {
  const held = new Map(Object.entries(initial))
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8')
      const dest = /name="path"\r\n\r\n([^\r]*)/.exec(body)?.[1] ?? ''
      const file = /filename="([^"]+)"[^\r]*\r\n[^\r]*\r\n\r\n([\s\S]*?)\r\n--/.exec(body)
      const kept = file && file[1] !== refuse
      if (file && kept) held.set(`${dest}/${file[1]!}`, file[2]!)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(kept ? { success: true } : { success: false, error: { code: 414 } }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  const first = (list: string | null) => (JSON.parse(list ?? '[]') as string[])[0] ?? ''
  vi.stubGlobal(
    'fetch',
    vi.fn(async (target: string) => {
      const params = new URL(target).searchParams
      if (params.get('api') === 'SYNO.FileStation.List') {
        if (listing === 'fails') return jsonResponse({ success: false, error: { code: 119 } })
        const folder = params.get('folder_path')
        const files = [...held]
          .filter(([at]) => parentOf(at) === folder)
          .map(([at, text]) => ({
            name: lastSegment(at),
            path: at,
            isdir: false,
            additional: { size: text.length }
          }))
        return jsonResponse({ success: true, data: { files, total: files.length, offset: 0 } })
      }
      if (params.get('api') === 'SYNO.FileStation.Download') {
        const text = held.get(first(params.get('path')))
        if (text === undefined)
          return new Response('<!DOCTYPE html><html>Bad Gateway</html>', { status: 502 })
        return new Response(text)
      }
      if (params.get('api') === 'SYNO.FileStation.CopyMove') {
        const from = first(params.get('path'))
        const text = held.get(from)
        if (text === undefined) return jsonResponse({ success: false, error: { code: 408 } })
        held.delete(from)
        held.set(`${first(params.get('dest_folder_path'))}/${lastSegment(from)}`, text)
        return jsonResponse({ success: true })
      }
      throw new Error(`unexpected ${target}`)
    })
  )
  const session: NasSession = { hostname: url, username: 'u', sessionId: 'sid' }
  return {
    session,
    file: (at: string) => held.get(at) ?? null,
    paths: () => [...held.keys()].sort(),
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

const cameraWatching = (over: Partial<NonNullable<typeof globalThis.skydockCameraWatch>> = {}) => {
  globalThis.skydockCameraWatch = {
    timer: null,
    seen: new Set(),
    queue: [],
    copying: false,
    said: '',
    kde: [],
    asking: false,
    askUntil: 0,
    askedAt: 0,
    seenOn: {},
    keys: {},
    fresh: {},
    checking: new Set(),
    looking: false,
    prompts: [],
    only: {},
    saidKnown: '',
    ...over
  }
}

const CONTAINERS = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi'])

const ffmpegRefusal = (line: string, out: string) => {
  if (/(^|\s)-f\s+\w+/.test(line)) return null
  const extension = out.split('.').pop()?.toLowerCase() ?? ''
  return CONTAINERS.has(extension)
    ? null
    : `Unable to choose an output format for '${out}'; use a standard extension for the filename or specify the format manually.`
}

const fakeTools =
  ({
    width = 3840,
    height = 1080,
    rotation
  }: { width?: number; height?: number; rotation?: number } = {}) =>
  (cmd: string | Buffer, opts?: { encoding?: string }) => {
    const line = String(cmd)
    if (line.startsWith('ffprobe')) {
      const shape = `width=${width}\nheight=${height}\n${rotation === undefined ? '' : `rotation=${rotation}\n`}`
      return opts?.encoding ? shape : Buffer.from(shape)
    }
    if (line.startsWith('ffmpeg')) {
      const out = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]).at(-1)
      if (!out) return Buffer.from('')
      const refusal = ffmpegRefusal(line, out)
      if (refusal !== null) {
        const failure = new Error('ffmpeg exited with code 234') as Error & { stderr: Buffer }
        failure.stderr = Buffer.from(`${refusal}\nError opening output file ${out}.\n`)
        throw failure
      }
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, Buffer.from('media'))
    }
    return Buffer.from('')
  }

export {
  cameraWatching,
  createTmpDir,
  execFileSyncMock,
  execFileViaSyncMock,
  execSyncMock,
  fakeTools,
  jsonResponse,
  nasStubs,
  onPlatform,
  loginFailure,
  loginSuccess,
  makeFfmpegMock,
  makeTmpTree,
  manifestFile,
  seen,
  startListStorage,
  stubFetch,
  tellTools,
  writeTempFile
}
export type { FetchHandler, SeenCall }
