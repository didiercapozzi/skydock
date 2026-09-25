// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import { uploadTandem } from '../src/uploadTandem'
import { slugOf, stemOf } from '../src/sending'
import type { SendPlan } from '../src/types'
import { statTandemArtifacts, tandemArtifacts } from '../src/tandem'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'
import { saveNasSession } from '../src/nas'
import type { NasSession } from '../src/nas'
import { createTmpDir, jsonResponse, loginSuccess, seen, stubFetch } from './fixtures'

const configDir = process.env.SKYDOCK_CONFIG_DIR

beforeEach(() => {
  seen.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.env.SKYDOCK_CONFIG_DIR = configDir
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

/* a storage whose list of what it holds is there but garbled: one that cannot be written back */
const stubDsm = ({ garbledList = false }: { garbledList?: boolean } = {}) =>
  stubFetch(async (url) => {
    if (url.includes('SYNO.API.Auth') && url.includes('method=login')) return loginSuccess('sid')
    if (url.includes('SYNO.API.Auth')) return jsonResponse({ success: true })
    if (url.includes('SYNO.FileStation.List'))
      return jsonResponse({
        success: true,
        data: {
          files: garbledList
            ? [
                {
                  name: 'skydock-origins.json',
                  path: `${new URL(url).searchParams.get('folder_path')}/skydock-origins.json`,
                  isdir: false
                }
              ]
            : []
        }
      })
    if (garbledList && url.includes('SYNO.FileStation.Download')) return new Response('{not json')
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
  const outputDir = createTmpDir('skydock-upload-tandem-')
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
    montageJump: true,
    passenger,
    processed,
    files
  }
  const manifest: Manifest = {
    version: 1,
    createdAt: '2026-08-02',
    files,
    groups: [group],
    destinations: [
      { name: 'Tandems', path: '/SkyDock/Tandems' },
      { name: 'Backup', path: '/Backup' },
      { name: 'Yverdon' }
    ]
  }
  return { outputDir, groupDir, group, manifest }
}

const session = (url: string): NasSession => ({ hostname: url, username: 'u', sessionId: 'sid' })

/* a plan a club might make: the originals and the project in one zip to the backup, the film and
   the photos as they are to Tandems */
const PLAN: SendPlan = {
  zips: [{ ending: 'videos', parts: ['videos', 'project'] }],
  placed: { 'zip:videos': ['Backup'], film: ['Tandems'], photos: ['Tandems'] }
}

const upload = async (
  options: SceneOptions = {},
  plan: SendPlan = PLAN,
  storage: { garbledList?: boolean } = {}
) => {
  const built = scene(options)
  const server = await startUploadServer()
  stubDsm(storage)
  /* uploads run with no password, reusing the session kept in the config folder — the same way the
     app does, and not in the output folder, which is where the upload once looked for it */
  process.env.SKYDOCK_CONFIG_DIR = path.join(built.outputDir, 'config')
  saveNasSession({ hostname: server.url, username: 'u', sessionId: 'sid' })
  try {
    const result = await uploadTandem({
      outputDir: built.outputDir,
      manifest: built.manifest,
      group: built.group,
      session: session(server.url),
      plan
    })
    /* what the montage sends — the storage's own list of where its files came from is not a
       delivery (RULES, Network storage) */
    const sent = server.uploads.filter((u) => u.name !== 'skydock-origins.json')
    return { ...built, result, uploads: sent, stem: stemOf(built.group) }
  } finally {
    await server.close()
  }
}

const into = (uploads: { dest: string; name: string }[], dest: string) =>
  uploads
    .filter((u) => u.dest === dest)
    .map((u) => u.name)
    .sort()

const contents = (groupDir: string, name: string) =>
  JSON.parse(fs.readFileSync(path.join(groupDir, '.send', `${name}.contents`), 'utf-8')) as string[]

/* The list of what the storage holds follows the upload and never stands in for it: footage that
   went up is up, whether or not the list could be written (RULES, Network storage). */
describe('uploading a montage — when the storage’s list will not follow', () => {
  it('is done all the same, and says the list was not updated', async () => {
    const { result, uploads } = await upload({}, PLAN, { garbledList: true })

    expect(uploads.length).toBeGreaterThan(0)
    expect(result.originsProblem).toMatch(/list of what it holds was not updated/)
  })
})

describe('uploading a montage — where each item goes', () => {
  it('puts each item in the destinations it was put in, in the project folder named after the montage', async () => {
    const { uploads, stem } = await upload()
    expect(into(uploads, '/SkyDock/Tandems/luc-favre')).toEqual([`${stem}.mp4`])
    expect(into(uploads, '/SkyDock/Tandems/luc-favre/photos')).toEqual([
      'luc_favre_20260802_113000.jpg',
      'luc_favre_20260802_113001.jpg'
    ])
    expect(into(uploads, '/Backup/luc-favre')).toEqual([`${stem}.videos.zip`])
  })

  it('sends the same item to every destination it was put in, built once', async () => {
    const { uploads, stem } = await upload(
      {},
      {
        ...PLAN,
        placed: { ...PLAN.placed, film: ['Tandems', 'Backup'] }
      }
    )
    expect(into(uploads, '/SkyDock/Tandems/luc-favre')).toContain(`${stem}.mp4`)
    expect(into(uploads, '/Backup/luc-favre')).toContain(`${stem}.mp4`)
  })

  it('sends nothing that was put nowhere', async () => {
    const { uploads } = await upload(
      {},
      { ...PLAN, placed: { 'zip:videos': ['Backup'], film: ['Tandems'] } }
    )
    expect(uploads.some((u) => u.dest.endsWith('/photos'))).toBe(false)
  })

  it('asks for a link only where the film went', async () => {
    await upload()
    const shares = seen
      .map((call) => new URL(call.url, 'http://stub').searchParams)
      .filter((p) => p.get('api') === 'SYNO.FileStation.Sharing')
      .map((p) => p.get('path'))
      .filter((p) => p !== null)
    expect(shares.length).toBeGreaterThan(0)
    expect(shares.every((p) => p.includes('/SkyDock/Tandems/luc-favre'))).toBe(true)
  })

  it('never sends the working copies of the videos', async () => {
    const { uploads, stem } = await upload()
    expect(uploads.filter((u) => u.name.endsWith('.mp4')).map((u) => u.name)).toEqual([
      `${stem}.mp4`
    ])
  })

  it('records what went where: each part’s first place, and every place', async () => {
    const { result, stem } = await upload()
    expect(result.record.shareUrl).toContain('/sharing/abc')
    expect(result.record.film?.remotePath).toBe(`/SkyDock/Tandems/luc-favre/${stem}.mp4`)
    expect(result.record.rushes).toMatchObject({
      remotePath: `/Backup/luc-favre/${stem}.videos.zip`,
      holds: ['videos', 'project']
    })
    expect(result.record.photoFiles?.map((f) => f.remotePath).sort()).toEqual([
      '/SkyDock/Tandems/luc-favre/photos/luc_favre_20260802_113000.jpg',
      '/SkyDock/Tandems/luc-favre/photos/luc_favre_20260802_113001.jpg'
    ])
    expect(result.record.sent).toContainEqual({
      name: `${stem}.mp4`,
      holds: ['film'],
      to: ['/SkyDock/Tandems/luc-favre']
    })
  })
})

describe('uploading a montage — where in a destination', () => {
  it('puts the items straight into a destination’s folder when asked', async () => {
    const { uploads, stem } = await upload({}, { ...PLAN, inRoot: ['Tandems'] })
    expect(into(uploads, '/SkyDock/Tandems')).toEqual([`${stem}.mp4`])
    expect(into(uploads, '/SkyDock/Tandems/photos')).toHaveLength(2)
    expect(into(uploads, '/Backup/luc-favre')).toEqual([`${stem}.videos.zip`])
  })

  it('names the project folder as asked', async () => {
    const { uploads, stem } = await upload({}, { ...PLAN, folder: 'boogie-2026' })
    expect(into(uploads, '/SkyDock/Tandems/boogie-2026')).toEqual([`${stem}.mp4`])
  })

  it('makes a folder name of lowercase letters, digits and dashes', () => {
    expect(slugOf('Boogie 2026')).toBe('boogie-2026')
    expect(slugOf('  Élodie  Dupré! ')).toBe('elodie-dupre')
    expect(slugOf('Boogie ', true)).toBe('boogie-')
  })
})

describe('uploading a montage — what is zipped', () => {
  it('puts the videos under videos/ and the project at the top of one zip', async () => {
    const { groupDir, stem } = await upload()
    expect(contents(groupDir, `${stem}.videos.zip`)).toEqual([
      'videos/GX018570.MP4',
      'videos/GX018571.MP4',
      `${stem}.kdenlive`
    ])
  })

  it('makes one full zip, with videos/ and photos/, when both are zipped together', async () => {
    const { groupDir, stem, uploads } = await upload(
      {},
      {
        zips: [{ ending: 'full', parts: ['videos', 'photos', 'project'] }],
        placed: { 'zip:full': ['Backup'], film: ['Tandems'] }
      }
    )
    expect(contents(groupDir, `${stem}.full.zip`)).toEqual([
      'videos/GX018570.MP4',
      'videos/GX018571.MP4',
      'photos/luc_favre_20260802_113000.jpg',
      'photos/luc_favre_20260802_113001.jpg',
      `${stem}.kdenlive`
    ])
    expect(into(uploads, '/Backup/luc-favre')).toEqual([`${stem}.full.zip`])
  })

  it('puts the same part into several zips, each named by the ending it was given', async () => {
    const { groupDir, stem, uploads } = await upload(
      {},
      {
        zips: [
          { ending: 'full', parts: ['videos', 'photos', 'project'] },
          { ending: 'passenger', parts: ['film', 'photos'] }
        ],
        placed: { 'zip:full': ['Backup'], 'zip:passenger': ['Tandems'] }
      }
    )
    expect(contents(groupDir, `${stem}.passenger.zip`)).toEqual([
      'photos/luc_favre_20260802_113000.jpg',
      'photos/luc_favre_20260802_113001.jpg',
      `${stem}.mp4`
    ])
    expect(into(uploads, '/Backup/luc-favre')).toEqual([`${stem}.full.zip`])
    expect(into(uploads, '/SkyDock/Tandems/luc-favre')).toEqual([`${stem}.passenger.zip`])
  })

  it('sends the originals as they are, under videos/, when they are not zipped', async () => {
    const { uploads } = await upload(
      {},
      {
        zips: [],
        placed: { videos: ['Backup'], film: ['Tandems'] }
      }
    )
    expect(into(uploads, '/Backup/luc-favre/videos')).toEqual(['GX018570.MP4', 'GX018571.MP4'])
  })
})

describe('uploading a montage — what is refused', () => {
  const fails = async (options: SceneOptions, plan: SendPlan = PLAN) => {
    try {
      await upload(options, plan)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }

  it('refuses a jump with no name', async () => {
    expect(await fails({ noPassenger: true })).toMatch(/give it a name/)
  })

  it('refuses one that was never processed', async () => {
    expect(await fails({ processed: false })).toMatch(/Process this montage/)
  })

  it('names the film it looked for when the render has not happened', async () => {
    expect(await fails({ film: null })).toMatch(/Render the film in kdenlive first/)
  })

  it('refuses to choose between several films', async () => {
    const built = scene({ film: 'take one.mp4' })
    fs.writeFileSync(path.join(built.groupDir, 'take two.mp4'), Buffer.alloc(8))
    const server = await startUploadServer()
    stubDsm()
    process.env.SKYDOCK_CONFIG_DIR = path.join(built.outputDir, 'config')
    saveNasSession({ hostname: server.url, username: 'u', sessionId: 'sid' })
    await expect(
      uploadTandem({
        outputDir: built.outputDir,
        manifest: built.manifest,
        group: built.group,
        session: session(server.url),
        plan: PLAN
      })
    ).rejects.toThrow(/Several films here/)
    await server.close()
  })

  it('refuses a destination that has no folder on the storage yet', async () => {
    expect(await fails({}, { ...PLAN, placed: { ...PLAN.placed, film: ['Yverdon'] } })).toMatch(
      /Choose a NAS folder for Yverdon/
    )
  })

  it('refuses when nothing was put anywhere', async () => {
    expect(await fails({}, { ...PLAN, placed: {} })).toMatch(/at least one thing/)
  })
})

describe('uploading a montage — the awkward cases', () => {
  it('adopts a film rendered under a different name, and sends it named after the montage', async () => {
    const { uploads, groupDir, stem } = await upload({ film: 'GARGASSON Donald.mp4' })
    expect(fs.existsSync(path.join(groupDir, 'luc_favre_20260802.mp4'))).toBe(true)
    expect(uploads.map((u) => u.name)).toContain(`${stem}.mp4`)
  })

  it('uploads a montage whose camera died, with no film at all', async () => {
    const { uploads } = await upload({ film: null, videos: 0 })
    expect(into(uploads, '/SkyDock/Tandems/luc-favre/photos')).toHaveLength(2)
    expect(uploads.some((u) => u.name.endsWith('.mp4'))).toBe(false)
  })
})

describe('what the board knows of a tandem’s project and film', () => {
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
