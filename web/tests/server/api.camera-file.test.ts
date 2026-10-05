import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const onCamera = vi.hoisted(() => ({ ok: false }))
vi.mock('../../../packages/skydock-scripts/src/cameraWatch', () => ({
  isOnCamera: () => onCamera.ok
}))

import { loader } from '../../app/routes/api.camera-file'
import { serveFile } from '../../app/helpers/serve-file'

let dir: string
let video: string
let photo: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-serve-'))
  video = path.join(dir, 'clip.mp4')
  photo = path.join(dir, 'pic.JPG')
  fs.writeFileSync(video, '0123456789')
  fs.writeFileSync(photo, 'jpegdata')
  onCamera.ok = false
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const ask = (headers: Record<string, string> = {}) => new Request('http://localhost/x', { headers })

describe('sending a file', () => {
  test('sends all of it with its type', async () => {
    const res = serveFile(video, ask())
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('video/mp4')
    expect(res.headers.get('Content-Length')).toBe('10')
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect(await res.text()).toBe('0123456789')
  })

  test('knows a picture by its extension, whatever its case', () => {
    expect(serveFile(photo, ask()).headers.get('Content-Type')).toBe('image/jpeg')
  })

  test('sends the stretch asked for', async () => {
    const res = serveFile(video, ask({ range: 'bytes=0-3' }))
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-3/10')
    expect(res.headers.get('Content-Length')).toBe('4')
    expect(await res.text()).toBe('0123')
  })

  test('sends the last bytes for a suffix range', async () => {
    const res = serveFile(video, ask({ range: 'bytes=-2' }))
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 8-9/10')
    expect(await res.text()).toBe('89')
  })

  test('sends to the end for an open range, and clamps an end past the file', async () => {
    expect(await serveFile(video, ask({ range: 'bytes=7-' })).text()).toBe('789')
    expect(await serveFile(video, ask({ range: 'bytes=7-99' })).text()).toBe('789')
  })
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
