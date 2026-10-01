// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearTransfers,
  removeTransfer,
  getTransfersPath,
  ITEMS_KEPT,
  KEPT,
  readTransfers,
  recordTransfer
} from '../src/transfers'
import type { TransferItem } from '../src/transfers'
import { createTmpDir } from './fixtures'

/* What was sent, copied in and copied off is kept after it is done, so the panel that showed it going
   can be opened again to see what happened (RULES, Transfers). */

let outputDir: string

beforeEach(() => {
  outputDir = createTmpDir('skydock-transfers-')
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
})

const item = (name: string, result: TransferItem['result'] = 'done'): TransferItem => ({
  name,
  size: 10,
  result
})

describe('the history of transfers', () => {
  it('is empty until something has been sent', () => {
    expect(readTransfers(outputDir)).toEqual([])
  })

  it('keeps each transfer with what it was of and how it ended, the latest first', () => {
    recordTransfer(
      { kind: 'upload', label: 'Luc Favre', state: 'done', items: [item('a.mp4')] },
      outputDir
    )
    recordTransfer(
      { kind: 'camera', label: 'OsmoNano', state: 'failed', reason: 'card gone', items: [] },
      outputDir
    )

    const [latest, earlier] = readTransfers(outputDir)

    expect(latest).toMatchObject({
      kind: 'camera',
      label: 'OsmoNano',
      state: 'failed',
      reason: 'card gone'
    })
    expect(earlier).toMatchObject({ kind: 'upload', label: 'Luc Favre', items: [item('a.mp4')] })
    expect(latest!.at).toBeGreaterThan(0)
    expect(latest!.id).not.toBe(earlier!.id)
  })

  it('keeps the latest few, forgetting the oldest', () => {
    for (let n = 0; n < KEPT + 5; n++)
      recordTransfer({ kind: 'import', label: `drop ${n}`, state: 'done', items: [] }, outputDir)

    const kept = readTransfers(outputDir)

    expect(kept).toHaveLength(KEPT)
    expect(kept[0]!.label).toBe(`drop ${KEPT + 4}`)
    expect(kept.at(-1)!.label).toBe('drop 5')
  })

  /* a card copied off can be thousands of files: what did something is kept, the rest is counted */
  it('keeps what did something and counts the files that were only there already', () => {
    const done = Array.from({ length: 10 }, (_, n) => item(`new${n}.MP4`))
    const there = Array.from({ length: ITEMS_KEPT + 100 }, (_, n) => item(`old${n}.MP4`, 'skipped'))

    const made = recordTransfer(
      { kind: 'camera', label: 'GoPro', state: 'done', items: [...done, ...there], passedOver: 7 },
      outputDir
    )

    expect(made.items).toHaveLength(ITEMS_KEPT)
    expect(made.items.filter((i) => i.result === 'done')).toHaveLength(10)
    expect(made.passedOver).toBe(7 + 100 + 10)
    expect(made.more).toBeUndefined()
  })

  it('says how many that did something are not listed, when even those are too many', () => {
    const many = Array.from({ length: ITEMS_KEPT + 25 }, (_, n) => item(`f${n}.MP4`))

    const made = recordTransfer(
      { kind: 'import', label: 'Yverdon', state: 'done', items: many },
      outputDir
    )

    expect(made.items).toHaveLength(ITEMS_KEPT)
    expect(made.more).toBe(25)
  })

  it('reads a file it cannot make sense of as no history, rather than failing', () => {
    fs.mkdirSync(path.dirname(getTransfersPath(outputDir)), { recursive: true })
    fs.writeFileSync(getTransfersPath(outputDir), '{not json')

    expect(readTransfers(outputDir)).toEqual([])
  })

  it('is forgotten when cleared, and nothing else is touched', () => {
    recordTransfer({ kind: 'upload', label: 'x', state: 'done', items: [] }, outputDir)
    const other = path.join(outputDir, 'manifest.json')
    fs.writeFileSync(other, '{}')

    clearTransfers(outputDir)

    expect(readTransfers(outputDir)).toEqual([])
    expect(fs.existsSync(other)).toBe(true)
  })

  it('forgets one transfer and keeps the others', () => {
    const first = recordTransfer(
      { kind: 'upload', label: 'a', state: 'done', items: [] },
      outputDir
    )
    recordTransfer({ kind: 'camera', label: 'b', state: 'done', items: [] }, outputDir)

    removeTransfer(first.id, outputDir)

    expect(readTransfers(outputDir).map((t) => t.label)).toEqual(['b'])
  })
})
