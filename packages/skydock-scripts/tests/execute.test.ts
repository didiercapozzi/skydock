// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Manifest, ManifestFile, ManifestJump } from '../src/types'

const execSyncMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execSync: execSyncMock
  }
})

const { executeMedia } = await import('../src/execute')
const { loadManifest, saveManifest } = await import('../src/manifest')

const createTmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-execute-test-'))

const writeTempFile = (dir: string, name: string, content?: Buffer): string => {
  const filePath = path.join(dir, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content || Buffer.alloc(1024, 1))
  return filePath
}

const makeExiftoolMock = () => {
  return (cmd: string | Buffer): Buffer => {
    const cmdStr = String(cmd)
    if (cmdStr.includes('command -v exiftool')) {
      throw new Error('command not found')
    }
    return Buffer.from('')
  }
}

const toLocalHHMMSS = (epoch: number): string => {
  const d = new Date(epoch * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

const toLocalYYYYMMDD = (epoch: number): string => {
  const d = new Date(epoch * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

const makeManifest = (jumps: ManifestJump[], files: ManifestFile[]): Manifest => ({
  version: 1,
  status: 'proposed',
  date: '2026-08-29',
  startDatetime: '2026-08-29T09:00:00Z',
  createdAt: '2026-08-29T09:00:00Z',
  theory: [],
  files,
  jumps
})

let fileCounter = 0
const makeFile = (filePath: string, mtime: number, ext = '.MP4'): ManifestFile => ({
  path: filePath,
  size: 1024,
  mtime,
  filename: filePath.split('/').pop() || `file${ext}`,
  id: `file_${++fileCounter}`
})

const makeJump = (
  id: string,
  files: ManifestFile[],
  passenger?: { firstname: string; lastname: string; email: string },
  processed = false
): ManifestJump => ({
  id,
  label: `Jump ${id}`,
  confirmed: true,
  files,
  processed,
  passenger
})

describe('executeMedia', () => {
  let tmpDir: string
  let outputDir: string
  let processedDir: string

  beforeEach(() => {
    tmpDir = createTmpDir()
    outputDir = path.join(tmpDir, 'output')
    processedDir = path.join(outputDir, 'processed')
    fs.mkdirSync(outputDir, { recursive: true })
    execSyncMock.mockReset()
    execSyncMock.mockImplementation(makeExiftoolMock())
    fileCounter = 0
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('file naming with HHMMSS', () => {
    it('names files with baseName_HHMMSS.ext pattern', () => {
      const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
      const photoPath = writeTempFile(tmpDir, 'DJI_0002.JPG')

      const videoMtime = new Date('2026-08-29T11:30:15Z').getTime() / 1000
      const photoMtime = new Date('2026-08-29T18:25:06Z').getTime() / 1000

      const videoFile = makeFile(videoPath, videoMtime)
      const photoFile = makeFile(photoPath, photoMtime, '.JPG')

      const jump = makeJump('jump_1', [videoFile, photoFile], {
        firstname: 'Bim',
        lastname: 'Bam',
        email: 'bim@example.com'
      })

      const manifest = makeManifest([jump], [videoFile, photoFile])
      const manifestPath = path.join(outputDir, 'manifest.json')
      saveManifest(manifestPath, manifest)

      const result = executeMedia({
        manifestPath,
        jumpIds: ['jump_1'],
        outputDir
      })

      expect(result.copied).toBe(2)
      expect(result.processedJumps).toBe(1)

      const baseName = `bim_bam_${toLocalYYYYMMDD(videoMtime)}`
      const jumpDir = path.join(processedDir, baseName)
      expect(
        fs.existsSync(path.join(jumpDir, 'videos', `${baseName}_${toLocalHHMMSS(videoMtime)}.mp4`))
      ).toBe(true)
      expect(
        fs.existsSync(path.join(jumpDir, 'photos', `${baseName}_${toLocalHHMMSS(photoMtime)}.jpg`))
      ).toBe(true)
    })

    it('uses lowercase filenames', () => {
      const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
      const videoMtime = new Date('2026-08-29T11:30:15Z').getTime() / 1000
      const videoFile = makeFile(videoPath, videoMtime)

      const jump = makeJump('jump_1', [videoFile], {
        firstname: 'Bim',
        lastname: 'Bam',
        email: 'bim@example.com'
      })

      const manifest = makeManifest([jump], [videoFile])
      const manifestPath = path.join(outputDir, 'manifest.json')
      saveManifest(manifestPath, manifest)

      executeMedia({ manifestPath, jumpIds: ['jump_1'], outputDir })

      const baseName = `bim_bam_${toLocalYYYYMMDD(videoMtime)}`
      const jumpDir = path.join(processedDir, baseName)
      const files = fs.readdirSync(path.join(jumpDir, 'videos'))
      expect(files.every((f) => f === f.toLowerCase())).toBe(true)
    })
  })

  describe('collision handling', () => {
    it('adds counter suffix when files share same capture time', () => {
      const sameMtime = new Date('2026-08-29T11:30:15Z').getTime() / 1000

      const video1Path = writeTempFile(tmpDir, 'DJI_0001.MP4', Buffer.alloc(512, 1))
      const video2Path = writeTempFile(tmpDir, 'DJI_0002.MP4', Buffer.alloc(512, 2))
      const video3Path = writeTempFile(tmpDir, 'DJI_0003.MP4', Buffer.alloc(512, 3))

      const video1 = makeFile(video1Path, sameMtime)
      const video2 = makeFile(video2Path, sameMtime)
      const video3 = makeFile(video3Path, sameMtime)

      const jump = makeJump('jump_1', [video1, video2, video3], {
        firstname: 'Bim',
        lastname: 'Bam',
        email: 'bim@example.com'
      })

      const manifest = makeManifest([jump], [video1, video2, video3])
      const manifestPath = path.join(outputDir, 'manifest.json')
      saveManifest(manifestPath, manifest)

      executeMedia({ manifestPath, jumpIds: ['jump_1'], outputDir })

      const baseName = `bim_bam_${toLocalYYYYMMDD(sameMtime)}`
      const timeStr = toLocalHHMMSS(sameMtime)
      const videosDir = path.join(processedDir, baseName, 'videos')
      const files = fs.readdirSync(videosDir).sort()

      expect(files).toEqual([
        `${baseName}_${timeStr}.mp4`,
        `${baseName}_${timeStr}_1.mp4`,
        `${baseName}_${timeStr}_2.mp4`
      ])
    })

    it('does not add counter when capture times differ', () => {
      const video1Path = writeTempFile(tmpDir, 'DJI_0001.MP4')
      const video2Path = writeTempFile(tmpDir, 'DJI_0002.MP4')

      const video1Mtime = new Date('2026-08-29T11:30:15Z').getTime() / 1000
      const video2Mtime = new Date('2026-08-29T11:33:45Z').getTime() / 1000

      const video1 = makeFile(video1Path, video1Mtime)
      const video2 = makeFile(video2Path, video2Mtime)

      const jump = makeJump('jump_1', [video1, video2], {
        firstname: 'Bim',
        lastname: 'Bam',
        email: 'bim@example.com'
      })

      const manifest = makeManifest([jump], [video1, video2])
      const manifestPath = path.join(outputDir, 'manifest.json')
      saveManifest(manifestPath, manifest)

      executeMedia({ manifestPath, jumpIds: ['jump_1'], outputDir })

      const baseName = `bim_bam_${toLocalYYYYMMDD(video1Mtime)}`
      const videosDir = path.join(processedDir, baseName, 'videos')
      const files = fs.readdirSync(videosDir).sort()

      expect(files).toEqual([
        `${baseName}_${toLocalHHMMSS(video1Mtime)}.mp4`,
        `${baseName}_${toLocalHHMMSS(video2Mtime)}.mp4`
      ])
    })
  })

  describe('skip empty subdirectories', () => {
    it('does not create videos/ dir when no video files', () => {
      const photoPath = writeTempFile(tmpDir, 'DJI_0001.JPG')
      const photoMtime = new Date('2026-08-29T18:25:06Z').getTime() / 1000
      const photoFile = makeFile(photoPath, photoMtime, '.JPG')

      const jump = makeJump('jump_1', [photoFile], {
        firstname: 'Bim',
        lastname: 'Bam',
        email: 'bim@example.com'
      })

      const manifest = makeManifest([jump], [photoFile])
      const manifestPath = path.join(outputDir, 'manifest.json')
      saveManifest(manifestPath, manifest)

      executeMedia({ manifestPath, jumpIds: ['jump_1'], outputDir })

      const jumpDir = path.join(processedDir, 'bim_bam_20260829')
      expect(fs.existsSync(path.join(jumpDir, 'photos'))).toBe(true)
      expect(fs.existsSync(path.join(jumpDir, 'videos'))).toBe(false)
    })

    it('does not create photos/ dir when no photo files', () => {
      const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
      const videoMtime = new Date('2026-08-29T11:30:15Z').getTime() / 1000
      const videoFile = makeFile(videoPath, videoMtime)

      const jump = makeJump('jump_1', [videoFile], {
        firstname: 'Bim',
        lastname: 'Bam',
        email: 'bim@example.com'
      })

      const manifest = makeManifest([jump], [videoFile])
      const manifestPath = path.join(outputDir, 'manifest.json')
      saveManifest(manifestPath, manifest)

      executeMedia({ manifestPath, jumpIds: ['jump_1'], outputDir })

      const jumpDir = path.join(processedDir, 'bim_bam_20260829')
      expect(fs.existsSync(path.join(jumpDir, 'videos'))).toBe(true)
      expect(fs.existsSync(path.join(jumpDir, 'photos'))).toBe(false)
    })
  })

  describe('.trash on re-process', () => {
    it('moves existing processed folder to .trash before creating new one', () => {
      const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
      const videoMtime = new Date('2026-08-29T11:30:15Z').getTime() / 1000
      const videoFile = makeFile(videoPath, videoMtime)

      const jump = makeJump('jump_1', [videoFile], {
        firstname: 'Bim',
        lastname: 'Bam',
        email: 'bim@example.com'
      })

      const manifest = makeManifest([jump], [videoFile])
      const manifestPath = path.join(outputDir, 'manifest.json')
      saveManifest(manifestPath, manifest)

      // First process
      executeMedia({ manifestPath, jumpIds: ['jump_1'], outputDir })

      const baseName = `bim_bam_${toLocalYYYYMMDD(videoMtime)}`
      const jumpDir = path.join(processedDir, baseName)
      const timeStr = toLocalHHMMSS(videoMtime)
      const processedFile = path.join(jumpDir, 'videos', `${baseName}_${timeStr}.mp4`)
      expect(fs.existsSync(processedFile)).toBe(true)

      // Modify the source file to simulate a change
      fs.writeFileSync(videoPath, Buffer.alloc(2048, 2))

      // Re-process
      executeMedia({ manifestPath, jumpIds: ['jump_1'], outputDir })

      // Old folder should be in .trash
      const trashDir = path.join(outputDir, '.trash')
      expect(fs.existsSync(trashDir)).toBe(true)
      const trashContents = fs.readdirSync(trashDir)
      expect(trashContents.length).toBeGreaterThan(0)

      // New processed file should exist
      expect(fs.existsSync(processedFile)).toBe(true)
    })
  })

  describe('filesystem timestamps', () => {
    it('sets file mtime to jump date + original capture time', () => {
      const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
      const captureTime = new Date('2026-08-29T11:30:15Z')
      const videoMtime = captureTime.getTime() / 1000
      const videoFile = makeFile(videoPath, videoMtime)

      const jump = makeJump('jump_1', [videoFile], {
        firstname: 'Bim',
        lastname: 'Bam',
        email: 'bim@example.com'
      })

      const manifest = makeManifest([jump], [videoFile])
      const manifestPath = path.join(outputDir, 'manifest.json')
      saveManifest(manifestPath, manifest)

      executeMedia({ manifestPath, jumpIds: ['jump_1'], outputDir })

      const baseName = `bim_bam_${toLocalYYYYMMDD(videoMtime)}`
      const timeStr = toLocalHHMMSS(videoMtime)
      const processedFile = path.join(
        processedDir,
        baseName,
        'videos',
        `${baseName}_${timeStr}.mp4`
      )
      const stat = fs.statSync(processedFile)

      // mtime should match local capture time
      const localDate = new Date(captureTime.getTime())
      const expectedTime = new Date(
        localDate.getFullYear(),
        localDate.getMonth(),
        localDate.getDate(),
        localDate.getHours(),
        localDate.getMinutes(),
        localDate.getSeconds()
      )
      expect(stat.mtime.getTime()).toBe(expectedTime.getTime())
    })
  })

  describe('passenger validation', () => {
    it('skips jump without complete passenger', () => {
      const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
      const videoMtime = new Date('2026-08-29T11:30:15Z').getTime() / 1000
      const videoFile = makeFile(videoPath, videoMtime)

      const jump = makeJump('jump_1', [videoFile], {
        firstname: 'Bim',
        lastname: '',
        email: 'bim@example.com'
      })

      const manifest = makeManifest([jump], [videoFile])
      const manifestPath = path.join(outputDir, 'manifest.json')
      saveManifest(manifestPath, manifest)

      const result = executeMedia({ manifestPath, jumpIds: ['jump_1'], outputDir })

      expect(result.copied).toBe(0)
      expect(result.processedJumps).toBe(0)
    })

    it('skips jump with no passenger', () => {
      const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
      const videoMtime = new Date('2026-08-29T11:30:15Z').getTime() / 1000
      const videoFile = makeFile(videoPath, videoMtime)

      const jump = makeJump('jump_1', [videoFile])

      const manifest = makeManifest([jump], [videoFile])
      const manifestPath = path.join(outputDir, 'manifest.json')
      saveManifest(manifestPath, manifest)

      const result = executeMedia({ manifestPath, jumpIds: ['jump_1'], outputDir })

      expect(result.copied).toBe(0)
      expect(result.processedJumps).toBe(0)
    })
  })

  describe('empty jumps', () => {
    it('skips jump with no files', () => {
      const jump = makeJump('jump_1', [], {
        firstname: 'Bim',
        lastname: 'Bam',
        email: 'bim@example.com'
      })

      const manifest = makeManifest([jump], [])
      const manifestPath = path.join(outputDir, 'manifest.json')
      saveManifest(manifestPath, manifest)

      const result = executeMedia({ manifestPath, jumpIds: ['jump_1'], outputDir })

      expect(result.copied).toBe(0)
      expect(result.processedJumps).toBe(0)
    })
  })

  describe('manifest updates', () => {
    it('marks jump as processed and clears publish', () => {
      const videoPath = writeTempFile(tmpDir, 'DJI_0001.MP4')
      const videoMtime = new Date('2026-08-29T11:30:15Z').getTime() / 1000
      const videoFile = makeFile(videoPath, videoMtime)

      const jump = makeJump('jump_1', [videoFile], {
        firstname: 'Bim',
        lastname: 'Bam',
        email: 'bim@example.com'
      })
      jump.publish = { shareUrl: 'https://example.com/old' }

      const manifest = makeManifest([jump], [videoFile])
      const manifestPath = path.join(outputDir, 'manifest.json')
      saveManifest(manifestPath, manifest)

      executeMedia({ manifestPath, jumpIds: ['jump_1'], outputDir })

      const updated = loadManifest(manifestPath)
      const updatedJump = updated?.jumps.find((j) => j.id === 'jump_1')

      expect(updatedJump?.processed).toBe(true)
      expect(updatedJump?.publish).toBeUndefined()
    })
  })
})
