// @vitest-environment node
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hashFile } from '../../../packages/skydock-scripts/src/lib/fs'
import {
  createShareLink,
  dsmCopyMove,
  dsmCreateFolder,
  dsmFileMd5,
  dsmListFolder,
  dsmLogin,
  dsmRenameFile,
  dsmValidateSession,
  ensureNasSession,
  ensureShareLink,
  listNasFiles,
  listShareLinks,
  loginWithSession,
  needsCode,
  removeShareLink,
  shareLinkFor,
  StorageUnreadable
} from '../../../packages/skydock-scripts/src/nas'
import { uploadFile } from '../../../packages/skydock-scripts/src/publish'
import { openStorageFile } from '../../../packages/skydock-scripts/src/storageFolder'
import { startFakeStorage } from './fake-storage'
import type { FakeStorage } from './fake-storage'

/* The storage the journey talks to is only worth anything if SkyDock's own client is satisfied by it:
   here the client's real functions are pointed at it, and what they did is read off its disk. */

const USER = 'admin'
const PASSWORD = 'skydock'
const SHOT = new Date('2026-09-20T10:02:50Z')

let storage: FakeStorage
let scratch: string
let host: string

const login = () => dsmLogin({ host, user: USER, password: PASSWORD })

/* a small file on this machine, dated as a clip is when it was shot */
const localFile = (name: string, content = 'some footage') => {
  const file = path.join(scratch, name)
  fs.writeFileSync(file, content)
  fs.utimesSync(file, SHOT, SHOT)
  return file
}

beforeAll(async () => {
  storage = await startFakeStorage()
  host = storage.url
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-fake-storage-test-'))
})

beforeEach(async () => {
  await storage.admin.reset()
})

afterAll(async () => {
  await storage.stop()
  fs.rmSync(scratch, { recursive: true, force: true })
})

describe('connecting to the storage', () => {
  it('logs in with the right password and is refused a wrong one with the storage’s own words', async () => {
    expect((await login()).sid).toBeTruthy()

    await expect(dsmLogin({ host, user: USER, password: 'nope' })).rejects.toThrow(
      /incorrect password/
    )
    await storage.admin.setPassword(USER, 'another')
    await expect(login()).rejects.toThrow(/incorrect password/)
    expect((await dsmLogin({ host, user: USER, password: 'another' })).sid).toBeTruthy()
  })

  it('asks a 2-step account for its code, accepts the right one once and trusts the machine after', async () => {
    await storage.admin.requireOtp('123456')

    const asked = await login().catch((e: unknown) => e)
    expect(needsCode(asked)).toBe(true)
    const wrong = await dsmLogin({ host, user: USER, password: PASSWORD, otp: '000000' }).catch(
      (e: unknown) => e
    )
    expect(needsCode(wrong)).toBe(true)

    const { deviceId } = await dsmLogin({ host, user: USER, password: PASSWORD, otp: '123456' })
    expect(deviceId).toBeTruthy()
    const again = await dsmLogin({ host, user: USER, password: PASSWORD, deviceId })
    expect(again.sid).toBeTruthy()
  })

  it('renews a session the storage forgot, from the password it kept', async () => {
    const configDir = fs.mkdtempSync(path.join(scratch, 'config-'))
    const first = await loginWithSession(
      { host, user: USER, password: PASSWORD },
      { login: dsmLogin, validate: dsmValidateSession },
      configDir
    )
    expect(await dsmValidateSession(host, first)).toBe(true)

    await storage.admin.sessionExpire()
    expect(await dsmValidateSession(host, first)).toBe(false)
    const renewed = await ensureNasSession(configDir)

    expect(renewed?.sessionId).not.toBe(first)
    expect(await dsmValidateSession(host, renewed?.sessionId ?? '')).toBe(true)
  })

  it('answers the storage’s own error when it cannot be reached, and works again when it can', async () => {
    await storage.admin.unreachable(true)
    await expect(login()).rejects.toThrow()
    await expect(listNasFiles(host, 'sid', '/club')).rejects.toBeInstanceOf(StorageUnreadable)

    await storage.admin.unreachable(false)
    expect((await login()).sid).toBeTruthy()
  })

  it('answers each call after the delay it was told to', async () => {
    await storage.admin.latency(300)
    const began = Date.now()
    await login()
    expect(Date.now() - began).toBeGreaterThanOrEqual(280)
  })
})

describe('looking at what the storage holds', () => {
  it('lists its shares and the folders in them, and makes a folder', async () => {
    const { sid } = await login()

    expect(await dsmListFolder(host, sid, '/')).toEqual([
      { path: '/club', name: 'club', is_dir: true }
    ])
    await dsmCreateFolder(host, sid, '/club', 'Yverdon')
    expect(fs.statSync(path.join(storage.root, 'club', 'Yverdon')).isDirectory()).toBe(true)
    expect((await dsmListFolder(host, sid, '/club')).map((f) => f.name)).toEqual(['Yverdon'])
    await expect(dsmCreateFolder(host, sid, '/club', 'Yverdon')).rejects.toThrow(/1100/)
  })

  it('keeps the date of a file that is uploaded, and lists it with its size and that date', async () => {
    const { sid } = await login()
    const clip = localFile('clip.mp4')

    await uploadFile(host, sid, '/club/Yverdon', clip)

    const stored = path.join(storage.root, 'club', 'Yverdon', 'clip.mp4')
    expect(fs.readFileSync(stored, 'utf8')).toBe('some footage')
    expect(fs.statSync(stored).mtimeMs).toBe(SHOT.getTime())
    expect(await listNasFiles(host, sid, '/club/Yverdon')).toEqual([
      {
        name: 'clip.mp4',
        path: '/club/Yverdon/clip.mp4',
        size: 'some footage'.length,
        mtime: SHOT.getTime() / 1000
      }
    ])
    expect(await listNasFiles(host, sid, '/club/Nowhere')).toEqual([])
  })

  it('refuses the upload of a file it was told to refuse, one try after another, and logs each', async () => {
    const { sid } = await login()
    await storage.admin.failUpload(/bad\.mp4$/, 1100)

    await expect(uploadFile(host, sid, '/club/Day', localFile('bad.mp4'))).rejects.toThrow(
      /DSM error 1100/
    )

    const uploads = (await storage.admin.calls()).filter((c) => c.api.endsWith('Upload'))
    expect(uploads.map((c) => c.params.filename)).toEqual(['bad.mp4', 'bad.mp4', 'bad.mp4'])
    expect(fs.existsSync(path.join(storage.root, 'club', 'Day', 'bad.mp4'))).toBe(false)
    expect(await storage.admin.peakUploads()).toBe(1)
  }, 15_000)

  it('hashes a file as it is on disk, and a changed file hashes differently', async () => {
    const { sid } = await login()
    const clip = localFile('clip.mp4', 'abcdef')
    await uploadFile(host, sid, '/club/Day', clip)

    expect(await dsmFileMd5(host, sid, '/club/Day/clip.mp4')).toBe(await hashFile(clip))
    expect(await dsmFileMd5(host, sid, '/club/Day/missing.mp4')).toBeNull()

    await storage.admin.corrupt('/club/Day/clip.mp4')
    const changed = path.join(storage.root, 'club', 'Day', 'clip.mp4')
    expect(fs.statSync(changed).size).toBe(6)
    expect(await dsmFileMd5(host, sid, '/club/Day/clip.mp4')).not.toBe(await hashFile(clip))
  })

  it('copies, moves and renames files on its own disk, and never writes over a name taken', async () => {
    const { sid } = await login()
    await uploadFile(host, sid, '/club/Day', localFile('clip.mp4'))
    const at = (...parts: string[]) => path.join(storage.root, 'club', ...parts)

    expect(
      await dsmCopyMove(host, sid, '/club/Day/clip.mp4', '/club/Copy', { keepSource: true })
    ).toBe(true)
    expect(fs.existsSync(at('Day', 'clip.mp4'))).toBe(true)
    expect(fs.readFileSync(at('Copy', 'clip.mp4'), 'utf8')).toBe('some footage')

    expect(await dsmRenameFile(host, sid, '/club/Copy/clip.mp4', 'renamed.mp4')).toBe(true)
    expect(fs.existsSync(at('Copy', 'renamed.mp4'))).toBe(true)
    expect(await dsmRenameFile(host, sid, '/club/Copy/gone.mp4', 'x.mp4')).toBe(false)

    expect(await dsmCopyMove(host, sid, '/club/Copy/renamed.mp4', '/club/Moved')).toBe(true)
    expect(fs.existsSync(at('Copy', 'renamed.mp4'))).toBe(false)
    expect(fs.existsSync(at('Moved', 'renamed.mp4'))).toBe(true)
  })

  it('sends a file’s bytes, the whole of it or the range asked for', async () => {
    const session = { hostname: host, username: USER, sessionId: (await login()).sid }
    await uploadFile(host, session.sessionId, '/club/Day', localFile('clip.mp4', '0123456789'))

    const whole = await openStorageFile(session, '/club/Day/clip.mp4')
    expect(whole.status).toBe(200)
    expect(await whole.text()).toBe('0123456789')
    const part = await openStorageFile(session, '/club/Day/clip.mp4', 'bytes=2-5')
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(await part.text()).toBe('2345')
    const tail = await openStorageFile(session, '/club/Day/clip.mp4', 'bytes=7-')
    expect(await tail.text()).toBe('789')
  })
})

describe('handing a file out by a link', () => {
  it('makes a link, lists it, reuses it, and takes it away without taking the file', async () => {
    const { sid } = await login()
    await uploadFile(host, sid, '/club/Day', localFile('clip.mp4'))

    const made = await createShareLink(host, sid, '/club/Day/clip.mp4')
    expect(made.startsWith(`${host}/sharing/`)).toBe(true)
    expect(await ensureShareLink(host, sid, '/club/Day/clip.mp4')).toBe(made)
    expect((await storage.admin.shareLinks()).map((l) => l.path)).toEqual(['/club/Day/clip.mp4'])
    expect(await (await fetch(made)).text()).toBe('some footage')

    const found = await shareLinkFor(host, sid, '/club/Day/clip.mp4')
    expect(found?.url).toBe(made)
    expect(await removeShareLink(host, sid, found?.id ?? '')).toBe(true)
    expect(await listShareLinks(host, sid)).toEqual([])
    expect(fs.existsSync(path.join(storage.root, 'club', 'Day', 'clip.mp4'))).toBe(true)
  })

  it('shows a revoked link as such, and gets a fresh one made', async () => {
    const { sid } = await login()
    await uploadFile(host, sid, '/club/Day', localFile('clip.mp4'))
    const first = await createShareLink(host, sid, '/club/Day/clip.mp4')
    const [link] = await storage.admin.shareLinks()

    await storage.admin.revokeLink(link?.id ?? '')

    expect(await shareLinkFor(host, sid, '/club/Day/clip.mp4')).toBeNull()
    expect((await fetch(first)).status).toBe(404)
    const second = await ensureShareLink(host, sid, '/club/Day/clip.mp4')
    expect(second).not.toBe(first)
    expect((await storage.admin.shareLinks()).map((l) => l.status)).toEqual(['invalid', 'valid'])
  })
})

describe('what the storage tells a test', () => {
  it('logs every call in order without a password, and starts afresh after a reset', async () => {
    const { sid } = await login()
    await listNasFiles(host, sid, '/club')

    const calls = await storage.admin.calls()
    expect(calls.map((c) => `${c.api}:${c.method}`)).toEqual([
      'SYNO.API.Auth:login',
      'SYNO.FileStation.List:list'
    ])
    expect(calls[1]?.params.folder_path).toBe('/club')
    expect(JSON.stringify(calls)).not.toContain(PASSWORD)

    await storage.admin.reset()
    expect(await storage.admin.calls()).toEqual([])
  })

  it('keeps a path that climbs out of a share inside its root, where there is nothing to hash', async () => {
    const { sid } = await login()
    expect(await dsmFileMd5(host, sid, '/club/../../etc/passwd')).toBeNull()
  })
})
