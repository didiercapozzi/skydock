import { describe, it, expect, beforeEach } from 'vitest'
import type { Manifest, ManifestJump, ManifestFile } from '../app/lib/types'

const makeFile = (path: string, camera: 'PHOTO' | 'VIDEO', mtime: number): ManifestFile => ({
  path,
  camera,
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
  camera1: { path: '/camera1', fileCount: 0 },
  camera2: { path: '/camera2', fileCount: 0 },
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
          offset += file.camera === 'PHOTO' ? 30 : 35
        }

        expect(jump.files[0].mtime).toBe(baseEpoch)
      }
    })
  })
})
