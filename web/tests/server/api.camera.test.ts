// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { action } from '../../app/routes/api.camera'
import { routeArgs } from './fixtures'

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
