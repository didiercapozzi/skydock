// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadManifestAsync, saveManifest } from '@skydock/scripts'
import { action, loader } from '../../app/routes/api.edit-clips'
import { createTmpDir, routeArgs } from './fixtures'

const processing = vi.hoisted(() => vi.fn(() => Promise.resolve({ copied: 0, processedGroups: 0 })))

vi.mock('../../../packages/skydock-scripts/src/process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../packages/skydock-scripts/src/process')>()),
  processJumps: processing
}))

vi.mock('../../../packages/skydock-scripts/src/catchUp', () => ({
  catchUp: () => Promise.resolve()
}))

let dir: string
let was: string | undefined

const AT = 1_788_000_000

const file = (id: string, over: Record<string, unknown> = {}) => ({
  path: `/o/${id}.mp4`,
  size: 1,
  mtime: AT,
  filename: `${id}.mp4`,
  id,
  ...over
})

const montage = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  label: 'luc',
  day: '06.09.2026',
  files: [file('held')],
  montageJump: true,
  passenger: { firstname: 'Luc', lastname: 'Favre' },
  processed: true,
  ...over
})

const board = (group = montage()) =>
  saveManifest(path.join(dir, 'manifest.json'), {
    version: 1,
    createdAt: '2026-09-06',
    files: [file('held'), file('loose'), file('gone', { freed: true })],
    groups: [group],
    destinations: []
  })

beforeEach(() => {
  dir = createTmpDir('skydock-api-edit-clips-')
  was = process.env.SKYDOCK_OUTPUT_DIR
  process.env.SKYDOCK_OUTPUT_DIR = dir
  process.env.SKYDOCK_CONFIG_DIR = dir
  processing.mockClear()
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  if (was === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
  else process.env.SKYDOCK_OUTPUT_DIR = was
})

const listed = async (groupId = 'g1') =>
  (await loader(
    routeArgs(
      new Request(
        `http://localhost/api/edit-clips?q=${encodeURIComponent(JSON.stringify({ groupId }))}`
      )
    )
  )) as Response

const send = async (body: object) =>
  (await action(
    routeArgs(
      new Request('http://localhost/api/edit-clips', { method: 'POST', body: JSON.stringify(body) })
    )
  )) as unknown as { ok?: boolean; added?: number; success?: boolean; globalErrors?: string[] }

describe('the clips a film could still take', () => {
  it('are listed without the ones it holds, with the clips of the montage that are there', async () => {
    await board()

    const said = (await (await listed()).json()) as {
      ok: boolean
      members: string[]
      clips: { id: string }[]
    }

    expect(said.members).toEqual(['held'])
    expect(said.clips.map((c) => c.id)).toEqual(['loose', 'gone'])
  })

  it('are not offered to a montage that is not on the board, or has no name', async () => {
    await board()
    expect(await (await listed('gone')).json()).toMatchObject({ ok: false })

    await board(montage({ passenger: undefined }))
    expect(await (await listed()).json()).toMatchObject({ ok: false })
  })
})

describe('putting clips in a film', () => {
  it('moves them in, leaving the montage as it was and making nothing', async () => {
    await board()

    const said = await send({ intent: 'add', groupId: 'g1', fileIds: ['loose'] })

    expect(said).toMatchObject({ ok: true, added: 1 })
    const after = (await loadManifestAsync(path.join(dir, 'manifest.json')))!
    expect(after.groups[0]?.files.map((f) => f.id)).toEqual(['held', 'loose'])
    expect(after.groups[0]?.processed).toBe(true)
    expect(processing).not.toHaveBeenCalled()
  })

  it('refuses a clip that is on the storage only, and says to bring it back', async () => {
    await board()

    const said = await send({ intent: 'add', groupId: 'g1', fileIds: ['gone'] })

    expect(said.success).toBe(false)
    expect(said.globalErrors?.[0]).toMatch(/bring it back/)
    expect(processing).not.toHaveBeenCalled()
  })

  it('refuses a clip it holds already', async () => {
    await board()

    const said = await send({ intent: 'add', groupId: 'g1', fileIds: ['held'] })

    expect(said.success).toBe(false)
  })
})
