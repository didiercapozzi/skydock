// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  boardHistory,
  keepBoardStep,
  loadManifest,
  restoreBoard,
  saveManifest
} from '../src/manifest'
import type { Manifest } from '../src/types'
import { createTmpDir } from './fixtures'

/* The board is written whole or not at all, the last pair read whole is kept aside, and every change
   made on the board leaves a step it can be put back to (RULES, Going back). */

let dir = ''
let manifestPath = ''

beforeEach(() => {
  dir = createTmpDir('skydock-history-')
  manifestPath = path.join(dir, 'manifest.json')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const board = (jumps: string[]): Manifest => {
  const files = jumps.map((id) => ({
    id,
    path: `/o/${id}.MP4`,
    filename: `${id}.MP4`,
    size: 1,
    mtime: 1
  }))
  return {
    version: 2,
    createdAt: 'x',
    files,
    groups: jumps.map((id) => ({
      id: `g-${id}`,
      label: id,
      day: '01.08.2026',
      files: [files.find((f) => f.id === id)!]
    }))
  }
}

/* a change somebody makes on the board: a step kept, then the board saved */
const change = (to: Manifest) => {
  keepBoardStep(manifestPath)
  saveManifest(manifestPath, to)
}

describe('the board on the disk', () => {
  it('is read from the last pair read whole when the registry is found broken', () => {
    saveManifest(manifestPath, board(['a']))
    saveManifest(manifestPath, board(['a', 'b']))
    fs.writeFileSync(manifestPath, '{broken')

    expect(loadManifest(manifestPath)?.groups.map((g) => g.id)).toEqual(['g-a', 'g-b'])
  })

  it('is read from the last pair read whole when its jumps are found broken', () => {
    saveManifest(manifestPath, board(['a']))
    saveManifest(manifestPath, board(['a', 'b']))
    fs.writeFileSync(path.join(dir, 'groups.json'), '{broken')

    expect(loadManifest(manifestPath)?.groups.map((g) => g.id)).toEqual(['g-a', 'g-b'])
  })
})

describe('going back', () => {
  it('lists the earlier states of the board, the latest first', () => {
    change(board(['a']))
    change(board(['a', 'b']))
    change(board(['a', 'b', 'c']))

    expect(boardHistory(manifestPath).map((step) => step.jumps)).toEqual([2, 1])
  })

  /* a camera copy saves the board file by file, and must not push the changes made by hand out */
  it('keeps no step for a save nobody asked for on the board', () => {
    change(board(['a']))
    change(board(['a', 'b']))
    saveManifest(manifestPath, board(['a', 'b', 'c']))
    saveManifest(manifestPath, board(['a', 'b', 'c', 'd']))

    expect(boardHistory(manifestPath).map((step) => step.jumps)).toEqual([1])
  })

  it('puts the board back as it was, and can itself be undone', () => {
    change(board(['a']))
    change(board(['a', 'b']))
    const [earlier] = boardHistory(manifestPath)

    restoreBoard(manifestPath, earlier!.step)

    expect(loadManifest(manifestPath)?.groups).toHaveLength(1)
    expect(boardHistory(manifestPath)[0]?.jumps).toBe(2)
  })
})
