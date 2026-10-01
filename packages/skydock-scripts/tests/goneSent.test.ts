// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { goneSent } from '../src/upload'
import type { ManifestGroup } from '../src/types'

/* What an upload handed over that the storage no longer has — the whole of where each item went, not
   only each part's first place — so the card that lists what was handed over says so (RULES, A place is
   connected to its folder). */

const record = {
  at: 1,
  sent: [
    { name: 'a.mp4', holds: ['film'], to: ['/D/ana'], size: 3 },
    { name: 'a.project.zip', holds: ['project'], to: ['/Backup/ana', '/D/ana'], size: 1, zip: true }
  ]
} as unknown as ManifestGroup['uploaded']

describe('what was handed over and is gone', () => {
  it('is an item a folder that answered no longer lists', () => {
    const remote = {
      dirs: ['/D/ana', '/Backup/ana'],
      sizes: { '/D/ana/a.mp4': 3, '/Backup/ana/a.project.zip': 1 }
    }

    expect(goneSent(record, remote)).toEqual(['/D/ana/a.project.zip'])
  })

  it('says nothing of a folder that did not answer: a failed listing is no evidence', () => {
    expect(goneSent(record, { dirs: ['/D/ana'], sizes: { '/D/ana/a.mp4': 3 } })).toEqual([
      '/D/ana/a.project.zip'
    ])
    expect(goneSent(record, { dirs: [], sizes: {} })).toEqual([])
  })

  it('says nothing before the storage was looked at', () => {
    expect(goneSent(record, null)).toEqual([])
  })
})
