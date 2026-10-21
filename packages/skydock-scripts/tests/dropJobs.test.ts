// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { beginDrop, dropRow, endDrop, stopDrop, stopDropFile, wanted } from '../src/dropJobs'
import { subscribe } from '../src/live'
import type { LiveEvent } from '../src/live'
import { mergeRow } from '../src/liveShape'
import type { JobRow } from '../src/liveShape'

const FILES = [
  { key: 'drop-0', name: 'a.mp4', size: 10 },
  { key: 'drop-1', name: 'b.mp4', size: 20 },
  { key: 'drop-2', name: 'c.mp4', size: 30 }
]

const heard: LiveEvent[] = []
let unsubscribe = () => {}
let batch = ''

const begin = () => {
  batch = crypto.randomUUID()
  unsubscribe = subscribe((event) => event.kind === 'job' && heard.push(event))
  return beginDrop({ batch, where: 'Fresh files', files: FILES })
}

const lastRows = () => {
  let known: JobRow[] = []
  for (const event of heard) {
    if (event.kind !== 'job') continue
    if (event.rows) known = event.rows
    if (event.row) known = mergeRow(known, event.row)
  }
  return Object.fromEntries(known.map((row) => [row.key, row]))
}

afterEach(() => {
  endDrop(batch)
  unsubscribe()
  heard.length = 0
})

describe('cancelling files being added from the computer', () => {
  it('leaves one file out on its own, and says so on its row', () => {
    const job = begin()

    expect(stopDropFile(job, 'drop-1')).toBe(true)

    expect(wanted(batch, 'drop-1')).toEqual({ go: false, stopped: false })
    expect(wanted(batch, 'drop-0')).toEqual({ go: true, stopped: false })
    expect(lastRows()['drop-1']).toMatchObject({ at: 'skipped', note: 'Cancelled' })
    expect(lastRows()['drop-0']).toMatchObject({ at: 'later' })
  })

  it('leaves out every file not yet done when the whole list is cancelled, and keeps what is done', () => {
    const job = begin()
    dropRow(batch, { key: 'drop-0', at: 'done' })

    expect(stopDrop(job)).toBe(true)

    expect(wanted(batch, 'drop-2')).toEqual({ go: false, stopped: true })
    expect(lastRows()['drop-0']).toMatchObject({ at: 'done' })
    expect(lastRows()['drop-1']).toMatchObject({ at: 'skipped', note: 'Cancelled' })
    expect(lastRows()['drop-2']).toMatchObject({ at: 'skipped', note: 'Cancelled' })
  })

  it('ends a cancelled list as stopped, with what was copied', () => {
    const job = begin()
    dropRow(batch, { key: 'drop-0', at: 'done' })
    stopDrop(job)

    endDrop(batch)

    const ended = [...heard]
      .reverse()
      .find((event) => event.kind === 'job' && event.stage === 'done')
    expect(ended).toMatchObject({ outcome: { state: 'stopped', copied: 1, skipped: 0 } })
  })

  it('refuses to cancel a file already copied', () => {
    const job = begin()
    dropRow(batch, { key: 'drop-0', at: 'done' })

    expect(stopDropFile(job, 'drop-0')).toBe(false)
  })
})
