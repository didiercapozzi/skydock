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

export {
  createTmpDir,
  execSyncMock,
  jsonResponse,
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
