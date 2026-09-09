import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { vi } from 'vitest'

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>

const createTmpDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

const stubFetch = (handler: FetchHandler) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => handler(url, init))
  )
}

export { createTmpDir, jsonResponse, stubFetch }
export type { FetchHandler }
