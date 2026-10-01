// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as http from 'node:http'
import { createHash } from 'node:crypto'
import * as path from 'node:path'
import { dsmLogin, saveNasSession } from '../src/nas'
import { binFor, publishJump } from '../src/publish'
import {
  createTmpDir,
  jsonResponse,
  loginFailure,
  loginSuccess,
  makeTmpTree,
  nasStubs,
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

/* A folder listed as DSM lists one: what it holds, by name and size, and nothing where nothing is
   held. `held` is the storage's folders by their path. */
const listing = (url: string, held: Record<string, { name: string; size: number }[]> = {}) => {
  const folder = new URL(url, 'http://x').searchParams.get('folder_path') ?? ''
  const files = (held[folder] ?? []).map((f) => ({
    name: f.name,
    path: `${folder}/${f.name}`,
    isdir: false,
    additional: { size: f.size }
  }))
  return jsonResponse({ success: true, data: { files, total: files.length, offset: 0 } })
}

/* the storage answering everything but the uploads themselves: login, a share link when asked, and
   what its folders hold */
const storageAnswers = (
  link: string | null = '/sharing/abc',
  held: Record<string, { name: string; size: number }[]> = {}
) =>
  stubFetch((url) => {
    if (url.includes('method=login')) return loginSuccess('sid')
    if (url.includes('SYNO.FileStation.Sharing'))
      return jsonResponse({ success: true, data: link ? { links: [{ url: link }] } : {} })
    if (url.includes('SYNO.FileStation.List')) return listing(url, held)
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

  const publish = (
    extra: Partial<Parameters<typeof publishJump>[0]> = {},
    handlers?: Parameters<typeof publishJump>[1]
  ) =>
    publishJump(
      {
        host: server.url,
        user: 'u',
        password: 'p',
        localDir: dir,
        remoteDir: '/SkyDock/jump',
        configDir: out,
        ...extra
      },
      handlers
    )

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
        configDir: out
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
      if (url.includes('SYNO.FileStation.List')) return listing(url)
      throw new Error(`unexpected call ${url}`)
    })
    const result = await publish()
    expect(result.shareUrl).toContain('/sharing/kept')
    expect(seen.some((c) => c.url.includes('method=login'))).toBe(false)
  })

  /* A montage's folder holds the working trees, the project and the rushes as well as the two
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

  /* Nothing on the storage is written over, or moved (RULES, Principles). A file already there under
     the name about to be sent, holding other bytes — a clip prepared again after its trim was put
     right, a film rendered again — stops the upload before a byte is sent: a person renames or
     deletes it on the storage, and the files in the way are named. */
  describe('a file already there under the same name', () => {
    const video = () => path.join(dir, 'videos', 'a.mp4')
    const REMOTE = '/SkyDock/jump/videos/a.mp4'

    const storageHolding = (size: number) => {
      const moved: string[] = []
      const stub = nasStubs({
        files: { '/SkyDock/jump/videos': [{ name: 'a.mp4', size }] },
        md5: { [REMOTE]: createHash('md5').update('video').digest('hex') }
      })
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (/CopyMove|CreateFolder/.test(url)) moved.push(url)
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/abc' }] } })
        return stub(url) ?? jsonResponse({ success: true })
      })
      return moved
    }

    it('stops the upload before anything is sent, and names it', async () => {
      const touched = storageHolding(99)
      const plans: { taken: { name: string; to: string }[] }[] = []

      await expect(
        publish({ files: [video()] }, { onPlan: (plan) => plans.push(plan) })
      ).rejects.toThrow(/a\.mp4 is already on the storage/)

      expect(server.uploads).toEqual([])
      expect(touched).toEqual([])
      expect(plans[0]?.taken).toMatchObject([{ name: 'a.mp4', to: '/SkyDock/jump/videos' }])
    })

    it('is neither moved nor sent when it holds the same bytes', async () => {
      const moved = storageHolding(5)

      const result = await publish({ files: [video()] })

      expect(moved).toEqual([])
      expect(server.uploads).toEqual([])
      expect(result).toMatchObject({ uploaded: 0, skipped: 1 })
    })

    /* beside the folder the file was delivered into, never inside it, one folder per moment */
    it('keeps the bin one step above the delivered folder, unless that is a share', () => {
      const at = new Date(2026, 8, 22, 18, 40, 0)
      expect(binFor('/home/Photos/Skydive/Yverdon/a.mp4', at)).toBe(
        '/home/Photos/Skydive/.skydock-trash/2026-09-22T18-40-00'
      )
      expect(binFor('/photo/a.mp4', at)).toBe('/photo/.skydock-trash/2026-09-22T18-40-00')
    })
  })

  it('asks for no share link when told not to', async () => {
    storageAnswers()
    const result = await publish({ remoteDir: '/Backup', share: false })
    expect(result.shareUrl).toBeNull()
    expect(seen.some((c) => c.url.includes('SYNO.FileStation.Sharing'))).toBe(false)
  })

  /* Every name changes on the way out, so the same footage is delivered under a second name often
     enough: a clip whose time was put right, a passenger renamed, a jump filed elsewhere. What the
     storage says it already holds of that original is what keeps it from going up twice (RULES,
     Network storage). */
  describe('the same footage under another name', () => {
    const md5Of = (file: string) => createHash('md5').update(fs.readFileSync(file)).digest('hex')
    const already = (localPath: string, remotePath: string) => ({
      index: {
        version: 1 as const,
        files: { [remotePath]: { from: 'b699e6', md5: md5Of(localPath), size: 5, at: 1 } }
      },
      of: () => ({ from: 'b699e6' })
    })

    it('is not sent again when it is already in the folder it is going to', async () => {
      storageAnswers('/sharing/abc', {
        '/SkyDock/jump': [{ name: 'under_another_name.mp4', size: 4 }]
      })
      const film = path.join(dir, 'film.mp4')
      fs.writeFileSync(film, Buffer.from('film'))

      const result = await publish({
        files: [film],
        origins: already(film, '/SkyDock/jump/under_another_name.mp4')
      })

      expect(result).toMatchObject({ uploaded: 0, skipped: 1 })
      expect(sentNames(server.uploads)).toEqual([])
      expect(result.files[0]?.remotePath).toBe('/SkyDock/jump/under_another_name.mp4')
    })

    /* The list remembers what was put there once; the listing says what is there now. A file
       somebody deleted by hand is a file to send again. */
    it('is sent again when the folder no longer holds it, whatever the list remembers', async () => {
      storageAnswers()
      const film = path.join(dir, 'film.mp4')
      fs.writeFileSync(film, Buffer.from('film'))

      const result = await publish({
        files: [film],
        origins: already(film, '/SkyDock/jump/under_another_name.mp4')
      })

      expect(result).toMatchObject({ uploaded: 1, skipped: 0 })
      expect(sentNames(server.uploads)).toEqual(['film.mp4'])
    })

    /* Another folder is another delivery — a passenger's own, a second dropzone — and that folder
       has to hold it: a renamed passenger whose files were only "already up there" somewhere else
       would be handed a share link to an empty folder. The storage copies it to itself instead, so
       the folder holds it and nothing travels from here. */
    it('is copied by the storage itself into the folder that wants it', async () => {
      const copies: { from: string; to: string }[] = []
      const renames: { path: string; name: string }[] = []
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (url.includes('SYNO.FileStation.CopyMove')) {
          const params = new URL(url, 'http://x').searchParams
          if (params.get('method') === 'start') {
            copies.push({
              from: JSON.parse(params.get('path') ?? '[]')[0],
              to: JSON.parse(params.get('dest_folder_path') ?? '[]')[0]
            })
            return jsonResponse({ success: true, data: { taskid: 'task-1' } })
          }
          return jsonResponse({ success: true, data: { finished: true } })
        }
        if (url.includes('SYNO.FileStation.Rename')) {
          const params = new URL(url, 'http://x').searchParams
          renames.push({ path: params.get('path') ?? '', name: params.get('name') ?? '' })
          return jsonResponse({ success: true })
        }
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/abc' }] } })
        if (url.includes('SYNO.FileStation.List')) return listing(url)
        return jsonResponse({ success: true })
      })
      const film = path.join(dir, 'film.mp4')
      fs.writeFileSync(film, Buffer.from('film'))

      const result = await publish({
        files: [film],
        origins: already(film, '/SkyDock/Epagny/epagny_20260920_100250.mp4')
      })

      expect(sentNames(server.uploads)).toEqual([])
      expect(result).toMatchObject({ uploaded: 0, copied: 1 })
      expect(copies).toEqual([
        { from: '/SkyDock/Epagny/epagny_20260920_100250.mp4', to: '/SkyDock/jump' }
      ])
      expect(renames).toEqual([
        { path: '/SkyDock/jump/epagny_20260920_100250.mp4', name: 'film.mp4' }
      ])
      expect(result.files[0]?.remotePath).toBe('/SkyDock/jump/film.mp4')
    })

    /* a copy the storage will not make is no reason for the folder to go without the file */
    it('is sent after all when the storage will not copy it', async () => {
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (url.includes('SYNO.FileStation.CopyMove'))
          return jsonResponse({ success: false, error: { code: 1200 } })
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/abc' }] } })
        if (url.includes('SYNO.FileStation.List')) return listing(url)
        return jsonResponse({ success: true })
      })
      const film = path.join(dir, 'film.mp4')
      fs.writeFileSync(film, Buffer.from('film'))

      const result = await publish({
        files: [film],
        origins: already(film, '/SkyDock/Epagny/epagny_20260920_100250.mp4')
      })

      expect(result).toMatchObject({ uploaded: 1, copied: 0 })
      expect(sentNames(server.uploads)).toEqual(['film.mp4'])
    })

    it('is sent when it is the same footage cut another way', async () => {
      storageAnswers()
      const film = path.join(dir, 'film.mp4')
      fs.writeFileSync(film, Buffer.from('film'))
      const stale = already(film, '/SkyDock/Epagny/epagny_20260920_100250.mp4')
      stale.index.files['/SkyDock/Epagny/epagny_20260920_100250.mp4']!.md5 = 'cut-another-way'

      const result = await publish({ files: [film], origins: stale })

      expect(result).toMatchObject({ uploaded: 1 })
      expect(sentNames(server.uploads)).toEqual(['film.mp4'])
    })

    /* A destination can be pointed at a folder that was full of footage long before SkyDock saw it.
       Those files are in the list with what they weigh and nothing else, and one that weighs what
       this file weighs is worth a single question to the storage — which hashes it on its own side,
       and the answer is kept, so it is never asked twice. */
    it('is recognised in a folder SkyDock never filled, by asking the storage once', async () => {
      const asked: string[] = []
      const film = path.join(dir, 'film.mp4')
      fs.writeFileSync(film, Buffer.from('film'))
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (url.includes('SYNO.FileStation.MD5')) {
          const params = new URL(url, 'http://x').searchParams
          if (params.get('method') === 'start') {
            asked.push(params.get('file_path') ?? '')
            return jsonResponse({ success: true, data: { taskid: 'md5-1' } })
          }
          return jsonResponse({
            success: true,
            data: { finished: true, md5: md5Of(film) }
          })
        }
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/abc' }] } })
        if (url.includes('SYNO.FileStation.List'))
          return listing(url, { '/SkyDock/jump': [{ name: 'from_before_skydock.mp4', size: 4 }] })
        return jsonResponse({ success: true })
      })

      const result = await publish({
        files: [film],
        origins: {
          index: {
            version: 1,
            files: { '/SkyDock/jump/from_before_skydock.mp4': { size: 4, at: 1 } }
          },
          of: () => ({ from: 'b699e6' })
        }
      })

      expect(asked).toEqual(['/SkyDock/jump/from_before_skydock.mp4'])
      expect(result).toMatchObject({ uploaded: 0, skipped: 1 })
      expect(sentNames(server.uploads)).toEqual([])
      expect(result.files[0]?.remotePath).toBe('/SkyDock/jump/from_before_skydock.mp4')
    })

    /* what the folders were seen to hold is what the next upload starts from */
    it('comes back saying what the folder was seen to hold', async () => {
      const stub = nasStubs({
        files: { '/SkyDock/jump': [{ name: 'from_before_skydock.mp4', size: 99 }] }
      })
      stubFetch((url) => {
        if (url.includes('method=login')) return loginSuccess('sid')
        if (url.includes('SYNO.FileStation.Sharing'))
          return jsonResponse({ success: true, data: { links: [{ url: '/sharing/abc' }] } })
        return stub(url) ?? jsonResponse({ success: true })
      })
      const film = path.join(dir, 'film.mp4')
      fs.writeFileSync(film, Buffer.from('film'))

      const result = await publish({ files: [film] })

      expect(result.seen).toEqual([
        { remotePath: '/SkyDock/jump/from_before_skydock.mp4', size: 99 }
      ])
    })

    /* a file the storage has nothing from is never read for this: reading is the expensive half */
    it('is sent, unread, when the storage has nothing from that original', async () => {
      storageAnswers()
      const film = path.join(dir, 'film.mp4')
      fs.writeFileSync(film, Buffer.from('film'))

      const result = await publish({
        files: [film],
        origins: { index: { version: 1, files: {} }, of: () => ({ from: 'b699e6' }) }
      })

      expect(result).toMatchObject({ uploaded: 1 })
    })
  })
})
