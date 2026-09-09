// @vitest-environment node
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { action } from '../../app/routes/api.nas'

const createTmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-api-nas-test-'))

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

const stubFetch = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => handler(url, init))
  )
}

describe('api/nas file persistence (truthful, no UI mock)', () => {
  let tmpDir: string
  let originalOutputDir: string | undefined

  beforeEach(() => {
    tmpDir = createTmpDir()
    originalOutputDir = process.env.SKYDOCK_OUTPUT_DIR
    process.env.SKYDOCK_OUTPUT_DIR = tmpDir
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    if (originalOutputDir === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
    else process.env.SKYDOCK_OUTPUT_DIR = originalOutputDir
    vi.unstubAllGlobals()
  })

  const loadSessionFile = () => {
    const p = path.join(tmpDir, '.status', 'nas.json')
    if (!fs.existsSync(p)) return null
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>
  }

  it('connect creates nas.json and preserves defaultFolder on reconnect', async () => {
    stubFetch((url) => {
      if (url.includes('method=login'))
        return jsonResponse({ success: true, data: { sid: 'sid-1' } })
      if (url.includes('method=list_share'))
        return jsonResponse({ success: true, data: { shares: [] } })
      return jsonResponse({ success: false })
    })

    const req1 = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'connect',
        host: 'https://nas.local:5001',
        user: 'admin',
        password: 'secret'
      })
    })
    const res1 = (await action({ request: req1 })) as unknown as Record<string, unknown>
    expect((res1 as { connected?: boolean }).connected).toBe(true)
    expect(loadSessionFile()).toMatchObject({
      hostname: 'https://nas.local:5001',
      username: 'admin',
      sessionId: 'sid-1'
    })

    const selectReq = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'select-folder', path: '/video' })
    })
    const selectRes = (await action({ request: selectReq })) as unknown as Record<string, unknown>
    expect((selectRes as { defaultFolder?: string }).defaultFolder).toBe('/video')
    expect(loadSessionFile()?.defaultFolder).toBe('/video')

    stubFetch((url) => {
      if (url.includes('method=list_share')) return jsonResponse({ success: false })
      if (url.includes('method=login'))
        return jsonResponse({ success: true, data: { sid: 'sid-2' } })
      return jsonResponse({ success: false })
    })
    const req2 = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'connect',
        host: 'https://nas.local:5001',
        user: 'admin',
        password: 'secret'
      })
    })
    const res2 = (await action({ request: req2 })) as unknown as Record<string, unknown>
    expect((res2 as { connected?: boolean }).connected).toBe(true)
    expect(loadSessionFile()?.defaultFolder).toBe('/video')
    expect(loadSessionFile()?.sessionId).toBe('sid-2')
  })

  it('list-folder returns real folders via list_share for root and list for subfolders', async () => {
    stubFetch((url) => {
      if (url.includes('method=login'))
        return jsonResponse({ success: true, data: { sid: 'real-sid-1' } })
      if (url.includes('method=list_share'))
        return jsonResponse({
          success: true,
          data: {
            shares: [
              { path: '/video', name: 'video' },
              { path: '/photo', name: 'photo' }
            ]
          }
        })
      if (url.includes('method=list')) {
        return jsonResponse({
          success: true,
          data: {
            files: [{ path: '/video/sub', name: 'sub', isdir: true }]
          }
        })
      }
      return jsonResponse({ success: false })
    })
    const connectReq = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'connect',
        host: 'https://nas.local:5001',
        user: 'admin',
        password: 'secret'
      })
    })
    await action({ request: connectReq })
    expect(loadSessionFile()).not.toBeNull()

    const listRootReq = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'list-folder', path: '/' })
    })
    const listRootRes = (await action({ request: listRootReq })) as unknown as Record<
      string,
      unknown
    >
    expect((listRootRes as { folders?: unknown[] }).folders).toBeDefined()
    expect((listRootRes as { folders?: unknown[] }).folders).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '/video' })])
    )
    expect(loadSessionFile()).not.toBeNull()
    expect(loadSessionFile()?.sessionId).toBe('real-sid-1')

    const listSubReq = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'list-folder', path: '/video' })
    })
    const listSubRes = (await action({ request: listSubReq })) as unknown as Record<string, unknown>
    expect((listSubRes as { folders?: unknown[] }).folders).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '/video/sub' })])
    )
  })

  it('list-folder with network failure returns session expired but does not delete nas.json', async () => {
    stubFetch((url) => {
      if (url.includes('method=login'))
        return jsonResponse({ success: true, data: { sid: 'real-sid-2' } })
      if (url.includes('method=list_share'))
        return jsonResponse({ success: true, data: { shares: [] } })
      return jsonResponse({ success: true })
    })
    const connectReq = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'connect',
        host: 'https://nas.local:5001',
        user: 'admin',
        password: 'secret'
      })
    })
    await action({ request: connectReq })
    expect(loadSessionFile()?.sessionId).toBe('real-sid-2')

    stubFetch(() => {
      throw new Error('network down')
    })
    const listReq = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'list-folder', path: '/' })
    })
    const listRes = (await action({ request: listReq })) as unknown as Record<string, unknown>
    expect((listRes as { globalErrors?: string[] }).globalErrors?.[0]).toMatch(/Session expired/)
    expect(loadSessionFile()).not.toBeNull()
  })

  it('status with network failure returns disconnected but does not delete file', async () => {
    stubFetch((url) => {
      if (url.includes('method=login'))
        return jsonResponse({ success: true, data: { sid: 'real-sid-3' } })
      if (url.includes('method=list_share'))
        return jsonResponse({ success: true, data: { shares: [] } })
      return jsonResponse({ success: true })
    })
    const connectReq = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'connect',
        host: 'https://nas.local:5001',
        user: 'admin',
        password: 'secret'
      })
    })
    await action({ request: connectReq })
    expect(loadSessionFile()).not.toBeNull()

    stubFetch(() => {
      throw new Error('network down')
    })
    const statusReq = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'status' })
    })
    const statusRes = (await action({ request: statusReq })) as unknown as Record<string, unknown>
    expect((statusRes as { connected?: boolean }).connected).toBe(false)
    expect(loadSessionFile()).not.toBeNull()
  })

  it('regression: valid real sid via list_share allows list-folder without session expired', async () => {
    stubFetch((url) => {
      if (url.includes('method=login'))
        return jsonResponse({ success: true, data: { sid: 'real-sid-123' } })
      if (url.includes('method=list_share'))
        return jsonResponse({ success: true, data: { shares: [{ path: '/home', name: 'home' }] } })
      if (url.includes('method=list') && url.includes('folder_path=%2Fhome'))
        return jsonResponse({
          success: true,
          data: { files: [{ path: '/home/tmp', name: 'tmp', isdir: true }] }
        })
      if (url.includes('method=list'))
        return jsonResponse({
          success: true,
          data: { files: [{ path: '/home', name: 'home', isdir: true }] }
        })
      return jsonResponse({ success: false })
    })
    const connectReq = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'connect',
        host: 'https://nas.local:5001',
        user: 'admin',
        password: 'secret'
      })
    })
    await action({ request: connectReq })
    expect(loadSessionFile()?.sessionId).toBe('real-sid-123')

    const listReq = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'list-folder', path: '/home' })
    })
    const listRes = (await action({ request: listReq })) as unknown as Record<string, unknown>
    expect((listRes as { folders?: unknown[] }).folders).toBeDefined()
    expect((listRes as { globalErrors?: string[] }).globalErrors).toBeUndefined()
    expect((listRes as { folders?: unknown[] }).folders).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '/home/tmp' })])
    )
    expect(loadSessionFile()).not.toBeNull()

    const invalidListReq = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'list-folder', path: '/invalid' })
    })
    stubFetch((url) => {
      if (url.includes('method=list_share'))
        return jsonResponse({ success: false, error: { code: 119 } })
      return jsonResponse({ success: false, error: { code: 119 } })
    })
    const invalidRes = (await action({ request: invalidListReq })) as unknown as Record<
      string,
      unknown
    >
    expect((invalidRes as { globalErrors?: string[] }).globalErrors?.[0]).toMatch(/Session expired/)
  })

  it('create-folder creates and returns updated folder list', async () => {
    stubFetch((url) => {
      if (url.includes('method=login'))
        return jsonResponse({ success: true, data: { sid: 'real-sid-create' } })
      if (url.includes('method=list_share'))
        return jsonResponse({
          success: true,
          data: { shares: [{ path: '/video', name: 'video' }] }
        })
      return jsonResponse({ success: true })
    })
    const connectReq = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'connect',
        host: 'https://nas.local:5001',
        user: 'admin',
        password: 'secret'
      })
    })
    await action({ request: connectReq })

    stubFetch((url) => {
      if (url.includes('method=list_share'))
        return jsonResponse({
          success: true,
          data: { shares: [{ path: '/video', name: 'video' }] }
        })
      if (url.includes('SYNO.FileStation.CreateFolder')) return jsonResponse({ success: true })
      if (url.includes('method=list')) {
        return jsonResponse({
          success: true,
          data: { files: [{ path: '/video/newFolder', name: 'newFolder', isdir: true }] }
        })
      }
      return jsonResponse({ success: true })
    })

    const createReq = new Request('http://localhost/api/nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'create-folder', path: '/video', name: 'newFolder' })
    })
    const createRes = (await action({ request: createReq })) as unknown as Record<string, unknown>
    expect((createRes as { folders?: unknown[] }).folders).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '/video/newFolder' })])
    )
  })
})
