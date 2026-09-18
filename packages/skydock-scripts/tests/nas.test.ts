// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import { createTmpDir, jsonResponse, stubFetch } from './fixtures'
import {
  ensureNasSession,
  loadNasSession,
  loginWithSession,
  refreshStoredSession,
  saveNasSession,
  updateNasFolder
} from '../src/nas'

/* The storage session (RULES, Network storage): SkyDock logs in once and keeps the session; when
   the storage stops taking it, the session renews itself from what was kept, without asking; and
   the upload folder and the backup folder are two different folders. */

let tmpDir: string

const dsm = { login: vi.fn(async () => 'new-sid'), validate: vi.fn(async () => true) }
const club = { host: 'https://nas.local', user: 'u', password: 'p' }

beforeEach(() => {
  tmpDir = createTmpDir('skydock-nas-test-')
  dsm.login.mockClear()
  dsm.validate.mockClear()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

describe('the storage session', () => {
  it('keeps the upload folder and the backup folder apart', () => {
    saveNasSession({ hostname: 'https://nas.local', username: 'u', sessionId: 'sid' }, tmpDir)
    updateNasFolder('default', '/SkyDock/Tandems', tmpDir)
    updateNasFolder('backup', '/SkyDock/Rushes', tmpDir)
    const session = loadNasSession(tmpDir)
    expect(session?.defaultFolder).toBe('/SkyDock/Tandems')
    expect(session?.backupFolder).toBe('/SkyDock/Rushes')
  })

  it('is used again while the storage still takes it', async () => {
    saveNasSession({ hostname: 'https://nas.local', username: 'u', sessionId: 'kept' }, tmpDir)
    dsm.validate.mockResolvedValue(true)
    await expect(loginWithSession(club, dsm, tmpDir)).resolves.toBe('kept')
    expect(dsm.login).not.toHaveBeenCalled()
  })

  it('renews itself when the storage stops taking it, without asking for the password', async () => {
    dsm.login.mockResolvedValue('first-sid')
    await loginWithSession(club, dsm, tmpDir)
    const stored = loadNasSession(tmpDir)!

    dsm.validate.mockResolvedValue(false)
    dsm.login.mockResolvedValue('renewed-sid')
    await expect(refreshStoredSession(stored, tmpDir, dsm.login)).resolves.toBe('renewed-sid')
    expect(loadNasSession(tmpDir)?.sessionId).toBe('renewed-sid')
  })

  it('is forgotten when the storage’s address changes', async () => {
    saveNasSession({ hostname: 'https://old-nas.local', username: 'u', sessionId: 'old' }, tmpDir)
    dsm.login.mockResolvedValue('new-sid')
    await expect(
      loginWithSession({ ...club, host: 'https://new-nas.local' }, dsm, tmpDir)
    ).resolves.toBe('new-sid')
    expect(loadNasSession(tmpDir)?.hostname).toBe('https://new-nas.local')
  })
})

describe('the session between uploads', () => {
  it('is the one the storage still accepts', async () => {
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
