// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gatherArrivals, putOnBoard } from '../src/arrivals'
import { computeFileId } from '../src/fileId'
import { flushBoardChanges, loadManifestAsync, saveManifest } from '../src/manifest'
import { getManifestPath } from '../src/utils'
import { createTmpDir } from './fixtures'

let outputDir: string

beforeEach(() => {
  outputDir = createTmpDir('skydock-arrivals-')
  saveManifest(getManifestPath(outputDir), { version: 2, createdAt: 'x', files: [], groups: [] })
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
})

const landed = async (name: string, at: Date, fill: number) => {
  const dest = path.join(outputDir, 'original_files', '2026-08-01', name)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, Buffer.alloc(16, fill))
  fs.utimesSync(dest, at, at)
  return { dest, id: await computeFileId(dest), shot: Math.floor(at.getTime() / 1000) }
}

const board = async () => {
  await flushBoardChanges(getManifestPath(outputDir))
  return (await loadManifestAsync(getManifestPath(outputDir)))!
}

describe('a file off a camera', () => {
  it('is on the board, loose in Fresh files, as it lands', async () => {
    const one = await landed('GX010001.MP4', new Date(2026, 7, 1, 10, 0, 0), 1)

    putOnBoard(outputDir, one)

    expect((await board()).files).toMatchObject([
      { id: one.id, filename: 'GX010001.MP4', path: one.dest }
    ])
    expect((await board()).groups).toEqual([])
  })

  it('is put on the board once, however often it is handed over', async () => {
    const one = await landed('GX010001.MP4', new Date(2026, 7, 1, 10, 0, 0), 1)
    putOnBoard(outputDir, one)
    await board()
    putOnBoard(outputDir, one)

    expect((await board()).files).toHaveLength(1)
  })
})

describe('what came off a card, once it is done', () => {
  it('is gathered into jumps by the gap rule, leaving what was filed meanwhile where it is', async () => {
    const a = await landed('GX010001.MP4', new Date(2026, 7, 1, 10, 0, 0), 1)
    const b = await landed('GX010002.MP4', new Date(2026, 7, 1, 10, 2, 0), 2)
    const c = await landed('GX010003.MP4', new Date(2026, 7, 1, 10, 3, 0), 3)
    for (const one of [a, b, c]) putOnBoard(outputDir, one)
    const filed = await board()
    filed.files = filed.files.map((f) => (f.id === c.id ? { ...f, destination: 'Yverdon' } : f))
    saveManifest(getManifestPath(outputDir), filed)

    await gatherArrivals(outputDir, [a.id, b.id, c.id])

    expect((await board()).groups.map((g) => g.files.map((f) => f.id))).toEqual([[a.id, b.id]])
  })
})

describe('many files landing together', () => {
  it('are all on the board, none is lost', async () => {
    const files = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        landed(`GX0100${String(i).padStart(2, '0')}.MP4`, new Date(2026, 7, 1, 10, i, 0), i + 1)
      )
    )
    for (const one of files) putOnBoard(outputDir, one)

    expect((await board()).files).toHaveLength(20)
  })
})
