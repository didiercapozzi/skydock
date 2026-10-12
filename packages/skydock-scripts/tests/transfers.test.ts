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
  it('is empty until something has been sent', async () => {
    expect(await readTransfers(outputDir)).toEqual([])
  })

  it('keeps each transfer with what it was of and how it ended, the latest first', async () => {
    await recordTransfer(
      { kind: 'upload', label: 'Luc Favre', state: 'done', items: [item('a.mp4')] },
      outputDir
    )
    await recordTransfer(
      { kind: 'camera', label: 'OsmoNano', state: 'failed', reason: 'card gone', items: [] },
      outputDir
    )

    const [latest, earlier] = await readTransfers(outputDir)

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

  it('keeps the latest few, forgetting the oldest', async () => {
    for (let n = 0; n < KEPT + 5; n++)
      await recordTransfer(
        { kind: 'import', label: `drop ${n}`, state: 'done', items: [] },
        outputDir
      )

    const kept = await readTransfers(outputDir)

    expect(kept).toHaveLength(KEPT)
    expect(kept[0]!.label).toBe(`drop ${KEPT + 4}`)
    expect(kept.at(-1)!.label).toBe('drop 5')
  })

  it('keeps what did something and counts the files that were only there already', async () => {
    const done = Array.from({ length: 10 }, (_, n) => item(`new${n}.MP4`))
    const there = Array.from({ length: ITEMS_KEPT + 100 }, (_, n) => item(`old${n}.MP4`, 'skipped'))

    const made = await recordTransfer(
      { kind: 'camera', label: 'GoPro', state: 'done', items: [...done, ...there], passedOver: 7 },
      outputDir
    )

    expect(made.items).toHaveLength(ITEMS_KEPT)
    expect(made.items.filter((i) => i.result === 'done')).toHaveLength(10)
    expect(made.passedOver).toBe(7 + 100 + 10)
    expect(made.more).toBeUndefined()
  })

  it('says how many that did something are not listed, when even those are too many', async () => {
    const many = Array.from({ length: ITEMS_KEPT + 25 }, (_, n) => item(`f${n}.MP4`))

    const made = await recordTransfer(
      { kind: 'import', label: 'Yverdon', state: 'done', items: many },
      outputDir
    )

    expect(made.items).toHaveLength(ITEMS_KEPT)
    expect(made.more).toBe(25)
  })

  it('reads a file it cannot make sense of as no history, rather than failing', async () => {
    fs.mkdirSync(path.dirname(getTransfersPath(outputDir)), { recursive: true })
    fs.writeFileSync(getTransfersPath(outputDir), '{not json')

    expect(await readTransfers(outputDir)).toEqual([])
  })

  it('is forgotten when cleared, and nothing else is touched', async () => {
    await recordTransfer({ kind: 'upload', label: 'x', state: 'done', items: [] }, outputDir)
    const other = path.join(outputDir, 'manifest.json')
    fs.writeFileSync(other, '{}')

    await clearTransfers(outputDir)

    expect(await readTransfers(outputDir)).toEqual([])
    expect(fs.existsSync(other)).toBe(true)
  })

  it('keeps both of two transfers that end together', async () => {
    await Promise.all([
      recordTransfer({ kind: 'upload', label: 'a', state: 'done', items: [] }, outputDir),
      recordTransfer({ kind: 'camera', label: 'b', state: 'done', items: [] }, outputDir)
    ])

    expect(await readTransfers(outputDir)).toHaveLength(2)
  })

  it('forgets one transfer and keeps the others', async () => {
    const first = await recordTransfer(
      { kind: 'upload', label: 'a', state: 'done', items: [] },
      outputDir
    )
    await recordTransfer({ kind: 'camera', label: 'b', state: 'done', items: [] }, outputDir)

    await removeTransfer(first.id, outputDir)

    expect((await readTransfers(outputDir)).map((t) => t.label)).toEqual(['b'])
  })
})
