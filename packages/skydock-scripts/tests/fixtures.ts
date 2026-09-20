import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { vi } from 'vitest'

type SeenCall = { url: string; init: RequestInit }

type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>

const createTmpDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

const writeTempFile = (dir: string, name: string, content?: Buffer) => {
  const filePath = path.join(dir, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content || Buffer.alloc(1024, 1))
  return filePath
}

/* What this machine has, as far as the app is concerned: it is told where each tool is, so a test
   says which tools are there rather than depending on what the machine happens to have installed.
   A tool that is there is a file that exists; one that is not is a place with nothing in it. */
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

/* The same code answering for another system, which is the only way to try all three from here. */
const onPlatform = (name: string, look: () => void) => {
  const real = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { value: name, configurable: true })
  try {
    look()
  } finally {
    Object.defineProperty(process, 'platform', real)
  }
}

const execSyncMock = vi.fn()

/* A tool is handed its arguments one by one, never a line for a shell to take apart again. A test
   still reads a call as the line it amounts to, with the paths quoted as they were. */
const asLine = (program: string, args: readonly string[]) =>
  [path.basename(program), ...args.map((arg) => (path.isAbsolute(arg) ? `"${arg}"` : arg))].join(
    ' '
  )

const execFileSyncMock = (program: string, args: string[] = [], options?: unknown) =>
  execSyncMock(asLine(program, args), options)

/* The slow commands run through `execFile` so they do not hold the server; the tests still see every
   command in one place, whichever way it was run. */
const execFileViaSyncMock = (
  program: string,
  args: string[],
  options: unknown,
  callback: (error: Error | null, stdout: string, stderr: string) => void
) => {
  try {
    const out = execSyncMock(asLine(program, args), options)
    queueMicrotask(() => callback(null, out ? String(out) : '', ''))
  } catch (e) {
    /* what a failing command said is its stderr, as a real `execFile` hands it back */
    const stderr = (e as { stderr?: Buffer | string }).stderr
    queueMicrotask(() =>
      callback(e instanceof Error ? e : new Error(String(e)), '', stderr ? String(stderr) : '')
    )
  }
}

const makeFfmpegMock = () => () => Buffer.from('')

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

/* A DSM stub for the calls an upload now makes: the file listing that finds size matches, the
   MD5 job that confirms them, and the sharing list that is consulted before a link is created.
   `files` is keyed by folder path, `md5` by file path. */
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
      /* DSM is sent the taskid JSON-quoted and unquotes it itself — see dsmFileMd5 */
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

export {
  createTmpDir,
  execFileSyncMock,
  execFileViaSyncMock,
  execSyncMock,
  jsonResponse,
  nasStubs,
  onPlatform,
  loginFailure,
  loginSuccess,
  makeFfmpegMock,
  makeTmpTree,
  seen,
  stubFetch,
  tellTools,
  writeTempFile
}
export type { FetchHandler, SeenCall }
