import { describe, it, expect } from 'vitest'
import { getSequences, formatSequenceDate, formatSequenceTime } from '../app/lib/sequences'
import type { Manifest, ManifestFile } from '../app/lib/types'

describe('formatSequenceDate', () => {
  it('formats epoch to day month year', () => {
    const epoch = new Date('2026-08-22T12:00:00Z').getTime() / 1000
    const result = formatSequenceDate(epoch)
    expect(result).toMatch(/^\d+ \d+ \d+$/)
  })
})

describe('formatSequenceTime', () => {
  it('formats epoch to HH:MM', () => {
    const epoch = new Date('2026-08-22T12:30:00Z').getTime() / 1000
    const result = formatSequenceTime(epoch)
    expect(result).toMatch(/\d{2}:\d{2}/)
  })
})

describe('getSequences', () => {
  const makeFile = (path: string, camera: 'PHOTO' | 'VIDEO', mtime: number): ManifestFile => ({
    path,
    camera,
    mtime,
    size: 1000,
    filename: path.split('/').pop() ?? ''
  })

  const makeManifest = (files: ManifestFile[]): Manifest => ({
    version: 1,
    status: 'proposed',
    date: '2026-08-22',
    startDatetime: '2026-08-22T09:00:00Z',
    createdAt: new Date().toISOString(),
    camera1: { path: '/camera1', fileCount: 0 },
    camera2: { path: '/camera2', fileCount: 0 },
    theory: [],
    jumps: [],
    files
  })

  it('returns empty array for empty manifest', () => {
    const manifest = makeManifest([])
    const sequences = getSequences(manifest, 'PHOTO')
    expect(sequences).toEqual([])
  })

  it('returns empty array when files is undefined', () => {
    const manifest = { ...makeManifest([]), files: undefined } as unknown as Manifest
    const sequences = getSequences(manifest, 'PHOTO')
    expect(sequences).toEqual([])
  })

  it('filters files by camera type', () => {
    const manifest = makeManifest([
      makeFile('/photo1.jpg', 'PHOTO', 1000),
      makeFile('/video1.mp4', 'VIDEO', 1000)
    ])
    const photoSequences = getSequences(manifest, 'PHOTO')
    const videoSequences = getSequences(manifest, 'VIDEO')
    expect(photoSequences).toHaveLength(1)
    expect(photoSequences[0].files).toHaveLength(1)
    expect(photoSequences[0].files[0].path).toBe('/photo1.jpg')
    expect(videoSequences).toHaveLength(1)
    expect(videoSequences[0].files).toHaveLength(1)
    expect(videoSequences[0].files[0].path).toBe('/video1.mp4')
  })

  it('groups files into one sequence when within 15 minutes', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const manifest = makeManifest([
      makeFile('/photo1.jpg', 'PHOTO', baseTime),
      makeFile('/photo2.jpg', 'PHOTO', baseTime + 300),
      makeFile('/photo3.jpg', 'PHOTO', baseTime + 600)
    ])
    const sequences = getSequences(manifest, 'PHOTO')
    expect(sequences).toHaveLength(1)
    expect(sequences[0].files).toHaveLength(3)
  })

  it('splits into multiple sequences when gap exceeds 15 minutes', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const manifest = makeManifest([
      makeFile('/photo1.jpg', 'PHOTO', baseTime),
      makeFile('/photo2.jpg', 'PHOTO', baseTime + 300),
      makeFile('/photo3.jpg', 'PHOTO', baseTime + 1500)
    ])
    const sequences = getSequences(manifest, 'PHOTO')
    expect(sequences).toHaveLength(2)
    expect(sequences[0].files).toHaveLength(2)
    expect(sequences[1].files).toHaveLength(1)
  })

  it('sorts files by mtime', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const manifest = makeManifest([
      makeFile('/photo3.jpg', 'PHOTO', baseTime + 600),
      makeFile('/photo1.jpg', 'PHOTO', baseTime),
      makeFile('/photo2.jpg', 'PHOTO', baseTime + 300)
    ])
    const sequences = getSequences(manifest, 'PHOTO')
    expect(sequences[0].files[0].path).toBe('/photo1.jpg')
    expect(sequences[0].files[1].path).toBe('/photo2.jpg')
    expect(sequences[0].files[2].path).toBe('/photo3.jpg')
  })

  it('generates unique sequence ids', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const manifest = makeManifest([
      makeFile('/photo1.jpg', 'PHOTO', baseTime),
      makeFile('/photo2.jpg', 'PHOTO', baseTime + 1000)
    ])
    const sequences = getSequences(manifest, 'PHOTO')
    expect(sequences[0].id).toBe('seq_PHOTO_0')
    expect(sequences[1].id).toBe('seq_PHOTO_1')
  })

  it('handles mixed cameras correctly', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const manifest = makeManifest([
      makeFile('/photo1.jpg', 'PHOTO', baseTime),
      makeFile('/photo2.jpg', 'PHOTO', baseTime + 300),
      makeFile('/video1.mp4', 'VIDEO', baseTime),
      makeFile('/video2.mp4', 'VIDEO', baseTime + 300)
    ])
    const photoSequences = getSequences(manifest, 'PHOTO')
    const videoSequences = getSequences(manifest, 'VIDEO')
    expect(photoSequences).toHaveLength(1)
    expect(photoSequences[0].files).toHaveLength(2)
    expect(videoSequences).toHaveLength(1)
    expect(videoSequences[0].files).toHaveLength(2)
  })

  it('sets correct startTime and endTime', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const manifest = makeManifest([
      makeFile('/photo1.jpg', 'PHOTO', baseTime),
      makeFile('/photo2.jpg', 'PHOTO', baseTime + 300)
    ])
    const sequences = getSequences(manifest, 'PHOTO')
    expect(sequences[0].startTime).toBe(baseTime)
    expect(sequences[0].endTime).toBe(baseTime + 300)
  })
})
