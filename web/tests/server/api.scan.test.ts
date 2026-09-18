// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { action } from '../../app/routes/api.scan'
import { createTmpDir } from './fixtures'

type Answer = {
  scan: { fileCount: number; groupCount: number; unchanged: boolean }
  groups: unknown[]
  looseFiles?: unknown[]
}

describe('scanning', () => {
  let tmpDir: string
  let originalOutputDir: string | undefined

  beforeEach(() => {
    tmpDir = createTmpDir('skydock-api-scan-test-')
    originalOutputDir = process.env.SKYDOCK_OUTPUT_DIR
    process.env.SKYDOCK_OUTPUT_DIR = tmpDir
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    if (originalOutputDir === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
    else process.env.SKYDOCK_OUTPUT_DIR = originalOutputDir
  })

  const scanRequest = () =>
    new Request('http://localhost/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

  it('scans original_files into a manifest, clustering what was shot together', async () => {
    const dayDir = path.join(tmpDir, 'original_files', '2026-08-24')
    fs.mkdirSync(dayDir, { recursive: true })
    fs.writeFileSync(path.join(dayDir, 'DJI_0001.MP4'), Buffer.from('scan-video-bytes'))
    fs.writeFileSync(path.join(dayDir, 'DJI_0002.MP4'), Buffer.from('more-video-bytes'))
    const res = (await action({ request: scanRequest() })) as unknown as Answer
    expect(res.scan.fileCount).toBe(2)
    /* both were written seconds apart, so they are one jump */
    expect(res.scan.groupCount).toBe(1)
    /* the board is answered with what it has to redraw, not just with the counts */
    expect(res.groups).toHaveLength(1)
    expect(res.looseFiles).toHaveLength(0)
    expect(fs.existsSync(path.join(tmpDir, 'manifest.json'))).toBe(true)
  })

  it('returns unchanged result without original_files', async () => {
    const res = (await action({ request: scanRequest() })) as unknown as Answer
    expect(res.scan.unchanged).toBe(true)
    expect(res.scan.fileCount).toBe(0)
    expect(res.groups).toHaveLength(0)
  })
})
