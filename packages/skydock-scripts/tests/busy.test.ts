// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { busyWith } from '../src/busy'

/* Two kinds of work at once on the same jumps would have one rewrite what the other is reading, so
   what would touch them waits (RULES, Uploading a montage). */

afterEach(() => {
  globalThis.skydockUpload = undefined
})

const uploading = (key: string, groupIds: string[] = []) => {
  globalThis.skydockUpload = {
    key,
    label: key,
    groupIds,
    done: Promise.resolve(),
    stop: new AbortController()
  }
}

describe('what is being written right now', () => {
  it('is nothing while nothing runs', () => {
    expect(busyWith({ groupIds: ['g1'], destination: 'Yverdon' })).toBeNull()
  })

  it('is a montage being uploaded, asked about by its jump', () => {
    uploading('montage:g1', ['g1'])
    expect(busyWith({ groupIds: ['g1'] })).toBe('uploading')
    expect(busyWith({ groupIds: ['g2'] })).toBeNull()
  })

  it('is a dropzone being uploaded, asked about by its name or by one of the jumps sent', () => {
    uploading('dest:Yverdon')
    expect(busyWith({ destination: 'Yverdon' })).toBe('uploading')
    uploading('group:g1+g2', ['g1', 'g2'])
    expect(busyWith({ groupIds: ['g2'] })).toBe('uploading')
    expect(busyWith({ destination: 'Colombier' })).toBeNull()
  })

  /* a dropzone's own Process names its jumps, not the dropzone */
  it('is a dropzone being uploaded, asked about by the jumps filed there', () => {
    uploading('dest:Yverdon', ['y1', 'y2'])
    expect(busyWith({ groupIds: ['y2'] })).toBe('uploading')
  })

  it('is any upload at all, when everything is asked about', () => {
    uploading('montage:g1', ['g1'])
    expect(busyWith({})).toBe('uploading')
  })
})
