// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { action } from '../../app/routes/api.camera'
import { knownCameras, rememberCamera } from '../../../packages/skydock-scripts/src/knownCameras'
import { createTmpDir, routeArgs } from './fixtures'

/* A camera's page asks for it to be copied again while it stays plugged in (RULES, Copy off the
   cameras). Nowhere is set to look for cameras here, so no real one is ever reached. */

type Refusal = { success: false; globalErrors?: string[] }

describe('copying a camera again from its page', () => {
  let roots: string | undefined

  beforeEach(() => {
    roots = process.env.SKYDOCK_CAMERA_ROOTS
    process.env.SKYDOCK_CAMERA_ROOTS = ''
    globalThis.skydockCameraWatch = undefined
  })

  afterEach(() => {
    if (roots === undefined) delete process.env.SKYDOCK_CAMERA_ROOTS
    else process.env.SKYDOCK_CAMERA_ROOTS = roots
  })

  it('says so when the camera is not plugged in any more', async () => {
    const res = (await action(
      routeArgs(
        new Request('http://localhost/api/camera', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ copy: '/mnt/cameras/GONE' })
        })
      )
    )) as Refusal

    expect(res.success).toBe(false)
    expect(res.globalErrors?.[0]).toContain('not plugged in any more')
  })
})

/* The cameras this machine has met are answered, switched and forgotten from the board; each is kept in
   the settings of a folder of its own here, so nothing real is touched (RULES, Cameras). */
describe('the cameras this machine has met', () => {
  let roots: string | undefined
  let config: string | undefined
  let dir = ''

  const post = async (body: unknown) =>
    (await action(
      routeArgs(
        new Request('http://localhost/api/camera', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
      )
    )) as Record<string, unknown>

  beforeEach(() => {
    roots = process.env.SKYDOCK_CAMERA_ROOTS
    config = process.env.SKYDOCK_CONFIG_DIR
    process.env.SKYDOCK_CAMERA_ROOTS = ''
    dir = createTmpDir('skydock-cameras-')
    process.env.SKYDOCK_CONFIG_DIR = dir
    globalThis.skydockCameraWatch = undefined
  })

  afterEach(() => {
    if (roots === undefined) delete process.env.SKYDOCK_CAMERA_ROOTS
    else process.env.SKYDOCK_CAMERA_ROOTS = roots
    if (config === undefined) delete process.env.SKYDOCK_CONFIG_DIR
    else process.env.SKYDOCK_CONFIG_DIR = config
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('remembers a camera with its answer, without copying when it is not plugged in', async () => {
    rememberCamera({ key: 'name:HERO5 Black', name: 'HERO5 Black', auto: false })

    const res = await post({ remember: { key: 'name:HERO5 Black', auto: true, copy: false } })

    expect(res).toMatchObject({ remembered: 'name:HERO5 Black' })
    expect(knownCameras(dir)).toMatchObject([{ key: 'name:HERO5 Black', auto: true }])
    expect(fs.existsSync(path.join(dir, 'settings.json'))).toBe(true)
  })

  it('switches a camera copying its new files by itself on and off', async () => {
    rememberCamera({ key: 'name:HERO5 Black', name: 'HERO5 Black', auto: false })

    await post({ auto: { key: 'name:HERO5 Black', on: true } })
    expect(knownCameras(dir)[0]?.auto).toBe(true)

    await post({ auto: { key: 'name:HERO5 Black', on: false } })
    expect(knownCameras(dir)[0]?.auto).toBe(false)
  })

  it('forgets a camera, and only that one', async () => {
    rememberCamera({ key: 'name:HERO5 Black', name: 'HERO5 Black', auto: false })
    rememberCamera({ key: 'name:OsmoNano', name: 'OsmoNano', auto: true })

    const res = await post({ forget: 'name:HERO5 Black' })

    expect(res).toMatchObject({ forgotten: 'name:HERO5 Black' })
    expect(knownCameras(dir).map((c) => c.key)).toEqual(['name:OsmoNano'])
  })

  it('refuses to copy picked files when none is picked', async () => {
    const res = await post({ copyFiles: { mount: '/mnt/cameras/GONE', paths: [] } })

    expect(res.success).toBe(false)
    expect((res as Refusal).globalErrors?.[0]).toBe('Nothing is picked to copy.')
  })

  it('says so when the camera to copy picked files from is not plugged in any more', async () => {
    const res = await post({
      copyFiles: { mount: '/mnt/cameras/GONE', paths: ['/mnt/cameras/GONE/DCIM/A.MP4'] }
    })

    expect(res.success).toBe(false)
    expect((res as Refusal).globalErrors?.[0]).toBe('This camera is not plugged in any more.')
  })
})
