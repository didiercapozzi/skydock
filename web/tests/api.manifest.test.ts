import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { action } from '../app/routes/api.manifest'
import type { Manifest, ManifestJump, ManifestFile } from '../app/lib/types'

const makeFile = (path: string, _camera: 'PHOTO' | 'VIDEO', mtime: number): ManifestFile => ({
  path,
  mtime,
  size: 1000,
  filename: path.split('/').pop() ?? ''
})

const makeJump = (id: string, label: string, files: ManifestFile[] = []): ManifestJump => ({
  id,
  label,
  confirmed: false,
  files
})

const makeManifest = (jumps: ManifestJump[] = [], files: ManifestFile[] = []): Manifest => ({
  version: 1,
  status: 'proposed',
  date: '2026-08-22',
  startDatetime: '2026-08-22T09:00:00Z',
  createdAt: new Date().toISOString(),
  theory: [],
  jumps,
  files
})

describe('manifest actions', () => {
  let manifest: Manifest

  beforeEach(() => {
    manifest = makeManifest(
      [
        makeJump('jump_1', 'Jump 1', [makeFile('/photo1.jpg', 'PHOTO', 1000)]),
        makeJump('jump_2', 'Jump 2', [makeFile('/video1.mp4', 'VIDEO', 2000)])
      ],
      [makeFile('/photo1.jpg', 'PHOTO', 1000), makeFile('/video1.mp4', 'VIDEO', 2000)]
    )
  })

  describe('update-label', () => {
    it('updates jump label', () => {
      const jump = manifest.jumps.find((j) => j.id === 'jump_1')
      expect(jump).toBeDefined()
      if (jump) {
        jump.label = 'New Label'
        expect(jump.label).toBe('New Label')
      }
    })
  })

  describe('confirm-jump', () => {
    it('toggles jump confirmed status', () => {
      const jump = manifest.jumps.find((j) => j.id === 'jump_1')
      expect(jump).toBeDefined()
      if (jump) {
        jump.confirmed = true
        expect(jump.confirmed).toBe(true)
      }
    })
  })

  describe('confirm-all', () => {
    it('confirms all jumps', () => {
      for (const jump of manifest.jumps) {
        jump.confirmed = true
      }
      expect(manifest.jumps.every((j) => j.confirmed)).toBe(true)
    })

    it('unconfirms all jumps', () => {
      manifest.jumps.forEach((j) => {
        j.confirmed = true
      })
      for (const jump of manifest.jumps) {
        jump.confirmed = false
      }
      expect(manifest.jumps.every((j) => !j.confirmed)).toBe(true)
    })
  })

  describe('delete-jump', () => {
    it('removes jump by id', () => {
      const idx = manifest.jumps.findIndex((j) => j.id === 'jump_1')
      expect(idx).toBe(0)
      manifest.jumps.splice(idx, 1)
      expect(manifest.jumps).toHaveLength(1)
      expect(manifest.jumps[0].id).toBe('jump_2')
    })
  })

  describe('create-jump', () => {
    it('adds new jump with default label', () => {
      const newJump: ManifestJump = {
        id: `jump_${Date.now()}`,
        label: `Jump ${manifest.jumps.length + 1}`,
        confirmed: false,
        files: []
      }
      manifest.jumps.push(newJump)
      expect(manifest.jumps).toHaveLength(3)
      expect(manifest.jumps[2].label).toBe('Jump 3')
    })
  })

  describe('move-files', () => {
    it('moves files between jumps', () => {
      const fromJump = manifest.jumps.find((j) => j.id === 'jump_1')
      const toJump = manifest.jumps.find((j) => j.id === 'jump_2')
      expect(fromJump).toBeDefined()
      expect(toJump).toBeDefined()

      if (fromJump && toJump) {
        const filePaths = ['/photo1.jpg']
        for (const filePath of filePaths) {
          const fileIdx = fromJump.files.findIndex((f) => f.path === filePath)
          if (fileIdx !== -1) {
            const [file] = fromJump.files.splice(fileIdx, 1)
            toJump.files.push(file)
          }
        }

        expect(fromJump.files).toHaveLength(0)
        expect(toJump.files).toHaveLength(2)
      }
    })
  })

  describe('add-to-jump', () => {
    it('adds files from manifest to jump', () => {
      const jump = manifest.jumps.find((j) => j.id === 'jump_1')
      expect(jump).toBeDefined()

      if (jump) {
        const filePaths = ['/video1.mp4']
        for (const filePath of filePaths) {
          const file = manifest.files.find((f) => f.path === filePath)
          if (file && !jump.files.some((f) => f.path === filePath)) {
            jump.files.push(file)
          }
        }

        expect(jump.files).toHaveLength(2)
      }
    })

    it('does not add duplicate files', () => {
      const jump = manifest.jumps.find((j) => j.id === 'jump_1')
      expect(jump).toBeDefined()

      if (jump) {
        const filePaths = ['/photo1.jpg']
        for (const filePath of filePaths) {
          const file = manifest.files.find((f) => f.path === filePath)
          if (file && !jump.files.some((f) => f.path === filePath)) {
            jump.files.push(file)
          }
        }

        expect(jump.files).toHaveLength(1)
      }
    })
  })

  describe('remove-files', () => {
    it('removes files from jump', () => {
      const jump = manifest.jumps.find((j) => j.id === 'jump_1')
      expect(jump).toBeDefined()

      if (jump) {
        const filePaths = ['/photo1.jpg']
        for (const filePath of filePaths) {
          const fileIdx = jump.files.findIndex((f) => f.path === filePath)
          if (fileIdx !== -1) {
            jump.files.splice(fileIdx, 1)
          }
        }

        expect(jump.files).toHaveLength(0)
      }
    })
  })

  describe('update-start-datetime', () => {
    it('updates start datetime', () => {
      manifest.startDatetime = '2026-08-23T10:00:00Z'
      expect(manifest.startDatetime).toBe('2026-08-23T10:00:00Z')
    })
  })

  describe('reset-timestamps', () => {
    it('resets file timestamps relative to base', () => {
      const jump = manifest.jumps.find((j) => j.id === 'jump_1')
      expect(jump).toBeDefined()

      if (jump) {
        const sortedFiles = [...jump.files].sort((a, b) => a.mtime - b.mtime)
        const baseEpoch =
          sortedFiles.length > 0
            ? sortedFiles[0].mtime
            : new Date(manifest.startDatetime).getTime() / 1000

        let offset = 0
        for (const file of jump.files) {
          file.mtime = baseEpoch + offset
          offset += 30
        }

        expect(jump.files[0].mtime).toBe(baseEpoch)
      }
    })
  })
})

describe('calibration actions', () => {
  let tmpDir = ''
  let originalOutputDir: string | undefined

  const DAY = 86400
  const T = 1787727600

  const callAction = async (payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const request = new Request('http://localhost/api/manifest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const handler = action as unknown as (args: { request: Request }) => Promise<unknown>
    return (await handler({ request })) as Record<string, unknown>
  }

  const writeFixture = (manifest: Manifest): void => {
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest))
  }

  const readManifest = (): Manifest =>
    JSON.parse(fs.readFileSync(path.join(tmpDir, 'manifest.json'), 'utf-8')) as Manifest

  const driftManifest = (): Manifest => {
    const photo = (name: string, mtime: number): ManifestFile => ({
      path: `/${name}`,
      size: 1000,
      mtime,
      filename: name
    })
    const video = (name: string, mtime: number): ManifestFile => ({
      path: `/${name}`,
      size: 2000,
      mtime,
      filename: name
    })
    return {
      version: 1,
      status: 'proposed',
      date: '2026-08-26',
      startDatetime: '2026-08-26T09:00:00Z',
      createdAt: new Date().toISOString(),
      theory: [],
      files: [
        photo('p1.jpg', T),
        photo('p2.jpg', T + 30),
        photo('p3.jpg', T + 3600),
        video('v1.mp4', T - 5 * DAY),
        video('v2.mp4', T - 5 * DAY + 30),
        video('v3.mp4', T + 3600 - 5 * DAY)
      ],
      jumps: [
        { id: 'jump_1', label: 'Jump 1', confirmed: false, files: [] },
        { id: 'jump_2', label: 'Jump 2', confirmed: false, files: [] }
      ]
    }
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-calibration-'))
    originalOutputDir = process.env.SKYDOCK_OUTPUT_DIR
    process.env.SKYDOCK_OUTPUT_DIR = tmpDir
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    if (originalOutputDir === undefined) {
      delete process.env.SKYDOCK_OUTPUT_DIR
    } else {
      process.env.SKYDOCK_OUTPUT_DIR = originalOutputDir
    }
  })

  it('aligns a single video sequence onto the photo reference and merges jumps', async () => {
    writeFixture(driftManifest())

    const result = await callAction({
      action: 'calibrate-sequences',
      referencePaths: ['/p1.jpg'],
      targetPaths: ['/v1.mp4', '/v2.mp4'],
      scope: 'single',
      camera: 'VIDEO'
    })

    expect(result.ok).toBe(true)
    expect(result.offsetSeconds).toBe(5 * DAY)

    const manifest = readManifest()
    const v1 = manifest.files.find((f) => f.path === '/v1.mp4')
    const v2 = manifest.files.find((f) => f.path === '/v2.mp4')
    const v3 = manifest.files.find((f) => f.path === '/v3.mp4')

    expect(v1?.mtime).toBe(T)
    expect(v1?.originalMtime).toBe(T - 5 * DAY)
    expect(v2?.mtime).toBe(T + 30)
    expect(v3?.mtime).toBe(T + 3600 - 5 * DAY)

    expect(manifest.cameraClockOffsetSeconds).toBeUndefined()
    expect(manifest.jumps).toHaveLength(3)

    const mergedJump = manifest.jumps.find(
      (j) => j.files.some((f) => f.path === '/p1.jpg') && j.files.some((f) => f.path === '/v1.mp4')
    )
    expect(mergedJump).toBeDefined()
  })

  it('all-wide alignment shifts every file and records the offset', async () => {
    writeFixture(driftManifest())

    const result = await callAction({
      action: 'calibrate-sequences',
      referencePaths: ['/p1.jpg'],
      targetPaths: ['/v1.mp4'],
      scope: 'all'
    })

    expect(result.ok).toBe(true)

    const manifest = readManifest()
    expect(manifest.cameraClockOffsetSeconds).toBe(5 * DAY)
    expect(manifest.files.every((f) => f.mtime >= T)).toBe(true)
    expect(manifest.files.every((f) => f.originalMtime !== undefined)).toBe(true)
    expect(manifest.files.every((f) => f.originalMtime === undefined)).toBe(false)
    expect(manifest.jumps).toHaveLength(4)
  })

  it('reset-calibration restores original timestamps and reclusters', async () => {
    writeFixture(driftManifest())

    await callAction({
      action: 'calibrate-sequences',
      referencePaths: ['/p1.jpg'],
      targetPaths: ['/v1.mp4'],
      scope: 'all'
    })

    const result = await callAction({ action: 'reset-calibration' })
    expect(result.ok).toBe(true)

    const manifest = readManifest()
    expect(manifest.cameraClockOffsetSeconds).toBeUndefined()
    expect(manifest.files.every((f) => f.originalMtime === undefined)).toBe(true)
    const v1 = manifest.files.find((f) => f.path === '/v1.mp4')
    expect(v1?.mtime).toBe(T - 5 * DAY)
  })

  it('rejects calibration on an executed manifest', async () => {
    const executed = driftManifest()
    executed.status = 'executed'
    writeFixture(executed)

    const result = await callAction({
      action: 'calibrate-sequences',
      referencePaths: ['/p1.jpg'],
      targetPaths: ['/v1.mp4'],
      scope: 'single',
      camera: 'VIDEO'
    })

    expect(result.ok).toBe(false)
  })

  it('rejects calibration with missing sequence files', async () => {
    writeFixture(driftManifest())

    const result = await callAction({
      action: 'calibrate-sequences',
      referencePaths: [],
      targetPaths: ['/v1.mp4'],
      scope: 'single',
      camera: 'VIDEO'
    })

    expect(result.ok).toBe(false)
  })
})
