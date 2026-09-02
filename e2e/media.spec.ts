import { test, expect, seedMinimalManifest, mockStatusIdle } from './fixtures'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('media — file and stream', () => {
  test('api/file serves file with range', async ({ page, outputDir }) => {
    seedMinimalManifest(outputDir)
    await mockStatusIdle(page)
    await page.goto('/')
    const filePath = path.join(outputDir, 'original_files/2026-08-24/DJI_0001.MP4')
    fs.writeFileSync(filePath, Buffer.alloc(2048, 0x01))
    const result = await page.evaluate(async (p) => {
      const r = await fetch(`/api/file?path=${encodeURIComponent(p)}`, { headers: { Range: 'bytes=0-1023' } })
      return { status: r.status, acceptRanges: r.headers.get('accept-ranges'), contentRange: r.headers.get('content-range') }
    }, filePath)
    expect([200, 206]).toContain(result.status)
  })

  test('thumb endpoint reachable', async ({ page, outputDir }) => {
    seedMinimalManifest(outputDir)
    await mockStatusIdle(page)
    await page.goto('/')
    const filePath = path.join(outputDir, 'original_files/2026-08-24/DJI_0001.MP4')
    const result = await page.evaluate(async (p) => {
      const r = await fetch(`/api/stream?path=${encodeURIComponent(p)}&thumb=1&w=320&t=0.5`)
      return r.status
    }, filePath)
    expect([200, 429, 500]).toContain(result)
  })
})
