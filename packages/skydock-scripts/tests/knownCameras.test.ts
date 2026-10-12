// @vitest-environment node
import * as fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  forgetCamera,
  knownCameras,
  rememberCamera,
  setCameraAuto,
  touchCamera
} from '../src/knownCameras'
import { createTmpDir } from './fixtures'

let config: string

beforeEach(() => {
  config = createTmpDir('skydock-known-')
})
afterEach(() => fs.rmSync(config, { recursive: true, force: true }))

describe('the cameras known to this machine', () => {
  it('starts with none, and keeps one as it was told, not copied by itself unless said', async () => {
    expect(knownCameras(config)).toEqual([])
    await rememberCamera({ key: 'id:1', name: 'Osmo', auto: false }, config)
    expect(knownCameras(config)).toMatchObject([{ key: 'id:1', name: 'Osmo', auto: false }])
  })

  it('keeps when it was first met, however often it is told again', async () => {
    const first = await rememberCamera({ key: 'id:1', name: 'Osmo', auto: false }, config)
    const again = await rememberCamera({ key: 'id:1', name: 'Osmo Nano', auto: true }, config)
    expect(again.firstSeen).toBe(first.firstSeen)
    expect(knownCameras(config)).toHaveLength(1)
    expect(knownCameras(config)[0]).toMatchObject({ name: 'Osmo Nano', auto: true })
  })

  it('changes whether one is copied by itself, and forgets one', async () => {
    await rememberCamera({ key: 'a', name: 'A', auto: false }, config)
    await rememberCamera({ key: 'b', name: 'B', auto: false }, config)
    await setCameraAuto('a', true, config)
    expect(knownCameras(config).find((c) => c.key === 'a')?.auto).toBe(true)
    await forgetCamera('b', config)
    expect(knownCameras(config).map((c) => c.key)).toEqual(['a'])
  })

  it('notes when one was last there, and ignores one it does not know', async () => {
    await touchCamera('nobody', config)
    expect(knownCameras(config)).toEqual([])
    await rememberCamera({ key: 'a', name: 'A', auto: false }, config)
    await touchCamera('a', config)
    expect(knownCameras(config)[0]?.lastSeen).toBeGreaterThan(0)
  })
})
