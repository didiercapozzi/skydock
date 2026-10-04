// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadManifest, saveManifest, subscribe } from '@skydock/scripts'
import type { LiveEvent } from '@skydock/scripts'
import { computeFileId } from '../../../packages/skydock-scripts/src/fileId'
import { action } from '../../app/routes/api.import'
import { createTmpDir } from './fixtures'

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
    expect(fs.existsSync(from)).toBe(true)
  })

  it('says so when the address is one this machine cannot read', async () => {
    const said = await dropped({ target: 'sort', path: path.join(tmpDir, 'no', 'such.mp4') })

    expect(said).toMatchObject({
      ok: false,
      error: 'such.mp4 is not a file this machine can read.'
    })
  })

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

describe('a file being copied in from the computer', () => {
  let tmpDir: string
  let was: string | undefined
  let heard: LiveEvent[]
  let stop: (() => void) | null = null

  beforeEach(() => {
    tmpDir = createTmpDir('skydock-api-import-live-')
    was = process.env.SKYDOCK_OUTPUT_DIR
    process.env.SKYDOCK_OUTPUT_DIR = tmpDir
    process.env.SKYDOCK_CONFIG_DIR = tmpDir
    saveManifest(path.join(tmpDir, 'manifest.json'), {
      version: 1,
      createdAt: '2026-08-01',
      files: [],
      groups: [],
      destinations: [{ name: 'Yverdon' }]
    })
    heard = []
    stop = subscribe((event) => heard.push(event))
  })

  afterEach(async () => {
    await drop('end')
    stop?.()
    stop = null
    fs.rmSync(tmpDir, { recursive: true, force: true })
    if (was === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
    else process.env.SKYDOCK_OUTPUT_DIR = was
  })

  const imports = async (params: Record<string, string>, bytes: string) => {
    const url = `http://localhost/api/import?${new URLSearchParams(params).toString()}`
    const response = await action({
      request: new Request(url, { method: 'POST', body: bytes, duplex: 'half' } as RequestInit),
      params: {},
      context: {} as never
    } as never)
    return (await response.json()) as Answer
  }

  const drop = async (what: 'begin' | 'end', body?: object) => {
    const url = `http://localhost/api/import?${what}=1&batch=b`
    await action({
      request: new Request(url, {
        method: 'POST',
        ...(body ? { body: JSON.stringify(body) } : {})
      }),
      params: {},
      context: {} as never
    } as never)
  }
  const begin = (size: number) =>
    drop('begin', {
      batch: 'b',
      where: 'Yverdon',
      files: [{ key: 'drop-0', name: 'long.mp4', size }]
    })

  const rowEvents = () =>
    heard.flatMap((event) =>
      event.kind === 'job' && event.type === 'import' && event.row ? [event.row] : []
    )

  it('says how far through it is, by the name the page gave that copy', async () => {
    const clip = 'x'.repeat(4096)
    await begin(clip.length)

    const said = await imports(
      {
        target: 'sort',
        filename: 'long.mp4',
        lastModified: String(SHOT.getTime()),
        batch: 'b',
        key: 'drop-0',
        size: String(clip.length)
      },
      clip
    )

    expect(said.ok).toBe(true)
    const steps = rowEvents()
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.every((step) => step.key === 'drop-0')).toBe(true)
    expect(steps.some((step) => step.part === 1)).toBe(true)
    expect(steps.at(-1)).toMatchObject({ at: 'done' })
  })

  it('says nothing at all when nobody asked to be told', async () => {
    await imports(
      { target: 'sort', filename: 'quiet.mp4', lastModified: String(SHOT.getTime()) },
      'a clip'
    )

    expect(rowEvents()).toEqual([])
  })

  it('stops being under way once the drop is over', async () => {
    await begin(6)
    await imports(
      {
        target: 'sort',
        filename: 'short.mp4',
        lastModified: String(SHOT.getTime()),
        batch: 'b',
        key: 'drop-0',
        size: '6'
      },
      'a clip'
    )
    await drop('end')

    const later: LiveEvent[] = []
    const off = subscribe((event) => later.push(event))
    off()
    expect(later.flatMap((e) => (e.kind === 'job' && e.type === 'import' ? [e] : []))).toEqual([])
    expect(heard.some((e) => e.kind === 'job' && e.type === 'import' && e.stage === 'done')).toBe(
      true
    )
  })

  it('is known by the same name as reading the whole file back would give', async () => {
    const clip = 'x'.repeat(100_000)

    await imports(
      {
        target: 'sort',
        filename: 'long.mp4',
        lastModified: String(SHOT.getTime()),
        batch: 'b',
        key: 'drop-0',
        size: String(clip.length)
      },
      clip
    )

    const landed = path.join(tmpDir, 'original_files', '2026-08-01', 'long.mp4')
    const saved = loadManifest(path.join(tmpDir, 'manifest.json'))
    expect(saved?.files[0]?.id).toBe(await computeFileId(landed))
  })

  it('says the copy is over before it says it is done', async () => {
    const clip = 'x'.repeat(4096)
    await begin(clip.length)

    await imports(
      {
        target: 'sort',
        filename: 'long.mp4',
        lastModified: String(SHOT.getTime()),
        batch: 'b',
        key: 'drop-0',
        size: String(clip.length)
      },
      clip
    )

    const phases = rowEvents().map((row) => row.phase)
    expect(phases).toContain('reading')
    expect(phases.indexOf('reading')).toBeLessThan(
      rowEvents().findIndex((row) => row.at === 'done')
    )
    const fromReading = rowEvents().slice(phases.indexOf('reading'))
    expect(fromReading.every((row) => row.part === undefined || row.part === 1)).toBe(true)
  })
})
