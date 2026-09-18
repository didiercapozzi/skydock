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

const execSyncMock = vi.fn()

/* The slow commands run through `exec` so they do not hold the server; the tests still see every
   command in one place, whichever way it was run. */
const execViaSyncMock = (
  cmd: string,
  options: unknown,
  callback: (error: Error | null, stdout: string, stderr: string) => void
) => {
  try {
    execSyncMock(cmd, options)
    queueMicrotask(() => callback(null, '', ''))
  } catch (e) {
    queueMicrotask(() => callback(e instanceof Error ? e : new Error(String(e)), '', ''))
  }
}

const makeFfmpegMock = () => {
  return (cmd: string | Buffer) => {
    const cmdStr = String(cmd)
    if (cmdStr.includes('command -v exiftool')) {
      throw new Error('command not found')
    }
    return Buffer.from('')
  }
}

const makeExiftoolMock = (timeMap?: Map<string, string>) => {
  return (cmd: string | Buffer, opts?: { encoding?: string }) => {
    const cmdStr = String(cmd)
    if (cmdStr.includes('command -v exiftool')) {
      if (!timeMap) throw new Error('command not found')
      return Buffer.from('/usr/bin/exiftool')
    }
    if (cmdStr.includes('exiftool')) {
      if (opts?.encoding === 'utf-8' && timeMap) {
        const lines = ['SourceFile,DateTimeOriginal,CreateDate,MediaCreateDate']
        for (const [file, tag] of timeMap) {
          const exifDate = tag.replace(/-/g, ':').replace(' ', ' ')
          lines.push(`"${file}","${exifDate}","${exifDate}","${exifDate}"`)
        }
        return lines.join('\n')
      }
      return Buffer.from('')
    }
    return Buffer.from('')
  }
}

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
  execSyncMock,
  execViaSyncMock,
  jsonResponse,
  nasStubs,
  loginFailure,
  loginSuccess,
  makeExiftoolMock,
  makeFfmpegMock,
  makeTmpTree,
  seen,
  stubFetch,
  writeTempFile
}
export type { FetchHandler, SeenCall }
