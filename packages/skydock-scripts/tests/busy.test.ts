import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { busyWith, jumpsOfMontage, scopeOfFiles } from '../src/busy'
import { processJumps } from '../src/process'
import { runUpload } from '../src/uploading'
import type { Manifest } from '../src/types'
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

  it('is a run of processing waiting its turn, as well as the one going', async () => {
    const waiting = processJumps({
      groupIds: ['g2'],
      outputDir,
      manifestPath: path.join(outputDir, 'manifest.json')
    })
    await whileProcessing({ groupIds: ['g1'] }, () => {
      expect(busyWith({ groupIds: ['g2'] })).toBe('processing')
    })
    await waiting
  })

  it('is a film being rendered, for its own montage only — never the whole board', () => {
    globalThis.skydockRendering = new Map([['g1', new AbortController()]])
    try {
      expect(busyWith({ groupIds: ['g1'] })).toBe('rendering')
      expect(busyWith({ groupIds: ['g2'] })).toBeNull()
      expect(busyWith({ destination: 'Yverdon' })).toBeNull()
      expect(busyWith({})).toBeNull()
    } finally {
      globalThis.skydockRendering = undefined
    }
  })

  it('counts only the kinds of work asked about', () =>
    whileUploading({ key: 'montage:g1', label: 'Luc Favre', groupIds: ['g1'] }, () => {
      expect(busyWith({ groupIds: ['g1'] }, ['process', 'render'])).toBeNull()
      expect(busyWith({ groupIds: ['g1'] }, ['upload'])).toBe('uploading')
    }))
})

describe('what a change touches', () => {
  const manifest: Manifest = {
    version: 1,
    createdAt: '2026-08-08',
    files: [
      { id: 'a', path: '/o/a.mp4', filename: 'a.mp4', size: 1, mtime: 1 },
      { id: 'b', path: '/o/b.mp4', filename: 'b.mp4', size: 1, mtime: 2, destination: 'Yverdon' },
      { id: 'c', path: '/o/a.mp4', filename: 'a.mp4', size: 1, mtime: 1, copyOf: 'a' }
    ],
    groups: [
      {
        id: 'm1',
        label: 'jump',
        day: '08.08.2026',
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        files: [{ id: 'c', path: '/o/a.mp4', filename: 'a.mp4', size: 1, mtime: 1, copyOf: 'a' }]
      },
      {
        id: 'm2',
        label: 'jump',
        day: '08.08.2026',
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        files: []
      },
      { id: 'other', label: 'jump', day: '08.08.2026', destination: 'Yverdon', files: [] }
    ],
    destinations: [{ name: 'Yverdon' }]
  }

  it('putting files in the bin holds the jumps holding a copy of them, and the places they are filed to', () => {
    expect(scopeOfFiles(manifest, new Set(['a', 'b']))).toEqual({
      groupIds: ['m1'],
      destinations: ['Yverdon']
    })
  })

  it('a montage is every jump whose copies go into its folder', () => {
    expect(jumpsOfMontage(manifest, outputDir, 'm1')).toEqual(['m1', 'm2'])
    expect(jumpsOfMontage(manifest, outputDir, 'other')).toEqual(['other'])
  })
})
