// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { reclusterGroups } from '../src/clustering'
import { loadManifest, saveManifest } from '../src/manifest'
import { moveFiles } from '../src/moveFiles'
import type { Manifest, ManifestFile } from '../src/types'
import { createTmpDir } from './fixtures'

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const file = (id: string, mtime: number): ManifestFile => ({
  id,
  path: `/src/${id}.mp4`,
  filename: `${id}.mp4`,
  size: 1,
  mtime
})

const unsorted = (): Manifest => ({
  version: 1,
  createdAt: 'x',
  files: [file('a', AT), file('b', AT + 60), file('c', AT + 120)],
  groups: []
})

const made = (manifest: Manifest) => {
  expect(manifest.groups).toHaveLength(1)
  return manifest.groups[0]!
}

let dir: string | null = null

afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
  dir = null
})

describe('making a jump of files picked in Fresh files', () => {
  it('calls the jump by the name it was given', () => {
    const manifest = unsorted()

    moveFiles(manifest, new Set(['a', 'b', 'c']), { newGroup: true, name: '  4-way formation ' })

    expect(made(manifest).name).toBe('4-way formation')
  })

  it('leaves a jump with no name when none is given', () => {
    const manifest = unsorted()

    moveFiles(manifest, new Set(['a', 'b', 'c']), { newGroup: true, name: '   ' })

    expect(made(manifest).name).toBeUndefined()
  })

  it('moves every file by the same amount when the start is set, keeping the gaps', () => {
    const manifest = unsorted()
    const later = AT + 3600

    moveFiles(manifest, new Set(['a', 'b', 'c']), { newGroup: true, startsAt: later })

    const times = made(manifest).files.map((f) => f.mtime)
    expect(times).toEqual([later, later + 60, later + 120])
    expect(manifest.files.map((f) => f.mtime)).toEqual([later, later + 60, later + 120])
  })

  it('files the jump under the day its new start falls on', () => {
    const manifest = unsorted()
    const nextDay = Math.floor(new Date(2026, 7, 2, 9, 30, 0).getTime() / 1000)

    moveFiles(manifest, new Set(['a', 'b', 'c']), { newGroup: true, startsAt: nextDay })

    expect(made(manifest).day).toBe('02.08.2026')
  })

  it('keeps the times as shot when the start is left as it was', () => {
    const manifest = unsorted()

    moveFiles(manifest, new Set(['a', 'b', 'c']), { newGroup: true, startsAt: AT })

    expect(made(manifest).files.map((f) => f.mtime)).toEqual([AT, AT + 60, AT + 120])
  })
})

describe('a jump keeps its name', () => {
  it('through saving and loading the board', () => {
    dir = createTmpDir('skydock-jump-name-')
    const manifestPath = path.join(dir, 'manifest.json')
    const manifest = unsorted()
    moveFiles(manifest, new Set(['a', 'b', 'c']), { newGroup: true, name: 'Sunset load' })

    saveManifest(manifestPath, manifest)
    const loaded = loadManifest(manifestPath)

    expect(loaded?.groups.map((g) => g.name)).toEqual(['Sunset load'])
  })

  it('through a scan', () => {
    const manifest = unsorted()
    moveFiles(manifest, new Set(['a', 'b', 'c']), { newGroup: true, name: 'Sunset load' })

    reclusterGroups(manifest)

    expect(manifest.groups.map((g) => g.name)).toEqual(['Sunset load'])
  })

  it('on only one half when a scan splits it in two', () => {
    const manifest: Manifest = {
      version: 1,
      createdAt: 'x',
      files: [file('a', AT), file('b', AT + 60), file('c', AT + 7200), file('d', AT + 7260)],
      groups: []
    }
    moveFiles(manifest, new Set(['a', 'b', 'c', 'd']), { newGroup: true, name: 'Sunset load' })
    const id = made(manifest).id

    reclusterGroups(manifest)

    expect(manifest.groups).toHaveLength(2)
    expect(manifest.groups.find((g) => g.id === id)?.name).toBe('Sunset load')
    expect(manifest.groups.find((g) => g.id !== id)?.name).toBeUndefined()
  })
})
