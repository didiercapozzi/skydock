// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveManifest } from '@skydock/scripts'
import { saveNasSession } from '../../../packages/skydock-scripts/src/nas'
import type { Manifest } from '@skydock/scripts'
import { loader as fileLoader } from '../../app/routes/api.storage-file.$'
import { loader as folderLoader } from '../../app/routes/api.storage-folder'
import { createTmpDir, jsonResponse, routeArgs, stubFetch } from './fixtures'

/* A place is connected to its folder on the storage: the board lists what is up there and plays it
   from there, through its own server, which holds the session. Driven the way the board drives it. */

const DIR = '/SkyDock/Tandems/Luc Favre'

let tmpDir: string
let previous: string | undefined
let ranges: (string | null)[]

const manifest: Manifest = {
  version: 1,
  createdAt: 'x',
  files: [],
  groups: [
    {
      id: 'g1',
      label: 'g1',
      day: '01.08.2026',
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: []
    }
  ],
  destinations: [{ name: 'Tandems' }, { name: 'Yverdon' }]
}

/* the storage: it knows the session, lists one folder, and hands out parts of one film */
const storage = (url: string, init?: RequestInit) => {
  const params = new URL(url).searchParams
  if (params.get('api') === 'SYNO.FileStation.Download') {
    ranges.push(new Headers(init?.headers).get('range'))
    return new Response('part of the film', {
      status: 206,
      headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 100-115/5000' }
    })
  }
  if (params.get('filetype') === 'file')
    return jsonResponse({
      success: true,
      data: {
        files:
          params.get('folder_path') === DIR
            ? [
                {
                  name: 'luc_favre.mp4',
                  path: `${DIR}/luc_favre.mp4`,
                  isdir: false,
                  additional: { size: 5000, time: { mtime: 1_785_000_000 } }
                }
              ]
            : []
      }
    })
  return jsonResponse({ success: true, data: { files: [] } })
}

const ask = (where: Record<string, string>) =>
  folderLoader(
    routeArgs(
      new Request(
        `http://localhost/api/storage-folder?q=${encodeURIComponent(JSON.stringify(where))}`
      )
    )
  ).then((res) => res.json())

const play = (filePath: string, range?: string) =>
  fileLoader({
    ...routeArgs(
      new Request(`http://localhost/api/storage-file${filePath}`, {
        headers: range ? { Range: range } : {}
      })
    ),
    params: { '*': filePath.slice(1) }
  })

beforeEach(() => {
  tmpDir = createTmpDir('skydock-api-storage-')
  previous = process.env.SKYDOCK_OUTPUT_DIR
  process.env.SKYDOCK_OUTPUT_DIR = tmpDir
  saveManifest(path.join(tmpDir, 'manifest.json'), manifest)
  saveNasSession(
    {
      hostname: 'https://nas.local:5001',
      username: 'u',
      sessionId: 'sid',
      defaultFolder: '/SkyDock'
    },
    tmpDir
  )
  ranges = []
  stubFetch(storage)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (previous === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
  else process.env.SKYDOCK_OUTPUT_DIR = previous
  vi.unstubAllGlobals()
})

describe('what a place’s folder on the storage holds', () => {
  it('lists a tandem’s folder, each file with what it is, how big and from when', async () => {
    expect(await ask({ groupId: 'g1' })).toEqual({
      ok: true,
      dir: DIR,
      files: [
        {
          name: 'luc_favre.mp4',
          path: `${DIR}/luc_favre.mp4`,
          size: 5000,
          mtime: 1_785_000_000,
          kind: 'video'
        }
      ]
    })
  })

  it('lists a dropzone’s folder, empty while nothing was uploaded into it', async () => {
    expect(await ask({ destination: 'Yverdon' })).toEqual({
      ok: true,
      dir: '/SkyDock/Yverdon',
      files: []
    })
  })

  /* a tandem the storage's list names and this board no longer holds */
  it('lists a folder named outright, when it is one SkyDock uploads into', async () => {
    expect(await ask({ folder: DIR })).toMatchObject({ ok: true, dir: DIR })
    expect(await ask({ folder: '/homes/someone' })).toMatchObject({ ok: false })
  })

  it('says so when the storage is not connected', async () => {
    fs.rmSync(path.join(tmpDir, '.status'), { recursive: true, force: true })
    expect(await ask({ groupId: 'g1' })).toEqual({
      ok: false,
      reason: 'The storage is not connected.'
    })
  })
})

describe('a file played off the storage', () => {
  it('hands on the part the player asked for, and passes the storage’s answer back', async () => {
    const res = await play(`${DIR}/luc_favre.mp4`, 'bytes=100-115')

    expect(ranges).toEqual(['bytes=100-115'])
    expect(res.status).toBe(206)
    expect(res.headers.get('content-type')).toBe('video/mp4')
    expect(res.headers.get('content-range')).toBe('bytes 100-115/5000')
    expect(await res.text()).toBe('part of the film')
  })

  it('refuses a file outside the folders SkyDock uploads into, without asking the storage', async () => {
    const res = await play('/homes/someone/private.mp4')

    expect(res.status).toBe(403)
    expect(ranges).toEqual([])
  })
})
