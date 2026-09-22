// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { saveManifest } from '@skydock/scripts'
import { action } from '../../app/routes/api.import'
import { createTmpDir } from './fixtures'

/* A file dragged in from the computer arrives here one at a time: its bytes are the body, and where
   it goes is in the address (RULES, The board — Adding files from the computer). It is copied into
   the originals under the day it was taken, and from then on it is a file like any other. */

type Answer = { ok: boolean; outcome?: string; filename?: string; error?: string }

const SHOT = new Date(2026, 7, 1, 10, 0, 0)

describe('a file added from the computer', () => {
  let tmpDir: string
  let was: string | undefined

  beforeEach(() => {
    tmpDir = createTmpDir('skydock-api-import-test-')
    was = process.env.SKYDOCK_OUTPUT_DIR
    process.env.SKYDOCK_OUTPUT_DIR = tmpDir
    process.env.SKYDOCK_CONFIG_DIR = tmpDir
    /* a board to add to: a file from the computer joins the record a scan made */
    saveManifest(path.join(tmpDir, 'manifest.json'), {
      version: 1,
      createdAt: '2026-08-01',
      files: [],
      groups: [],
      destinations: [{ name: 'Yverdon' }]
    })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    if (was === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
    else process.env.SKYDOCK_OUTPUT_DIR = was
  })

  const dropped = async (params: Record<string, string>, bytes = 'a clip') => {
    const url = `http://localhost/api/import?${new URLSearchParams(params).toString()}`
    const response = await action({
      request: new Request(url, { method: 'POST', body: bytes, duplex: 'half' } as RequestInit),
      params: {},
      context: {} as never
    } as never)
    return (await response.json()) as Answer
  }

  it('is copied into the originals, under the day it was taken', async () => {
    const said = await dropped({
      target: 'sort',
      filename: 'from-phone.mp4',
      lastModified: String(SHOT.getTime())
    })

    expect(said.ok).toBe(true)
    const landed = path.join(tmpDir, 'original_files', '2026-08-01', 'from-phone.mp4')
    expect(fs.existsSync(landed)).toBe(true)
    expect(fs.readFileSync(landed, 'utf-8')).toBe('a clip')
  })

  /* SkyDock's own window hands the page no bytes, only where the file is — and the machine asked is
     the machine it was dragged from, so it is read from there */
  it('is read off this machine when the drop gave only where it is', async () => {
    const elsewhere = path.join(tmpDir, 'elsewhere')
    fs.mkdirSync(elsewhere)
    const from = path.join(elsewhere, 'from phone.mp4')
    fs.writeFileSync(from, 'a clip')
    fs.utimesSync(from, SHOT, SHOT)

    const said = await dropped({ target: 'sort', path: from })

    expect(said).toMatchObject({ ok: true, filename: 'from phone.mp4' })
    const landed = path.join(tmpDir, 'original_files', '2026-08-01', 'from phone.mp4')
    expect(fs.readFileSync(landed, 'utf-8')).toBe('a clip')
    /* read, never moved: what was dropped stays where its owner keeps it */
    expect(fs.existsSync(from)).toBe(true)
  })

  it('says so when the address is one this machine cannot read', async () => {
    const said = await dropped({ target: 'sort', path: path.join(tmpDir, 'no', 'such.mp4') })

    expect(said).toMatchObject({
      ok: false,
      error: 'such.mp4 is not a file this machine can read.'
    })
  })

  /* the address is the whole of what says where it goes, so a target nobody recognises adds nothing */
  it('is refused when the address names nowhere', async () => {
    const said = await dropped({ target: 'somewhere', filename: 'from-phone.mp4' })

    expect(said).toMatchObject({ ok: false, error: 'Nothing to add.' })
    expect(fs.existsSync(path.join(tmpDir, 'original_files'))).toBe(false)
  })

  it('is refused when it arrives without a name', async () => {
    const said = await dropped({ target: 'sort' })

    expect(said).toMatchObject({ ok: false, error: 'Nothing to add.' })
  })
})
