// @vitest-environment node
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { action } from '../../app/routes/api.scan'

const createTmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-api-scan-test-'))

describe('api/scan (truthful, no UI mock)', () => {
  let tmpDir: string
  let originalOutputDir: string | undefined

  beforeEach(() => {
    tmpDir = createTmpDir()
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

  it('scans original_files into a manifest', async () => {
    const dayDir = path.join(tmpDir, 'original_files', '2026-08-24')
    fs.mkdirSync(dayDir, { recursive: true })
    fs.writeFileSync(path.join(dayDir, 'DJI_0001.MP4'), Buffer.from('scan-video-bytes'))
    const res = (await action({ request: scanRequest() })) as unknown as Record<string, unknown>
    expect(res.ok).toBe(true)
    expect(res.fileCount).toBe(1)
    expect(res.jumpCount).toBe(1)
    expect(fs.existsSync(path.join(tmpDir, 'manifest.json'))).toBe(true)
  })

  it('returns unchanged result without original_files', async () => {
    const res = (await action({ request: scanRequest() })) as unknown as Record<string, unknown>
    expect(res.ok).toBe(true)
    expect(res.unchanged).toBe(true)
    expect(res.fileCount).toBe(0)
  })
})
