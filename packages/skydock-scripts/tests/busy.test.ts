import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { busyWith } from '../src/busy'
import { processJumps } from '../src/process'
import { runUpload } from '../src/uploading'
import { createTmpDir } from './fixtures'

let outputDir: string

beforeEach(() => {
  outputDir = createTmpDir('skydock-busy-')
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const whileUploading = async (
  job: { key: string; label: string; groupIds?: string[] },
  look: () => void
) => {
  let release = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  const uploading = runUpload(job, () => gate)
  try {
    look()
  } finally {
    release()
    await uploading
  }
}

const whileProcessing = async (
  options: { groupIds?: string[]; destination?: string },
  look: () => void
) => {
  const processing = processJumps({
    ...options,
    outputDir,
    manifestPath: path.join(outputDir, 'manifest.json')
  })
  try {
    look()
  } finally {
    await processing
  }
}

describe('what is being written right now', () => {
  it('is nothing while nothing runs', () => {
    expect(busyWith({ groupIds: ['g1'], destination: 'Yverdon' })).toBeNull()
  })

  it('is a montage being uploaded, asked about by its jump', () =>
    whileUploading({ key: 'montage:g1', label: 'Luc Favre', groupIds: ['g1'] }, () => {
      expect(busyWith({ groupIds: ['g1'] })).toBe('uploading')
      expect(busyWith({ groupIds: ['g2'] })).toBeNull()
    }))

  it('is a dropzone being uploaded, asked about by its name or by one of the jumps sent', async () => {
    await whileUploading({ key: 'dest:Yverdon', label: 'Yverdon' }, () => {
      expect(busyWith({ destination: 'Yverdon' })).toBe('uploading')
      expect(busyWith({ destination: 'Colombier' })).toBeNull()
    })
    await whileUploading({ key: 'group:g1+g2', label: 'Yverdon', groupIds: ['g1', 'g2'] }, () => {
      expect(busyWith({ groupIds: ['g2'] })).toBe('uploading')
    })
  })

  it('is a dropzone being uploaded, asked about by the jumps filed there', () =>
    whileUploading({ key: 'dest:Yverdon', label: 'Yverdon', groupIds: ['y1', 'y2'] }, () => {
      expect(busyWith({ groupIds: ['y2'] })).toBe('uploading')
    }))

  it('is any upload at all, when everything is asked about', () =>
    whileUploading({ key: 'montage:g1', label: 'Luc Favre', groupIds: ['g1'] }, () => {
      expect(busyWith({})).toBe('uploading')
    }))

  it('is a jump being processed, asked about by the jump', () =>
    whileProcessing({ groupIds: ['g1'] }, () => {
      expect(busyWith({ groupIds: ['g1'] })).toBe('processing')
      expect(busyWith({ groupIds: ['g2'] })).toBeNull()
    }))

  it('is a dropzone being processed, asked about by its name', () =>
    whileProcessing({ destination: 'Yverdon' }, () => {
      expect(busyWith({ destination: 'Yverdon' })).toBe('processing')
      expect(busyWith({ destination: 'Colombier' })).toBeNull()
    }))

  it('is any processing at all, whichever jump or dropzone is asked about', () =>
    whileProcessing({}, () => {
      expect(busyWith({ groupIds: ['g2'], destination: 'Colombier' })).toBe('processing')
    }))
})
