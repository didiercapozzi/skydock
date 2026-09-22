// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import { binFor, uploadAgain } from '../src/uploadAgain'
import { saveNasSession } from '../src/nas'
import type { NasSession } from '../src/nas'
import type { Manifest, ManifestFile } from '../src/types'
import { createTmpDir } from './fixtures'

/* A file put right and sent again, over one already up there — the one thing an upload otherwise
   refuses to do. What is up there is never written over: it is moved into a bin first, and if that
   move fails nothing is sent at all (RULES, Network storage). */

let dir: string
let moved: { path: string; dest: string }[]
let uploaded: string[]
let moves: 'work' | 'fail'
let server: http.Server
let url: string
const keptConfig = process.env.SKYDOCK_CONFIG_DIR

const REMOTE = '/home/Photos/Skydive/Yverdon/yverdon_20260920_100250.mp4'

const entryOf = (over: Partial<ManifestFile> = {}): ManifestFile => {
  const copy = path.join(dir, 'processed', 'yverdon', 'yverdon_20260920_100250.mp4')
  fs.mkdirSync(path.dirname(copy), { recursive: true })
  fs.writeFileSync(copy, 'the copy, put right')
  return {
    path: path.join(dir, 'original_files', '2026-09-20', 'DJI_0088.MP4'),
    size: 1000,
    mtime: 1_700_000_000,
    filename: 'DJI_0088.MP4',
    id: 'b699e6',
    processed: {
      path: copy,
      size: 19,
      at: 1_700_000_100,
      source: { id: 'b699e6', size: 1000, mtime: 1_700_000_000, cropStart: 37, cropEnd: 112 }
    },
    uploaded: {
      remotePath: REMOTE,
      md5: 'the-old-one',
      size: 400,
      localPath: copy,
      at: 1_700_000_200
    },
    ...over
  }
}

const manifestOf = (file: ManifestFile): Manifest => ({
  version: 1,
  createdAt: 1,
  files: [file],
  groups: []
})

beforeEach(async () => {
  dir = createTmpDir('skydock-again-')
  moved = []
  uploaded = []
  moves = 'work'
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('latin1')
      const named = /filename="([^"]+)"/.exec(body)
      if (named) uploaded.push(named[1]!)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  /* the session an upload uses is the one this machine kept when it connected */
  process.env.SKYDOCK_CONFIG_DIR = path.join(dir, 'config')
  saveNasSession({ hostname: url, username: 'u', sessionId: 'sid' })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (target: string) => {
      const params = new URL(target).searchParams
      const json = (value: unknown) =>
        new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
      if (params.get('api') === 'SYNO.FileStation.CopyMove') {
        if (moves === 'fail') return json({ success: false, error: { code: 1200 } })
        if (params.get('method') === 'start') {
          moved.push({
            path: JSON.parse(params.get('path') ?? '[]')[0],
            dest: JSON.parse(params.get('dest_folder_path') ?? '[]')[0]
          })
          return json({ success: true, data: { taskid: 'task-1' } })
        }
        return json({ success: true, data: { finished: true } })
      }
      if (params.get('method') === 'login') return json({ success: true, data: { sid: 'sid' } })
      /* the list of origins: nothing there yet */
      if (params.get('api') === 'SYNO.FileStation.List')
        return json({ success: true, data: { files: [] } })
      return json({ success: true })
    })
  )
})

afterEach(async () => {
  process.env.SKYDOCK_CONFIG_DIR = keptConfig
  vi.unstubAllGlobals()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  fs.rmSync(dir, { recursive: true, force: true })
})

const session = (): NasSession => ({ hostname: url, username: 'u', sessionId: 'sid' })

describe('a file sent again over the one already up there', () => {
  it('puts the one up there in the bin first, then sends the new one', async () => {
    const manifest = manifestOf(entryOf())

    const done = await uploadAgain({
      manifest,
      session: session(),
      fileId: 'b699e6',
      at: new Date(2026, 8, 22, 18, 40, 0)
    })

    expect(moved).toEqual([
      { path: REMOTE, dest: '/home/Photos/Skydive/.skydock-trash/2026-09-22T18-40-00' }
    ])
    expect(uploaded).toContain('yverdon_20260920_100250.mp4')
    expect(done.remotePath).toBe(REMOTE)
  })

  /* the old file has to be safe before the new one lands, or a bad upload would leave neither */
  it('sends nothing at all when the storage would not put the old one aside', async () => {
    moves = 'fail'
    const manifest = manifestOf(entryOf())

    await expect(uploadAgain({ manifest, session: session(), fileId: 'b699e6' })).rejects.toThrow(
      /nothing was sent/
    )
    expect(uploaded).toEqual([])
  })

  it('says what it needs rather than sending a copy that is not there', async () => {
    const manifest = manifestOf(entryOf({ processed: undefined }))

    await expect(uploadAgain({ manifest, session: session(), fileId: 'b699e6' })).rejects.toThrow(
      /prepare it again/
    )
    expect(moved).toEqual([])
  })

  it('keeps the bin where the list of origins is, one folder per moment', () => {
    expect(binFor('/home/Photos/Skydive/Yverdon/a.mp4', new Date(2026, 8, 22, 18, 40, 0))).toBe(
      '/home/Photos/Skydive/.skydock-trash/2026-09-22T18-40-00'
    )
  })
})
