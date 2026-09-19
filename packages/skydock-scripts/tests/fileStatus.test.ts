// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { fileStatus, scopeStatus, uploadGate } from '../src/fileStatus'
import type { ManifestFile } from '../src/types'

const base = (over: Partial<ManifestFile> = {}): ManifestFile => ({
  path: '/src/a.mp4',
  size: 100,
  mtime: 1_700_000_000,
  filename: 'a.mp4',
  id: 'id-a',
  ...over
})

const processed = (over: Partial<ManifestFile> = {}) =>
  base({
    processed: {
      path: '/out/processed/Yverdon/a.mp4',
      size: 90,
      at: 1_700_000_100,
      source: { id: 'id-a', size: 100, mtime: 1_700_000_000, cropStart: null, cropEnd: null }
    },
    ...over
  })

const uploaded = (over: Partial<ManifestFile> = {}) =>
  processed({
    uploaded: {
      remotePath: '/home/Yverdon/a.mp4',
      md5: 'abc',
      size: 90,
      localPath: '/out/processed/Yverdon/a.mp4',
      at: 1_700_000_200
    },
    ...over
  })

const onDisk = { exists: true, size: 90 }

describe('a file’s state', () => {
  it('is local with no record at all', () => {
    expect(fileStatus(base())).toBe('local')
  })

  it('is processed once a copy was written from the current source', () => {
    expect(fileStatus(processed(), { output: onDisk })).toBe('processed')
  })

  it('drops back to local when the file is cropped after processing', () => {
    expect(fileStatus(processed(), { crop: { cropStart: 2, cropEnd: 9 }, output: onDisk })).toBe(
      'local'
    )
  })

  it('drops back to local when the time is shifted after processing', () => {
    expect(fileStatus(processed({ mtime: 1_700_009_999 }), { output: onDisk })).toBe('local')
  })

  it('drops back to local when the bytes change under it', () => {
    expect(fileStatus(processed({ id: 'id-other' }), { output: onDisk })).toBe('local')
    expect(fileStatus(processed({ size: 101 }), { output: onDisk })).toBe('local')
  })

  it('drops back to local when the processed copy is gone from disk', () => {
    expect(fileStatus(processed(), { output: { exists: false, size: 0 } })).toBe('local')
  })

  it('drops back to local when the copy on disk is a different size', () => {
    expect(fileStatus(processed(), { output: { exists: true, size: 12 } })).toBe('local')
  })

  it('does not demote a copy whose size was never recorded', () => {
    const legacy = processed()
    legacy.processed!.size = 0
    expect(fileStatus(legacy, { output: { exists: true, size: 4321 } })).toBe('processed')
  })

  it('stays uploaded while the storage still holds it at the size sent', () => {
    const remote = { dirs: ['/home/Yverdon'], sizes: { '/home/Yverdon/a.mp4': 90 } }
    expect(fileStatus(uploaded(), { output: onDisk, remote })).toBe('uploaded')
  })

  it('falls back to processed when the storage no longer holds it', () => {
    const remote = { dirs: ['/home/Yverdon'], sizes: {} }
    expect(fileStatus(uploaded(), { output: onDisk, remote })).toBe('processed')
  })

  it('drops to processed when the remote copy is a different size', () => {
    const remote = { dirs: ['/home/Yverdon'], sizes: { '/home/Yverdon/a.mp4': 5 } }
    expect(fileStatus(uploaded(), { output: onDisk, remote })).toBe('processed')
  })

  /* the three ways of knowing nothing — none of them may destroy a proven upload */
  it('stays uploaded when the storage was never asked', () => {
    expect(fileStatus(uploaded(), { output: onDisk, remote: null })).toBe('uploaded')
  })

  it('stays uploaded when that folder was not among the ones listed', () => {
    const remote = { dirs: ['/home/Colombier'], sizes: {} }
    expect(fileStatus(uploaded(), { output: onDisk, remote })).toBe('uploaded')
  })

  it('stays uploaded when the storage reported no size for it', () => {
    const remote = { dirs: ['/home/Yverdon'], sizes: { '/home/Yverdon/a.mp4': null } }
    expect(fileStatus(uploaded(), { output: onDisk, remote })).toBe('uploaded')
  })

  it('drops to processed when a different copy was re-processed under the upload', () => {
    const file = uploaded()
    file.processed!.path = '/out/processed/Yverdon/a_1.mp4'
    expect(fileStatus(file, { output: onDisk })).toBe('processed')
  })

  it('reads local before uploaded when the source moved on, even with an upload record', () => {
    expect(fileStatus(uploaded({ mtime: 5 }), { output: onDisk })).toBe('local')
  })
})

/* a turn is part of what the copy was made from, like the trim and the frame */
describe('a turned file', () => {
  it('reads as changed once turned after it was processed', () => {
    expect(fileStatus(processed({ rotation: 90 }), { output: onDisk })).toBe('local')
  })

  it('reads as processed when the copy was made turned the same way', () => {
    const turned = processed({ rotation: 90 })
    turned.processed!.source.rotation = 90
    expect(fileStatus(turned, { output: onDisk })).toBe('processed')
  })

  it('takes the turn from where the file is drawn, like the crop', () => {
    expect(
      fileStatus(processed(), {
        output: onDisk,
        crop: { cropStart: null, cropEnd: null, rotation: 180 }
      })
    ).toBe('local')
  })
})

describe('nothing is uploaded until everything in it is processed', () => {
  const files = [base(), processed(), uploaded()]
  const context = (file: ManifestFile) => ({
    output: file.processed ? onDisk : undefined,
    remote: { dirs: ['/home/Yverdon'], sizes: { '/home/Yverdon/a.mp4': 90 } }
  })

  it('counts each state', () => {
    expect(scopeStatus(files, context)).toEqual({
      local: 1,
      processed: 1,
      uploaded: 1,
      total: 3
    })
  })

  it('blocks the upload and names how many need processing', () => {
    expect(uploadGate(files, context)).toEqual({
      blocked: true,
      needProcessing: 1,
      message: '1 file needs processing'
    })
  })

  it('says plainly how many files wait', () => {
    expect(uploadGate([base(), base()], context).message).toBe('2 files need processing')
  })

  it('lets everything through when nothing is local', () => {
    expect(uploadGate([processed(), uploaded()], context)).toEqual({
      blocked: false,
      needProcessing: 0,
      message: null
    })
  })
})
