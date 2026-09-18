// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import { dsmLogin, saveNasSession } from '../src/nas'
import { publishJump } from '../src/publish'
import {
  createTmpDir,
  jsonResponse,
  loginFailure,
  loginSuccess,
  makeTmpTree,
  seen,
  stubFetch
} from './fixtures'

/* Sending a folder to the storage (RULES, Network storage): every file named goes up, and only
   those; a share link comes back for it, or the upload has failed; the session that did it is kept
   for the next one; and how far it has got is shown while it runs. The storage here is a local
   server that takes the uploads, so what was actually sent can be looked at. */

beforeEach(() => {
  seen.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
})

type ReceivedUpload = { body: Buffer }

const startUploadServer = (respond: () => { success: boolean }) => {
  const uploads: ReceivedUpload[] = []
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: string | Buffer) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    )
    req.on('end', () => {
      uploads.push({ body: Buffer.concat(chunks) })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(respond()))
    })
  })
  return new Promise<{ url: string; uploads: ReceivedUpload[]; close: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        const port = typeof address === 'object' && address ? address.port : 0
        resolve({
          url: `http://127.0.0.1:${port}`,
          uploads,
          close: () => new Promise<void>((done) => server.close(() => done()))
        })
      })
    }
  )
}

/* the storage answering everything but the uploads themselves: login, a share link when asked */
const storageAnswers = (link: string | null = '/sharing/abc') =>
  stubFetch((url) => {
    if (url.includes('method=login')) return loginSuccess('sid')
    if (url.includes('SYNO.FileStation.Sharing'))
      return jsonResponse({ success: true, data: link ? { links: [{ url: link }] } : {} })
    return jsonResponse({ success: true })
  })

const sentNames = (uploads: ReceivedUpload[]) =>
  uploads.map((u) => /filename="([^"]+)"/.exec(u.body.toString('latin1'))?.[1]).sort()

const sentPath = (upload: ReceivedUpload) =>
  upload.body.toString('utf8').match(/name="path"\r\n\r\n([^\r]+)/)?.[1]

describe('logging in to the storage', () => {
  it('fails when the storage refuses the login', async () => {
    stubFetch(() => loginFailure())
    await expect(
      dsmLogin({ host: 'https://nas.local:5001', user: 'u', password: 'p' })
    ).rejects.toThrow(/DSM login failed/)
  })

  it('fails when the storage cannot be reached', async () => {
    stubFetch(() => {
      throw new Error('network down')
    })
    await expect(
      dsmLogin({ host: 'https://nas.local:5001', user: 'u', password: 'p' })
    ).rejects.toThrow()
  })
})

describe('uploading a folder', () => {
  let dir: string
  let out: string
  let server: Awaited<ReturnType<typeof startUploadServer>>
  let answer = () => ({ success: true })

  beforeEach(async () => {
    dir = makeTmpTree()
    out = createTmpDir('skydock-publish-nas-')
    answer = () => ({ success: true })
    server = await startUploadServer(() => answer())
  })

  afterEach(async () => {
    await server.close()
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(out, { recursive: true, force: true })
  })

  const publish = (extra: Partial<Parameters<typeof publishJump>[0]> = {}) =>
    publishJump({
      host: server.url,
      user: 'u',
      password: 'p',
      localDir: dir,
      remoteDir: '/SkyDock/jump',
      outputDir: out,
      ...extra
    })

  it('sends every file, comes back with a share link and keeps the session', async () => {
    storageAnswers()
    const result = await publish()
    expect(result).toMatchObject({ shareUrl: `${server.url}/sharing/abc`, uploaded: 2, skipped: 0 })
    expect(sentNames(server.uploads)).toEqual(['a.mp4', 'b.jpg'])
    expect(seen.some((c) => c.url.includes('method=logout'))).toBe(false)
  })

  /* a dropzone's files sit directly in its folder: no folder per jump */
  it('puts a file at the root of the folder in the folder itself', async () => {
    fs.rmSync(dir, { recursive: true, force: true })
    dir = createTmpDir('skydock-publish-flat-')
    fs.writeFileSync(path.join(dir, 'yverdon_20260829_011623.mp4'), Buffer.from('flat'))
    storageAnswers()
    await publish({ remoteDir: '/SkyDock/Yverdon' })
    expect(server.uploads).toHaveLength(1)
    expect(sentPath(server.uploads[0]!)).toBe('/SkyDock/Yverdon')
  })

  /* Processing stamped each copy with when it was shot; the storage is told that date, or it would
     date every file by the day it was sent, which is what anyone browsing it sorts by. */
  it('sends each file with its own date, not the day it went up', async () => {
    fs.rmSync(dir, { recursive: true, force: true })
    dir = createTmpDir('skydock-publish-dated-')
    const target = path.join(dir, 'yverdon_20260913_013417.mp4')
    fs.writeFileSync(target, Buffer.from('dated'))
    const shot = new Date(2026, 8, 13, 1, 34, 17)
    fs.utimesSync(target, shot, shot)
    storageAnswers()

    await publish({ remoteDir: '/SkyDock/Yverdon' })

    const said = server.uploads[0]!.body.toString('utf8').match(/name="mtime"\r\n\r\n(\d+)/)?.[1]
    expect(Number(said)).toBe(shot.getTime())
  })

  it('fails when a file cannot be sent, and keeps the session', async () => {
    answer = () => ({ success: false })
    storageAnswers()
    await expect(publish()).rejects.toThrow('Upload failed')
    expect(seen.some((c) => c.url.includes('method=logout'))).toBe(false)
  })

  it('fails when no share link comes back', async () => {
    storageAnswers(null)
    await expect(publish()).rejects.toThrow('no link')
  })

  it('says how far it has got while it runs, and never goes backwards', async () => {
    storageAnswers()
    const progress: { filename: string; bytesUploaded: number; totalBytes: number }[] = []
    await publishJump(
      {
        host: server.url,
        user: 'u',
        password: 'p',
        localDir: dir,
        remoteDir: '/SkyDock/jump',
        outputDir: out
      },
      { onProgress: (p) => progress.push({ ...p }) }
    )
    const finished = progress.filter((p) => p.bytesUploaded === p.totalBytes && p.totalBytes > 0)
    expect(new Set(finished.map((p) => p.filename)).size).toBe(2)
    for (const [i, p] of progress.entries()) {
      expect(p.bytesUploaded).toBeLessThanOrEqual(p.totalBytes)
      const before = progress[i - 1]
      if (before && before.filename === p.filename)
        expect(p.bytesUploaded).toBeGreaterThanOrEqual(before.bytesUploaded)
    }
  })

  it('uses the session it kept rather than logging in again', async () => {
    saveNasSession({ hostname: server.url, username: 'u', sessionId: 'reused-sid' }, out)
    stubFetch((url) => {
      if (url.includes('method=list_share'))
        return jsonResponse({ success: true, data: { shares: [] } })
      if (url.includes('SYNO.FileStation.Sharing'))
        return jsonResponse({ success: true, data: { links: [{ url: '/sharing/kept' }] } })
      throw new Error(`unexpected call ${url}`)
    })
    const result = await publish()
    expect(result.shareUrl).toContain('/sharing/kept')
    expect(seen.some((c) => c.url.includes('method=login'))).toBe(false)
  })

  /* A tandem's folder holds the working trees, the project and the rushes as well as the two
     things the passenger gets, so what travels is named rather than walked. */
  it('sends only the files it was given, although the folder holds more', async () => {
    fs.writeFileSync(path.join(dir, 'film.mp4'), Buffer.from('film'))
    fs.writeFileSync(path.join(dir, 'rushes.zip'), Buffer.from('rushes'))
    storageAnswers('/sharing/one')
    const result = await publish({
      remoteDir: '/SkyDock/Luc Favre',
      files: [path.join(dir, 'film.mp4')]
    })
    expect(result.uploaded).toBe(1)
    expect(sentNames(server.uploads)).toEqual(['film.mp4'])
  })

  /* nobody is handed a link to the backup folder */
  it('asks for no share link when told not to', async () => {
    storageAnswers()
    const result = await publish({ remoteDir: '/Backup', share: false })
    expect(result.shareUrl).toBeNull()
    expect(seen.some((c) => c.url.includes('SYNO.FileStation.Sharing'))).toBe(false)
  })
})
