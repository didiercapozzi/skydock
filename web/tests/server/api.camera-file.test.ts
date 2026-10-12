import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const onCamera = vi.hoisted(() => ({ ok: false }))
vi.mock('../../../packages/skydock-scripts/src/cameraWatch', () => ({
  isOnCamera: () => onCamera.ok
}))

import { loader } from '../../app/routes/api.camera-file'

let dir: string
let video: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-serve-'))
  video = path.join(dir, 'clip.mp4')
  fs.writeFileSync(video, '0123456789')
  onCamera.ok = false
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('a file on a camera', () => {
  const asked = (file: string, headers: Record<string, string> = {}) =>
    loader({
      request: new Request(`http://localhost/api/camera-file?path=${encodeURIComponent(file)}`, {
        headers
      })
    })

  test('is not found when it is not on a camera', async () => {
    expect((await asked(video)).status).toBe(404)
  })

  test('is not found without a path', async () => {
    onCamera.ok = true
    const res = await loader({ request: new Request('http://localhost/api/camera-file') })
    expect(res.status).toBe(404)
  })

  test('is sent, in part when asked, once it is on a camera', async () => {
    onCamera.ok = true
    const whole = await asked(video)
    expect(whole.status).toBe(200)
    expect(await whole.text()).toBe('0123456789')
    const part = await asked(video, { range: 'bytes=2-4' })
    expect(part.status).toBe(206)
    expect(await part.text()).toBe('234')
  })
})
