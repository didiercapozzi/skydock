import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { getOutputDir } from '@skydock/scripts'
import { loader } from '../../app/routes/api.file.$'

/* the output folder the test run gives every server test — never the real one */
const TEST_DIR = path.join(getOutputDir(), 'test-stream')
const TEST_FILE = `${TEST_DIR}/test-video.mp4`

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true })
  fs.writeFileSync(TEST_FILE, Buffer.alloc(1024, 0xab))
})

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true })
})

const makeRequest = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/file/test-stream/test-video.mp4', { headers })

const makeParams = (splat: string) => ({ '*': splat })

describe('playing a file', () => {
  test('says when the file is not there', async () => {
    const res = await loader({
      params: makeParams('test-stream/nope.mp4'),
      request: makeRequest()
    })
    expect(res.status).toBe(404)
  })

  test('plays a file whole', async () => {
    const res = await loader({
      params: makeParams('test-stream/test-video.mp4'),
      request: makeRequest()
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('video/mp4')
    expect(res.headers.get('Content-Length')).toBe('1024')
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    const body = await res.arrayBuffer()
    expect(body.byteLength).toBe(1024)
  })

  test('plays from the middle of a clip', async () => {
    const res = await loader({
      params: makeParams('test-stream/test-video.mp4'),
      request: makeRequest({ range: 'bytes=0-511' })
    })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-511/1024')
    expect(res.headers.get('Content-Length')).toBe('512')
    const body = await res.arrayBuffer()
    expect(body.byteLength).toBe(512)
  })

  test('plays to the end', async () => {
    const res = await loader({
      params: makeParams('test-stream/test-video.mp4'),
      request: makeRequest()
    })
    const reader = res.body!.getReader()
    let totalBytes = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
    }
    expect(totalBytes).toBe(1024)
  })

  test('is closed mid-play without harm', async () => {
    const res = await loader({
      params: makeParams('test-stream/test-video.mp4'),
      request: makeRequest()
    })
    const reader = res.body!.getReader()
    const { value } = await reader.read()
    expect(value!.byteLength).toBeGreaterThan(0)
    await reader.cancel()
    await new Promise((r) => setTimeout(r, 50))
  })

  test('is closed mid-seek without harm', async () => {
    const res = await loader({
      params: makeParams('test-stream/test-video.mp4'),
      request: makeRequest({ range: 'bytes=100-1023' })
    })
    expect(res.status).toBe(206)
    const reader = res.body!.getReader()
    await reader.read()
    await reader.cancel()
    await new Promise((r) => setTimeout(r, 50))
  })
})
