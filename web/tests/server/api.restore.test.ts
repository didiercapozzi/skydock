// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadManifest, saveManifest } from '@skydock/scripts'
import type { Manifest, ManifestFile, ManifestGroup } from '@skydock/scripts'
import { saveNasSession } from '../../../packages/skydock-scripts/src/nas'
import { action } from '../../app/routes/api.manifest'
import { createTmpDir, jsonResponse, routeArgs, stubFetch } from './fixtures'

/* Tandems the storage's list names are put back on a board that has forgotten them. The list is read
   off the storage by the server, so what comes back is what the storage says. */

const AT = 1_785_000_000

const file = (id: string, mtime: number): ManifestFile => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime
})

/* the storage's list: Luc Favre's tandem, made of a and b, set an hour on from the camera's clock */
const list = {
  version: 1,
  tandems: [
    {
      folder: '/SkyDock/Tandems/Luc Favre',
      firstname: 'Luc',
      lastname: 'Favre',
      day: '25.07.2026',
      videos: 2,
      photos: 0,
      uploadedAt: 5,
      files: [
        { id: 'a', filename: 'a.MP4', mtime: AT + 3600 },
        { id: 'b', filename: 'b.MP4', mtime: AT + 3660 }
      ]
    }
  ]
}

const storage = (url: string) => {
  const params = new URL(url).searchParams
  if (params.get('api') === 'SYNO.FileStation.Download') return jsonResponse(list)
  return jsonResponse({ success: true, data: { files: [{ name: 'skydock-tandems.json' }] } })
}

let tmpDir: string
let previous: string | undefined

const send = async (body: Record<string, unknown>) =>
  (await action(
    routeArgs(
      new Request('http://localhost/api/manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    )
  )) as {
    groups?: ManifestGroup[]
    restored?: { who: string; files: number; of: number }[]
    globalErrors?: string[]
  }

/* the board after a scan from nothing: the files back in a jump nobody filed */
const forgotten = (): Manifest => ({
  version: 1,
  createdAt: 'x',
  files: [file('a', AT), file('b', AT + 60)],
  groups: [
    {
      id: 'group_1',
      label: 'group_1',
      day: '25.07.2026',
      files: [file('a', AT), file('b', AT + 60)]
    }
  ],
  destinations: [{ name: 'Tandems', path: '/SkyDock/Tandems' }]
})

beforeEach(() => {
  tmpDir = createTmpDir('skydock-api-restore-')
  previous = process.env.SKYDOCK_OUTPUT_DIR
  process.env.SKYDOCK_OUTPUT_DIR = tmpDir
  process.env.SKYDOCK_CONFIG_DIR = tmpDir
  saveManifest(path.join(tmpDir, 'manifest.json'), forgotten())
  saveNasSession(
    {
      hostname: 'https://nas.local:5001',
      username: 'u',
      sessionId: 'sid'
    },
    tmpDir
  )
  stubFetch(storage)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (previous === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
  else process.env.SKYDOCK_OUTPUT_DIR = previous
  vi.unstubAllGlobals()
})

describe('restoring tandems from the storage’s list', () => {
  it('puts a forgotten tandem back under its passenger’s name, and writes it down', async () => {
    const said = await send({ intent: 'restore-tandems', folders: ['/SkyDock/Tandems/Luc Favre'] })

    expect(said.restored).toEqual([{ who: 'Luc Favre', files: 2, of: 2 }])
    const saved = loadManifest(path.join(tmpDir, 'manifest.json'))
    const tandem = saved?.groups.find((g) => g.destination === 'Tandems')
    expect(tandem?.passenger).toEqual({ firstname: 'Luc', lastname: 'Favre' })
    expect(tandem?.files.map((f) => f.mtime)).toEqual([AT + 3600, AT + 3660])
  })

  it('restores every tandem on the list when none is named', async () => {
    expect((await send({ intent: 'restore-tandems' })).restored).toHaveLength(1)
  })

  it('says so when none of their files are waiting to be sorted here', async () => {
    await send({ intent: 'restore-tandems' })
    const again = await send({ intent: 'restore-tandems' })
    expect(again.globalErrors?.[0]).toContain('waiting to be sorted')
  })

  it('needs the storage, where the list is kept', async () => {
    fs.rmSync(path.join(tmpDir, 'nas.json'), { force: true })
    const said = await send({ intent: 'restore-tandems' })
    expect(said.globalErrors?.[0]).toContain('Connect the NAS first')
  })
})
