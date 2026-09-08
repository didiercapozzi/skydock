// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { clearNasSession, loadNasSession, saveNasSession, updateDefaultFolder } from '../src/nas'
import { loginWithSession } from '../src/publish'

const createTmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-nas-test-'))

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

const stubFetch = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => handler(url, init))
  )
}

describe('nas session storage', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = createTmpDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  describe('loadNasSession', () => {
    it('returns null when no file exists', () => {
      expect(loadNasSession(tmpDir)).toBeNull()
    })

    it('returns null for invalid JSON', () => {
      const statusDir = path.join(tmpDir, '.status')
      fs.mkdirSync(statusDir, { recursive: true })
      fs.writeFileSync(path.join(statusDir, 'nas.json'), 'not json')
      expect(loadNasSession(tmpDir)).toBeNull()
    })

    it('loads valid session', () => {
      const statusDir = path.join(tmpDir, '.status')
      fs.mkdirSync(statusDir, { recursive: true })
      fs.writeFileSync(
        path.join(statusDir, 'nas.json'),
        JSON.stringify({ hostname: 'https://nas.local', username: 'user', sessionId: 'sid123' })
      )
      const session = loadNasSession(tmpDir)
      expect(session).toEqual({
        hostname: 'https://nas.local',
        username: 'user',
        sessionId: 'sid123'
      })
    })
  })

  describe('saveNasSession', () => {
    it('creates file with session data', () => {
      saveNasSession(
        { hostname: 'https://nas.local', username: 'user', sessionId: 'sid123' },
        tmpDir
      )
      const session = loadNasSession(tmpDir)
      expect(session).toEqual({
        hostname: 'https://nas.local',
        username: 'user',
        sessionId: 'sid123'
      })
    })

    it('includes defaultFolder when provided', () => {
      saveNasSession(
        {
          hostname: 'https://nas.local',
          username: 'user',
          sessionId: 'sid123',
          defaultFolder: '/SkyDock'
        },
        tmpDir
      )
      const session = loadNasSession(tmpDir)
      expect(session?.defaultFolder).toBe('/SkyDock')
    })
  })

  describe('clearNasSession', () => {
    it('removes the nas.json file', () => {
      saveNasSession(
        { hostname: 'https://nas.local', username: 'user', sessionId: 'sid123' },
        tmpDir
      )
      expect(loadNasSession(tmpDir)).not.toBeNull()
      clearNasSession(tmpDir)
      expect(loadNasSession(tmpDir)).toBeNull()
    })
  })

  describe('updateDefaultFolder', () => {
    it('updates defaultFolder in existing session', () => {
      saveNasSession(
        { hostname: 'https://nas.local', username: 'user', sessionId: 'sid123' },
        tmpDir
      )
      updateDefaultFolder('/SkyDock/Photos', tmpDir)
      const session = loadNasSession(tmpDir)
      expect(session?.defaultFolder).toBe('/SkyDock/Photos')
    })
  })
})

describe('loginWithSession', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = createTmpDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  it('returns stored session when valid', async () => {
    saveNasSession(
      { hostname: 'https://nas.local', username: 'u', sessionId: 'stored-sid' },
      tmpDir
    )
    stubFetch((url) => {
      if (url.includes('method=check')) return jsonResponse({ success: true })
      return jsonResponse({ success: false })
    })
    const result = await loginWithSession(
      { host: 'https://nas.local', user: 'u', password: 'p' },
      tmpDir
    )
    expect(result.sid).toBe('stored-sid')
    expect(result.isNew).toBe(false)
  })

  it('logs in fresh when stored session is invalid', async () => {
    saveNasSession({ hostname: 'https://nas.local', username: 'u', sessionId: 'old-sid' }, tmpDir)
    stubFetch((url) => {
      if (url.includes('method=check')) return jsonResponse({ success: false })
      if (url.includes('method=login'))
        return jsonResponse({ success: true, data: { sid: 'new-sid' } })
      return jsonResponse({ success: false })
    })
    const result = await loginWithSession(
      { host: 'https://nas.local', user: 'u', password: 'p' },
      tmpDir
    )
    expect(result.sid).toBe('new-sid')
    expect(result.isNew).toBe(true)
    expect(loadNasSession(tmpDir)?.sessionId).toBe('new-sid')
  })

  it('logs in fresh when no stored session exists', async () => {
    stubFetch((url) => {
      if (url.includes('method=login'))
        return jsonResponse({ success: true, data: { sid: 'fresh-sid' } })
      return jsonResponse({ success: false })
    })
    const result = await loginWithSession(
      { host: 'https://nas.local', user: 'u', password: 'p' },
      tmpDir
    )
    expect(result.sid).toBe('fresh-sid')
    expect(result.isNew).toBe(true)
  })

  it('clears stored session when hostname changes', async () => {
    saveNasSession(
      { hostname: 'https://old-nas.local', username: 'u', sessionId: 'old-sid' },
      tmpDir
    )
    stubFetch((url) => {
      if (url.includes('method=login'))
        return jsonResponse({ success: true, data: { sid: 'new-sid' } })
      return jsonResponse({ success: false })
    })
    const result = await loginWithSession(
      { host: 'https://new-nas.local', user: 'u', password: 'p' },
      tmpDir
    )
    expect(result.sid).toBe('new-sid')
    expect(result.isNew).toBe(true)
    const session = loadNasSession(tmpDir)
    expect(session?.hostname).toBe('https://new-nas.local')
  })
})
