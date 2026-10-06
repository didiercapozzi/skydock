// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { subscribe } from '../src/live'
import type { LiveEvent } from '../src/live'
import { saveManifest } from '../src/manifest'
import { lookAtBoard } from '../src/manifestWatch'
import { getGroupsPath } from '../src/manifest'
import type { Manifest } from '../src/types'
import { createTmpDir } from './fixtures'

/* The board's record is written by more than the page that has it open. While a board listens, the
   pair is looked at again and again; a change that has stopped changing is told once, and what this
   process wrote itself is not told, since whoever asked has been answered with it. Each `look` here
   is one of those. */

let outputDir: string
let manifestPath: string
let heard: LiveEvent[]
let stop: () => void

const board = (label: string): Manifest => ({
  version: 1,
  createdAt: 'x',
  files: [],
  groups: [{ id: 'g1', label, day: '01.08.2026', files: [] }]
})
const told = () => heard.filter((e) => e.kind === 'board')

/* somebody else's write: the pair changed on disk without this process having made it */
const writtenElsewhere = (label: string) => {
  saveManifest(manifestPath, board(label))
  globalThis.skydockManifestWritten?.clear()
  /* make the stamp differ even within one millisecond */
  const later = new Date(Date.now() + 5000)
  fs.utimesSync(manifestPath, later, later)
  fs.utimesSync(getGroupsPath(manifestPath), later, later)
}

beforeEach(() => {
  outputDir = createTmpDir('skydock-boardwatch-')
  manifestPath = path.join(outputDir, 'manifest.json')
  saveManifest(manifestPath, board('first'))
  globalThis.skydockManifestWatch = undefined
  heard = []
  stop = subscribe((event) => heard.push(event))
})

afterEach(() => {
  stop()
  globalThis.skydockManifestWatch = undefined
  fs.rmSync(outputDir, { recursive: true, force: true })
})

describe('the board’s record changing outside the page', () => {
  it('says nothing for what is there when it begins looking', () => {
    lookAtBoard(outputDir)
    lookAtBoard(outputDir)
    lookAtBoard(outputDir)

    expect(told()).toEqual([])
  })

  it('says once, after the change has stopped changing', () => {
    lookAtBoard(outputDir)
    writtenElsewhere('second')

    lookAtBoard(outputDir)
    expect(told()).toEqual([])
    lookAtBoard(outputDir)
    lookAtBoard(outputDir)
    lookAtBoard(outputDir)

    expect(told()).toHaveLength(1)
  })

  it('does not say what this process wrote itself', () => {
    lookAtBoard(outputDir)
    saveManifest(manifestPath, board('mine'))

    for (let i = 0; i < 4; i++) lookAtBoard(outputDir)

    expect(told()).toEqual([])
  })

  it('does not take the temporary files beside the record for a change', () => {
    lookAtBoard(outputDir)
    fs.writeFileSync(`${manifestPath}.123.abc.tmp`, 'x')
    fs.writeFileSync(path.join(outputDir, 'manifest.json.before-moments'), 'x')

    for (let i = 0; i < 4; i++) lookAtBoard(outputDir)

    expect(told()).toEqual([])
  })

  it('says nothing for a pair that cannot be read: it would be an older board', () => {
    lookAtBoard(outputDir)
    writtenElsewhere('second')
    fs.writeFileSync(manifestPath, '{ not json')

    for (let i = 0; i < 4; i++) lookAtBoard(outputDir)

    expect(told()).toEqual([])
  })
})
