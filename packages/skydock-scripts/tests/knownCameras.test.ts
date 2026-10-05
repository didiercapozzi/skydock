// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  forgetCamera,
  knownCameras,
  rememberCamera,
  setCameraAuto,
  touchCamera
} from '../src/knownCameras'
import { readSettings, rememberOutputDir } from '../src/settings'
import { createTmpDir } from './fixtures'

/* The cameras this machine has met are kept in the settings, beside what else is kept there. */

let config: string

beforeEach(() => {
  config = createTmpDir('skydock-known-')
})
afterEach(() => fs.rmSync(config, { recursive: true, force: true }))

describe('the cameras known to this machine', () => {
  it('starts with none, and keeps one as it was told, not copied by itself unless said', () => {
    expect(knownCameras(config)).toEqual([])
    rememberCamera({ key: 'id:1', name: 'Osmo', auto: false }, config)
    expect(knownCameras(config)).toMatchObject([{ key: 'id:1', name: 'Osmo', auto: false }])
  })

  it('keeps when it was first met, however often it is told again', () => {
    const first = rememberCamera({ key: 'id:1', name: 'Osmo', auto: false }, config)
    const again = rememberCamera({ key: 'id:1', name: 'Osmo Nano', auto: true }, config)
    expect(again.firstSeen).toBe(first.firstSeen)
    expect(knownCameras(config)).toHaveLength(1)
    expect(knownCameras(config)[0]).toMatchObject({ name: 'Osmo Nano', auto: true })
  })

  it('changes whether one is copied by itself, and forgets one', () => {
    rememberCamera({ key: 'a', name: 'A', auto: false }, config)
    rememberCamera({ key: 'b', name: 'B', auto: false }, config)
    setCameraAuto('a', true, config)
    expect(knownCameras(config).find((c) => c.key === 'a')?.auto).toBe(true)
    forgetCamera('b', config)
    expect(knownCameras(config).map((c) => c.key)).toEqual(['a'])
  })

  it('notes when one was last there, and ignores one it does not know', () => {
    touchCamera('nobody', config)
    expect(knownCameras(config)).toEqual([])
    rememberCamera({ key: 'a', name: 'A', auto: false }, config)
    touchCamera('a', config)
    expect(knownCameras(config)[0]?.lastSeen).toBeGreaterThan(0)
  })

  it('leaves the other settings alone, and they leave it alone', () => {
    fs.writeFileSync(path.join(config, 'settings.json'), JSON.stringify({ zoom: 120 }))
    rememberCamera({ key: 'a', name: 'A', auto: false }, config)
    rememberOutputDir('/work', config)
    expect(readSettings(config)).toMatchObject({ zoom: 120, outputDir: '/work' })
    expect(knownCameras(config)).toHaveLength(1)
  })
})
