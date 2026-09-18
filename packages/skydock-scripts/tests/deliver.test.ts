// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import { deliverTandem } from '../src/deliver'
import type { BackupOptions } from '../src/deliver'
import { statTandemArtifacts, tandemArtifacts } from '../src/tandem'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'
import { saveNasSession } from '../src/nas'
import type { NasSession } from '../src/nas'
import { createTmpDir, jsonResponse, loginSuccess, seen, stubFetch } from './fixtures'

beforeEach(() => {
  seen.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/* every upload this test makes, so what reached the passenger can be told from what did not */
const startUploadServer = () => {
  const uploads: { dest: string; name: string }[] = []
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: string | Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('latin1')
      const dest = /name="path"\r\n\r\n([^\r]*)/.exec(body)?.[1] ?? ''
      const name = /filename="([^"]*)"/.exec(body)?.[1] ?? ''
      uploads.push({ dest, name })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    })
  })
  return new Promise<{ url: string; uploads: typeof uploads; close: () => Promise<void> }>(
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

const stubDsm = () =>
  stubFetch(async (url) => {
    if (url.includes('SYNO.API.Auth') && url.includes('method=login')) return loginSuccess('sid')
    if (url.includes('SYNO.API.Auth')) return jsonResponse({ success: true })
    if (url.includes('SYNO.FileStation.List'))
      return jsonResponse({ success: true, data: { files: [] } })
    if (url.includes('SYNO.FileStation.Sharing'))
      return jsonResponse({ success: true, data: { links: [{ url: '/sharing/abc' }] } })
    throw new Error(`unexpected call ${url}`)
  })

type SceneOptions = {
  film?: string | null
  videos?: number
  photos?: number
  processed?: boolean
  noPassenger?: boolean
}

/* A tandem as it is the moment the edit is finished: processed copies in place, a project beside
   them, and whatever the editor left behind. */
const scene = (options: SceneOptions = {}) => {
  const {
    film = 'luc_favre_20260802.mp4',
    videos = 2,
    photos = 2,
    processed = true,
    noPassenger = false
  } = options
  const passenger = noPassenger ? undefined : { firstname: 'Luc', lastname: 'Favre' }
  const outputDir = createTmpDir('skydock-deliver-')
  const originals = path.join(outputDir, 'original_files')
  const groupDir = path.join(outputDir, 'processed', 'Tandems', 'Luc Favre')
  fs.mkdirSync(path.join(groupDir, 'videos'), { recursive: true })
  fs.mkdirSync(path.join(groupDir, 'photos'), { recursive: true })
  fs.mkdirSync(originals, { recursive: true })

  const files: ManifestFile[] = []
  for (let i = 0; i < videos; i++) {
    const source = path.join(originals, `GX01857${i}.MP4`)
    fs.writeFileSync(source, Buffer.alloc(64, i))
    const output = path.join(groupDir, 'videos', `luc_favre_20260802_11300${i}.mp4`)
    fs.writeFileSync(output, Buffer.alloc(32, i))
    files.push({
      path: source,
      size: 64,
      mtime: 1000 + i,
      filename: `GX01857${i}.MP4`,
      id: `v${i}`,
      processed: {
        path: output,
        size: 32,
        at: 1,
        source: { id: `v${i}`, size: 64, mtime: 1000 + i }
      }
    })
  }
  for (let i = 0; i < photos; i++) {
    const source = path.join(originals, `G004200${i}.JPG`)
    fs.writeFileSync(source, Buffer.alloc(16, i))
    const output = path.join(groupDir, 'photos', `luc_favre_20260802_11300${i}.jpg`)
    fs.writeFileSync(output, Buffer.alloc(8, i))
    files.push({
      path: source,
      size: 16,
      mtime: 2000 + i,
      filename: `G004200${i}.JPG`,
      id: `p${i}`,
      processed: {
        path: output,
        size: 8,
        at: 1,
        source: { id: `p${i}`, size: 16, mtime: 2000 + i }
      }
    })
  }

  fs.writeFileSync(path.join(groupDir, 'luc_favre_20260802.kdenlive'), '<mlt/>')
  if (film) fs.writeFileSync(path.join(groupDir, film), Buffer.alloc(128, 7))

  const group: ManifestGroup = {
    id: 'g1',
    label: 'jump',
    day: '02.08.2026',
    destination: 'Tandems',
    passenger,
    processed,
    files
  }
  const manifest: Manifest = {
    version: 1,
    createdAt: '2026-08-02',
    files,
    groups: [group],
    destinations: [{ name: 'Tandems' }]
  }
  return { outputDir, groupDir, group, manifest }
}

const session = (url: string, overrides: Partial<NasSession> = {}): NasSession => ({
  hostname: url,
  username: 'u',
  sessionId: 'sid',
  defaultFolder: '/SkyDock',
  backupFolder: '/Backup',
  ...overrides
})

const deliver = async (
  options: SceneOptions = {},
  sessionOverrides: Partial<NasSession> = {},
  backup?: BackupOptions
) => {
  const built = scene(options)
  const server = await startUploadServer()
  stubDsm()
  /* uploads run with no password, reusing the session on disk — the same way the app does */
  saveNasSession({ hostname: server.url, username: 'u', sessionId: 'sid' }, built.outputDir)
  try {
    const result = await deliverTandem({
      outputDir: built.outputDir,
      manifest: built.manifest,
      group: built.group,
      session: session(server.url, sessionOverrides),
      backup
    })
    return { ...built, result, uploads: server.uploads }
  } finally {
    await server.close()
  }
}

describe('uploading a tandem — what the passenger gets', () => {
  it('sends the film and the photos, and nothing else', async () => {
    const { uploads } = await deliver()
    const toPassenger = uploads
      .filter((u) => u.dest === '/SkyDock/Tandems/Luc Favre')
      .map((u) => u.name)
    expect(toPassenger.sort()).toEqual(['luc_favre_20260802.mp4', 'luc_favre_20260802.photos.zip'])
  })

  it('never puts the rushes in the passenger’s folder', async () => {
    const { uploads } = await deliver()
    const toPassenger = uploads.filter((u) => u.dest === '/SkyDock/Tandems/Luc Favre')
    expect(toPassenger.map((u) => u.name)).not.toContain('luc_favre_20260802.rushes.zip')
  })

  it('never hands over the project or the working folders', async () => {
    const { uploads } = await deliver()
    const names = uploads.map((u) => u.name)
    expect(names.some((n) => n.endsWith('.kdenlive'))).toBe(false)
    expect(names.some((n) => n.startsWith('luc_favre_20260802_'))).toBe(false)
  })

  it('sends the rushes to the backup folder instead', async () => {
    const { uploads } = await deliver()
    expect(uploads.filter((u) => u.dest === '/Backup').map((u) => u.name)).toEqual([
      'luc_favre_20260802.rushes.zip'
    ])
  })

  it('asks for a link on the passenger folder only', async () => {
    await deliver()
    const shares = seen
      .map((call) => new URL(call.url, 'http://stub').searchParams)
      .filter((p) => p.get('api') === 'SYNO.FileStation.Sharing')
      .map((p) => p.get('path'))
    expect(shares).not.toContain('/Backup')
  })

  it('records what went where', async () => {
    const { result } = await deliver()
    expect(result.delivered.shareUrl).toContain('/sharing/abc')
    expect(result.delivered.film?.remotePath).toBe(
      '/SkyDock/Tandems/Luc Favre/luc_favre_20260802.mp4'
    )
    expect(result.delivered.rushes?.remotePath).toBe('/Backup/luc_favre_20260802.rushes.zip')
  })
})

describe('uploading a tandem — what is refused', () => {
  const fails = async (options: SceneOptions, overrides: Partial<NasSession> = {}) => {
    try {
      await deliver(options, overrides)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }

  it('refuses a jump with no passenger', async () => {
    expect(await fails({ noPassenger: true })).toMatch(/give it a passenger/)
  })

  it('refuses one that was never processed', async () => {
    expect(await fails({ processed: false })).toMatch(/Process this tandem/)
  })

  it('names the film it looked for when the render has not happened', async () => {
    expect(await fails({ film: null })).toMatch(/Render the film in kdenlive first/)
  })

  it('refuses to choose between several films', async () => {
    const built = scene({ film: 'take one.mp4' })
    fs.writeFileSync(path.join(built.groupDir, 'take two.mp4'), Buffer.alloc(8))
    const server = await startUploadServer()
    stubDsm()
    saveNasSession({ hostname: server.url, username: 'u', sessionId: 'sid' }, built.outputDir)
    await expect(
      deliverTandem({
        outputDir: built.outputDir,
        manifest: built.manifest,
        group: built.group,
        session: session(server.url)
      })
    ).rejects.toThrow(/Several films here/)
    await server.close()
  })

  it('refuses when no backup folder has been chosen', async () => {
    expect(await fails({}, { backupFolder: undefined })).toMatch(/Choose a backup folder/)
  })

  it('refuses a backup folder that is the passenger folder', async () => {
    expect(await fails({}, { backupFolder: '/SkyDock/Tandems/Luc Favre' })).toMatch(
      /backup folder is the passenger folder/
    )
  })
})

describe('uploading a tandem — the awkward cases', () => {
  it('adopts a film rendered under a different name', async () => {
    const { uploads, groupDir } = await deliver({ film: 'GARGASSON Donald.mp4' })
    expect(fs.existsSync(path.join(groupDir, 'luc_favre_20260802.mp4'))).toBe(true)
    expect(uploads.map((u) => u.name)).toContain('luc_favre_20260802.mp4')
  })

  it('uploads a tandem whose camera died, with no film at all', async () => {
    const { uploads } = await deliver({ film: null, videos: 0 })
    expect(
      uploads.filter((u) => u.dest === '/SkyDock/Tandems/Luc Favre').map((u) => u.name)
    ).toEqual(['luc_favre_20260802.photos.zip'])
  })
})

describe('tandem artifacts — what the board is told', () => {
  it('sees the project and the film once they are there', () => {
    const { outputDir, manifest, group } = scene()
    const found = tandemArtifacts(outputDir, group)
    expect(found.project).toBe(true)
    expect(found.film?.size).toBe(128)
    expect(statTandemArtifacts(manifest, outputDir).g1.project).toBe(true)
  })

  it('reports no film before the render', () => {
    const { outputDir, group } = scene({ film: null })
    expect(tandemArtifacts(outputDir, group).film).toBeNull()
  })

  it('leaves a jump that is not a tandem out of it', () => {
    const { outputDir, manifest } = scene({ noPassenger: true })
    expect(statTandemArtifacts(manifest, outputDir)).toEqual({})
  })
})

/* How the originals are kept is chosen once for the club: one zip, or the clips as they are — and
   either way a copy of the film can go with them. */
describe('uploading a tandem — how the backup is kept', () => {
  const contents = (groupDir: string) =>
    JSON.parse(
      fs.readFileSync(path.join(groupDir, 'luc_favre_20260802.rushes.zip.contents'), 'utf-8')
    ) as string[]

  it('puts a copy of the film inside the zip when asked', async () => {
    const { groupDir } = await deliver({}, {}, { backupAs: 'zip', filmToBackup: true })
    expect(contents(groupDir)).toEqual(['GX018570.MP4', 'GX018571.MP4', 'luc_favre_20260802.mp4'])
  })

  it('leaves the film out of the zip otherwise', async () => {
    const { groupDir } = await deliver()
    expect(contents(groupDir)).toEqual(['GX018570.MP4', 'GX018571.MP4'])
  })

  it('sends the originals as plain files into a folder of their own, with no zip', async () => {
    const { uploads, groupDir, result } = await deliver(
      {},
      {},
      { backupAs: 'folder', filmToBackup: false }
    )
    expect(
      uploads
        .filter((u) => u.dest === '/Backup/luc_favre_20260802')
        .map((u) => u.name)
        .sort()
    ).toEqual(['GX018570.MP4', 'GX018571.MP4'])
    expect(uploads.some((u) => u.name.endsWith('.rushes.zip'))).toBe(false)
    expect(fs.existsSync(path.join(groupDir, 'luc_favre_20260802.rushes.zip'))).toBe(false)
    expect(result.delivered.originals?.map((o) => o.remotePath).sort()).toEqual([
      '/Backup/luc_favre_20260802/GX018570.MP4',
      '/Backup/luc_favre_20260802/GX018571.MP4'
    ])
  })

  it('puts the film beside them, and still gives it to the passenger', async () => {
    const { uploads, result } = await deliver({}, {}, { backupAs: 'folder', filmToBackup: true })
    expect(
      uploads.filter((u) => u.dest === '/Backup/luc_favre_20260802').map((u) => u.name)
    ).toContain('luc_favre_20260802.mp4')
    expect(result.delivered.film?.remotePath).toBe(
      '/SkyDock/Tandems/Luc Favre/luc_favre_20260802.mp4'
    )
    expect(result.delivered.originals).toHaveLength(3)
  })
})
