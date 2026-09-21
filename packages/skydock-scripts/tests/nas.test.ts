// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createTmpDir, jsonResponse, stubFetch } from './fixtures'
import {
  dsmLogin,
  ensureNasSession,
  loadNasSession,
  loginWithSession,
  needsCode,
  refreshStoredSession,
  saveNasSession,
  updateNasFolder
} from '../src/nas'
import type { DsmConfig } from '../src/nas'

/* The storage session (RULES, Network storage): SkyDock logs in once and keeps the session; when
   the storage stops taking it, the session renews itself from what was kept, without asking; and
   the upload folder and the backup folder are two different folders. */

let tmpDir: string

const dsm = {
  login: vi.fn(async (_config: DsmConfig): Promise<{ sid: string; deviceId?: string }> => ({
    sid: 'new-sid'
  })),
  validate: vi.fn(async () => true)
}
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
  /* the one folder the session keeps: every place of work keeps its own with the place */
  it('remembers the backup folder the originals are kept in', () => {
    saveNasSession({ hostname: 'https://nas.local', username: 'u', sessionId: 'sid' }, tmpDir)
    updateNasFolder('/SkyDock/Rushes', tmpDir)
    expect(loadNasSession(tmpDir)?.backupFolder).toBe('/SkyDock/Rushes')
  })

  it('is used again while the storage still takes it', async () => {
    saveNasSession({ hostname: 'https://nas.local', username: 'u', sessionId: 'kept' }, tmpDir)
    dsm.validate.mockResolvedValue(true)
    await expect(loginWithSession(club, dsm, tmpDir)).resolves.toBe('kept')
    expect(dsm.login).not.toHaveBeenCalled()
  })

  it('renews itself when the storage stops taking it, without asking for the password', async () => {
    dsm.login.mockResolvedValue({ sid: 'first-sid' })
    await loginWithSession(club, dsm, tmpDir)
    const stored = loadNasSession(tmpDir)!

    dsm.validate.mockResolvedValue(false)
    dsm.login.mockResolvedValue({ sid: 'renewed-sid' })
    await expect(refreshStoredSession(stored, tmpDir, dsm.login)).resolves.toBe('renewed-sid')
    expect(loadNasSession(tmpDir)?.sessionId).toBe('renewed-sid')
  })

  it('is forgotten when the storage’s address changes', async () => {
    saveNasSession({ hostname: 'https://old-nas.local', username: 'u', sessionId: 'old' }, tmpDir)
    dsm.login.mockResolvedValue({ sid: 'new-sid' })
    await expect(
      loginWithSession({ ...club, host: 'https://new-nas.local' }, dsm, tmpDir)
    ).resolves.toBe('new-sid')
    expect(loadNasSession(tmpDir)?.hostname).toBe('https://new-nas.local')
  })
})

/* An account with 2-step verification (RULES, Network storage): the code is asked for at the first
   login, the storage is asked to trust this machine, and from then on the session renews itself
   without a code, as it does for any other account. */
describe('an account with 2-step verification', () => {
  /* a storage that wants a code unless this machine is one it trusts */
  const guarded = (heard: URLSearchParams[]) =>
    stubFetch((url) => {
      const params = new URL(url).searchParams
      heard.push(params)
      if (params.get('device_id') === 'trusted' || params.get('otp_code') === '123456')
        return jsonResponse({
          success: true,
          data: { sid: 'sid-2fa', ...(params.get('otp_code') ? { did: 'trusted' } : {}) }
        })
      return jsonResponse({
        success: false,
        error: { code: params.get('otp_code') ? 404 : 403, errors: { types: [{ type: 'otp' }] } }
      })
    })

  it('is told apart from a wrong password, so the code can be asked for', async () => {
    guarded([])
    const refused = await dsmLogin(club).catch((e: unknown) => e)
    expect(needsCode(refused)).toBe(true)
  })

  it('logs in with the code and has this machine trusted from then on', async () => {
    const heard: URLSearchParams[] = []
    guarded(heard)
    await expect(dsmLogin({ ...club, otp: '123456' })).resolves.toEqual({
      sid: 'sid-2fa',
      deviceId: 'trusted'
    })
    expect(heard.at(-1)?.get('enable_device_token')).toBe('yes')
  })

  it('keeps the trust, and renews the session later with no code', async () => {
    const heard: URLSearchParams[] = []
    guarded(heard)
    await loginWithSession(
      { ...club, otp: '123456' },
      { login: dsmLogin, validate: async () => false },
      tmpDir
    )
    expect(loadNasSession(tmpDir)?.deviceId).toBe('trusted')

    await expect(refreshStoredSession(loadNasSession(tmpDir)!, tmpDir)).resolves.toBe('sid-2fa')
    expect(heard.at(-1)?.get('otp_code')).toBeNull()
    expect(heard.at(-1)?.get('device_id')).toBe('trusted')
  })

  /* the first try has no code and is refused; the folders chosen before must survive it */
  it('loses none of the chosen folders on the way', async () => {
    saveNasSession(
      {
        ...{ hostname: club.host, username: club.user, sessionId: 'old' },
        backupFolder: '/Backup'
      },
      tmpDir
    )
    guarded([])
    const noValid = { login: dsmLogin, validate: async () => false }
    await expect(loginWithSession(club, noValid, tmpDir)).rejects.toSatisfy(needsCode)
    await loginWithSession({ ...club, otp: '123456' }, noValid, tmpDir)
    expect(loadNasSession(tmpDir)?.backupFolder).toBe('/Backup')
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

/* The connection is the app's own setting, kept in the config folder apart from the work; one kept
   with the work by an older version is taken over, so nobody has to connect again. */
describe('where the connection is kept', () => {
  const env = { output: process.env.SKYDOCK_OUTPUT_DIR, config: process.env.SKYDOCK_CONFIG_DIR }
  const restore = (key: 'SKYDOCK_OUTPUT_DIR' | 'SKYDOCK_CONFIG_DIR', value: string | undefined) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  let output: string
  let config: string

  beforeEach(() => {
    output = path.join(tmpDir, 'output')
    config = path.join(tmpDir, 'config')
    process.env.SKYDOCK_OUTPUT_DIR = output
    process.env.SKYDOCK_CONFIG_DIR = config
  })

  afterEach(() => {
    restore('SKYDOCK_OUTPUT_DIR', env.output)
    restore('SKYDOCK_CONFIG_DIR', env.config)
  })

  it('is kept in the config folder, not with the work', () => {
    saveNasSession({ hostname: 'https://nas.local', username: 'u', sessionId: 'sid' })
    expect(fs.existsSync(path.join(config, 'nas.json'))).toBe(true)
    expect(fs.existsSync(output)).toBe(false)
  })

  it('takes over a connection kept with the work, without connecting again', () => {
    const legacy = path.join(output, '.status', 'nas.json')
    fs.mkdirSync(path.dirname(legacy), { recursive: true })
    fs.writeFileSync(
      legacy,
      JSON.stringify({ hostname: 'https://nas.local', username: 'u', sessionId: 'old' })
    )

    expect(loadNasSession()?.sessionId).toBe('old')
    expect(fs.existsSync(path.join(config, 'nas.json'))).toBe(true)
    expect(fs.existsSync(legacy)).toBe(false)
  })
})
