import { test as base, expect } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

type Fixtures = {
  outputDir: string
}

const ensureOutputDir = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(path.join(dir, 'original_files'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.status'), { recursive: true })
}

export const test = base.extend<Fixtures>({
  outputDir: async ({}, use) => {
    const dir = process.env.SKYDOCK_OUTPUT_DIR ?? '/tmp/playwright-output'
    ensureOutputDir(dir)
    await use(dir)
  }
})

export { expect }

export const seedMinimalManifest = (outputDir: string) => {
  const manifest = {
    version: 1,
    status: 'proposed',
    date: '2026-08-24',
    startDatetime: '2026-08-24T09:00:00Z',
    createdAt: new Date().toISOString(),
    theory: [],
    files: [
      {
        path: path.join(outputDir, 'original_files/2026-08-24/DJI_0001.MP4'),
        size: 1024,
        mtime: 1724490000,
        filename: 'DJI_0001.MP4',
        id: 'a'.repeat(16)
      },
      {
        path: path.join(outputDir, 'original_files/2026-08-24/DJI_0002.MP4'),
        size: 1024,
        mtime: 1724490900,
        filename: 'DJI_0002.MP4',
        id: 'b'.repeat(16)
      }
    ],
    cameraClockOffsetSeconds: undefined
  }
  const jumps = {
    jumps: [
      {
        id: '2026-08-24_Jump1',
        label: 'Jump 1',
        confirmed: false,
        files: [{ id: 'a'.repeat(16) }]
      },
      {
        id: '2026-08-24_Jump2',
        label: 'Jump 2',
        confirmed: false,
        files: [{ id: 'b'.repeat(16) }]
      }
    ]
  }
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(outputDir, 'jumps.json'), JSON.stringify(jumps, null, 2))
  for (const f of manifest.files) {
    fs.mkdirSync(path.dirname(f.path), { recursive: true })
    if (!fs.existsSync(f.path)) fs.writeFileSync(f.path, Buffer.alloc(1024))
  }
}

export const clearOutputDir = (outputDir: string) => {
  if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true })
  ensureOutputDir(outputDir)
}

export const mockStatusIdle = async (page: import('@playwright/test').Page) => {
  await page.route('**/api/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        status: {
          scan: { state: 'idle' },
          execute: { state: 'idle' },
          process: { state: 'idle' }
        }
      })
    })
  })
}
