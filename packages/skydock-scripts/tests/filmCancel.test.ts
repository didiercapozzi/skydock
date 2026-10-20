// @vitest-environment node
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FilmEdit } from '../src/filmEditShape'
import {
  cancelRendering,
  drawtextRefusal,
  formatRefusal,
  isRendering,
  renderFilm
} from '../src/filmRender'
import { filmNameOf } from '../src/montageNames'
import { getGroupProcessedDir } from '../src/process'
import type { Manifest, ManifestGroup } from '../src/types'
import { createTmpDir } from './fixtures'

let dir: string

const group: ManifestGroup = {
  id: 'g1',
  label: 'jump',
  day: '01.08.2026',
  montageJump: true,
  passenger: { firstname: 'Luc', lastname: 'Favre' },
  processed: true,
  files: []
}

const manifest = { files: [], groups: [group] } as unknown as Manifest

const edit: FilmEdit = {
  version: 1,
  clips: [{ id: 'clip-1', name: 'a.mp4', start: 0, end: 60, sound: false }],
  music: [],
  texts: [],
  underSound: 0.15
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const until = async (done: () => boolean) => {
  for (let i = 0; i < 400 && !done(); i++) await wait(50)
  return done()
}

beforeEach(() => {
  dir = createTmpDir('skydock-cancel-')
  const { dir: montage } = getGroupProcessedDir(dir, group)
  fs.mkdirSync(path.join(montage, 'videos'), { recursive: true })
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=1920x1080:r=30:d=60',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    path.join(montage, 'videos', 'a.mp4')
  ])
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('cancelling a render', () => {
  it('stops it, leaves no half film, and keeps the film that was there', async () => {
    const { dir: montage, baseName } = getGroupProcessedDir(dir, group)
    const before = path.join(montage, filmNameOf(baseName))
    fs.writeFileSync(before, 'the earlier film')
    const partial = path.join(montage, `.${baseName}.rendering`)

    const going = renderFilm({ manifest, outputDir: dir, group, edit })
    const failed = going.then(
      () => null,
      (error: Error) => error
    )
    expect(await until(() => fs.existsSync(partial))).toBe(true)
    expect(isRendering(group.id)).toBe(true)

    expect(cancelRendering()).toBe(true)

    expect((await failed)?.message).toMatch(/cancel/i)
    expect(fs.existsSync(partial)).toBe(false)
    expect(fs.readFileSync(before, 'utf-8')).toBe('the earlier film')
    expect(isRendering(group.id)).toBe(false)
  }, 60_000)

  it('starts afresh from what an older running server left behind', () => {
    globalThis.skydockRendering = new Set(['g1']) as never

    expect(isRendering(group.id)).toBe(false)
    expect(cancelRendering()).toBe(false)
  })

  it('stops only the montage named, and the other films go on rendering', () => {
    const luc = new AbortController()
    const marie = new AbortController()
    globalThis.skydockRendering = new Map([
      ['luc', luc],
      ['marie', marie]
    ])

    expect(cancelRendering('marie')).toBe(true)

    expect(marie.signal.aborted).toBe(true)
    expect(luc.signal.aborted).toBe(false)
    expect(cancelRendering('someone else')).toBe(false)
    globalThis.skydockRendering = undefined
  })

  it('says nothing is rendering when nothing is', () => {
    expect(cancelRendering()).toBe(false)
  })
})

describe('a format that this computer cannot make', () => {
  afterEach(() => {
    globalThis.skydockFormats = undefined
  })

  it('is refused with the reason, before anything is rendered, and H.264 never is', async () => {
    globalThis.skydockFormats = Promise.resolve(['h264'])

    expect(await formatRefusal({ ...edit, output: { format: 'h265' } })).toMatch(/H\.?265.*H\.264/)
    expect(await formatRefusal({ ...edit, output: { format: 'h264' } })).toBeNull()
    expect(await formatRefusal(edit)).toBeNull()
  })

  it('refuses a film with texts when the ffmpeg of the computer cannot draw them, and says so', () => {
    const texted = {
      ...edit,
      texts: [
        {
          id: 'text-1',
          text: 'Hi',
          at: 0,
          seconds: 2,
          effect: 'fade' as const,
          font: 'clean' as const,
          x: 0.5,
          y: 0.5,
          size: 0.1,
          colour: '#ffffff'
        }
      ]
    }

    expect(drawtextRefusal(' T.. scale  V->V\n T.. fade V->V', texted)).toMatch(/drawtext/)
    expect(drawtextRefusal(' T.. drawtext V->V\n T.. fade V->V', texted)).toBeNull()
    expect(drawtextRefusal(' T.. scale V->V', edit)).toBeNull()
  })
})
