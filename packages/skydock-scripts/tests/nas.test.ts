// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import { createTmpDir, jsonResponse, stubFetch } from './fixtures'
import {
  decryptPasswordFromStorage,
  ensureNasSession,
  loadNasSession,
  loginWithSession,
  refreshStoredSession,
  saveNasSession,
  updateNasFolder
} from '../src/nas'

describe('the storage session', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = createTmpDir('skydock-nas-test-')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  describe('the folders', () => {
    it('remembers the default folder', () => {
      saveNasSession(
        { hostname: 'https://nas.local', username: 'user', sessionId: 'sid123' },
        tmpDir
      )
      updateNasFolder('default', '/SkyDock/Photos', tmpDir)
      const session = loadNasSession(tmpDir)
      expect(session?.defaultFolder).toBe('/SkyDock/Photos')
    })

    it('keeps the backup folder apart from the upload folder', () => {
      saveNasSession(
        { hostname: 'https://nas.local', username: 'user', sessionId: 'sid123' },
        tmpDir
      )
      updateNasFolder('default', '/SkyDock/Tandems', tmpDir)
      updateNasFolder('backup', '/SkyDock/Rushes', tmpDir)
      const session = loadNasSession(tmpDir)
      expect(session?.defaultFolder).toBe('/SkyDock/Tandems')
      expect(session?.backupFolder).toBe('/SkyDock/Rushes')
    })
  })
})

describe('logging in', () => {
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

  it('reuses the session it kept while the storage still takes it', async () => {
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

  it('logs in again when the kept session is refused', async () => {
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

  it('logs in when nothing was kept', async () => {
    mockDsm.login.mockResolvedValue('fresh-sid')
    const result = await loginWithSession(
      { host: 'https://nas.local', user: 'u', password: 'p' },
      mockDsm,
      tmpDir
    )
    expect(result).toBe('fresh-sid')
  })

  it('forgets the session when the storage’s address changes', async () => {
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

describe('the session between uploads', () => {
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

  it('reuses a session the storage still accepts', async () => {
    saveNasSession({ hostname: 'https://nas.local', username: 'u', sessionId: 'live' }, tmpDir)
    stubFetch(() => jsonResponse({ success: true, data: { shares: [] } }))
    const session = await ensureNasSession(tmpDir)
    expect(session?.sessionId).toBe('live')
  })

  it('is gone once the storage refuses it and nothing can renew it', async () => {
    saveNasSession({ hostname: 'https://nas.local', username: 'u', sessionId: 'dead' }, tmpDir)
    stubFetch(() => jsonResponse({ success: false, error: { code: 119 } }))
    await expect(ensureNasSession(tmpDir)).resolves.toBeNull()
  })
})
