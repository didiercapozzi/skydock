// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createTmpDir, jsonResponse, stubFetch } from './fixtures'
import {
  clearNasSession,
  decryptPasswordFromStorage,
  ensureNasSession,
  loadNasSession,
  loginWithSession,
  refreshStoredSession,
  saveNasSession,
  updateDefaultFolder
} from '../src/nas'

describe('nas session storage', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = createTmpDir('skydock-nas-test-')
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

  const mockDsm = {
    login: vi.fn(async () => 'new-sid'),
    validate: vi.fn(async () => true)
  }

  beforeEach(() => {
    tmpDir = createTmpDir('skydock-nas-test-')
    mockDsm.login.mockClear()
    mockDsm.validate.mockClear()
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
    mockDsm.validate.mockResolvedValue(true)
    const result = await loginWithSession(
      { host: 'https://nas.local', user: 'u', password: 'p' },
      mockDsm,
      tmpDir
    )
    expect(result).toBe('stored-sid')
    expect(mockDsm.login).not.toHaveBeenCalled()
  })

  it('logs in fresh when stored session is invalid', async () => {
    saveNasSession({ hostname: 'https://nas.local', username: 'u', sessionId: 'old-sid' }, tmpDir)
    mockDsm.validate.mockResolvedValue(false)
    mockDsm.login.mockResolvedValue('new-sid')
    const result = await loginWithSession(
      { host: 'https://nas.local', user: 'u', password: 'p' },
      mockDsm,
      tmpDir
    )
    expect(result).toBe('new-sid')
    expect(loadNasSession(tmpDir)?.sessionId).toBe('new-sid')
  })

  it('logs in fresh when no stored session exists', async () => {
    mockDsm.login.mockResolvedValue('fresh-sid')
    const result = await loginWithSession(
      { host: 'https://nas.local', user: 'u', password: 'p' },
      mockDsm,
      tmpDir
    )
    expect(result).toBe('fresh-sid')
  })

  it('clears stored session when hostname changes', async () => {
    saveNasSession(
      { hostname: 'https://old-nas.local', username: 'u', sessionId: 'old-sid' },
      tmpDir
    )
    mockDsm.login.mockResolvedValue('new-sid')
    const result = await loginWithSession(
      { host: 'https://new-nas.local', user: 'u', password: 'p' },
      mockDsm,
      tmpDir
    )
    expect(result).toBe('new-sid')
    const session = loadNasSession(tmpDir)
    expect(session?.hostname).toBe('https://new-nas.local')
  })

  /* the whole point of storing a password: an expired session must come back on its own */
  it('stores a locally decryptable password and refreshes an expired session without asking', async () => {
    mockDsm.login.mockResolvedValue('first-sid')
    await loginWithSession({ host: 'https://nas.local', user: 'u', password: 'p' }, mockDsm, tmpDir)
    const stored = loadNasSession(tmpDir)
    expect(stored?.encPasswd?.startsWith('local:')).toBe(true)
    expect(decryptPasswordFromStorage('https://nas.local', 'u', stored!.encPasswd!)).toBe('p')

    mockDsm.validate.mockResolvedValue(false)
    mockDsm.login.mockResolvedValue('refreshed-sid')
    const sid = await refreshStoredSession(stored!, tmpDir, mockDsm.login)
    expect(sid).toBe('refreshed-sid')
    expect(loadNasSession(tmpDir)?.sessionId).toBe('refreshed-sid')
  })
})

describe('ensureNasSession', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = createTmpDir('skydock-nas-gate-')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  it('returns null when there is no session at all', async () => {
    await expect(ensureNasSession(tmpDir)).resolves.toBeNull()
  })

  it('reuses a session DSM still accepts', async () => {
    saveNasSession({ hostname: 'https://nas.local', username: 'u', sessionId: 'live' }, tmpDir)
    stubFetch(() => jsonResponse({ success: true, data: { shares: [] } }))
    const session = await ensureNasSession(tmpDir)
    expect(session?.sessionId).toBe('live')
  })

  it('refuses a session DSM rejects when nothing can refresh it', async () => {
    saveNasSession({ hostname: 'https://nas.local', username: 'u', sessionId: 'dead' }, tmpDir)
    stubFetch(() => jsonResponse({ success: false, error: { code: 119 } }))
    await expect(ensureNasSession(tmpDir)).resolves.toBeNull()
  })
})
