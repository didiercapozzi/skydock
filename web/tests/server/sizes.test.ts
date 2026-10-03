// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { afterNote, estimatedSize } from '../../app/helpers/sizes'
import type { ManifestFile } from '../../app/components/types'

/* What a file will weigh once it is processed: the copy's own size once there is one, else an estimate
   marked with a tilde — the kept share of the time for a trim, which copies the stream. */

const MB = 1024 * 1024
const file = (extra: Partial<ManifestFile> = {}): ManifestFile => ({
  id: 'a',
  path: '/o/a.MP4',
  filename: 'a.MP4',
  size: 1000 * MB,
  mtime: 1,
  ...extra
})

describe('the size after processing', () => {
  it('is the share of the time that is kept, for a trim', () => {
    expect(estimatedSize({ size: 1000 * MB, kept: 0.25 })).toBe(250 * MB)
  })

  it('also takes the share of the picture that is kept, roughly, for a frame', () => {
    expect(estimatedSize({ size: 1000 * MB, frame: { x: 0, y: 0, width: 0.5, height: 0.5 } })).toBe(
      250 * MB
    )
  })

  it('says nothing when nothing changes', () => {
    expect(afterNote(file())).toBe('')
  })

  it('is estimated, and says so, before it is processed', () => {
    expect(afterNote(file({ cropStart: 10 }), { kept: 0.5 })).toBe(' → ~500 MB')
  })

  it('is the copy’s own size once it is processed with the settings the file has now', () => {
    const made = {
      path: '/p/a.mp4',
      size: 480 * MB,
      at: 1,
      source: { size: 1000 * MB, mtime: 1, cropStart: 10, cropEnd: null }
    }
    expect(afterNote(file({ cropStart: 10, processed: made }))).toBe(' → 480 MB')
    /* a copy made with other settings is no answer for these */
    expect(afterNote(file({ cropStart: 20, processed: made }), { kept: 0.5 })).toBe(' → ~500 MB')
  })
})
