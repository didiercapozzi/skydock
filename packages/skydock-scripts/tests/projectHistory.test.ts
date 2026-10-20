// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { readOrSetAside } from '../src/filmEdit'
import { keepEdit, keptProjectsDir } from '../src/projectHistory'
import { createTmpDir } from './fixtures'

let outputDir: string
let dir: string

const BASE = 'luc_favre_20260802'
const edit = () => path.join(dir, `${BASE}.edit.json`)
const kept = () => {
  const folder = path.join(keptProjectsDir(outputDir), 'Luc Favre')
  return fs.existsSync(folder) ? fs.readdirSync(folder).sort() : []
}

beforeEach(() => {
  outputDir = createTmpDir('skydock-history-')
  dir = path.join(outputDir, 'processed', 'Montages', 'Luc Favre')
  fs.mkdirSync(dir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
})

describe('the edit, kept aside', () => {
  it('is copied under the passenger’s name and the moment it was kept', async () => {
    fs.writeFileSync(edit(), '{"version":1,"note":"an afternoon"}')

    await keepEdit(outputDir, dir, BASE, new Date(2026, 8, 21, 18, 5, 12))

    expect(kept()).toEqual(['luc_favre_20260802-2026-09-21T18-05-12.edit.json'])
    expect(
      fs.readFileSync(path.join(keptProjectsDir(outputDir), 'Luc Favre', kept()[0]!), 'utf-8')
    ).toBe('{"version":1,"note":"an afternoon"}')
  })

  it('keeps one version of an edit that has not changed', async () => {
    fs.writeFileSync(edit(), '{"version":1}')
    await keepEdit(outputDir, dir, BASE, new Date(2026, 8, 21, 18, 5, 12))

    await keepEdit(outputDir, dir, BASE, new Date(2026, 8, 21, 18, 9, 30))

    expect(kept()).toHaveLength(1)
  })

  it('keeps the next version beside it once the edit moves on', async () => {
    fs.writeFileSync(edit(), '{"version":1,"note":"an afternoon"}')
    await keepEdit(outputDir, dir, BASE, new Date(2026, 8, 21, 18, 5, 12))
    fs.writeFileSync(edit(), '{"version":1,"note":"and an evening"}')

    await keepEdit(outputDir, dir, BASE, new Date(2026, 8, 21, 21, 40, 0))

    expect(kept()).toEqual([
      'luc_favre_20260802-2026-09-21T18-05-12.edit.json',
      'luc_favre_20260802-2026-09-21T21-40-00.edit.json'
    ])
  })

  it('keeps nothing for a montage that has no edit yet', async () => {
    expect(await keepEdit(outputDir, dir, BASE)).toBeNull()
    expect(kept()).toEqual([])
  })
})

describe('an edit that cannot be read, set aside', () => {
  it('sets an edit that cannot be read aside whole, says why, and leaves no edit in its place', async () => {
    const hours = '{"version":1,"clips":"an afternoon of work"}'
    fs.writeFileSync(edit(), hours)

    const read = await readOrSetAside(outputDir, edit())

    expect(read.edit).toBeNull()
    expect(read.setAside?.reason).toContain('clips')
    expect(fs.existsSync(edit())).toBe(false)
    const [aside] = kept()
    expect(aside).toMatch(/^luc_favre_20260802-.*\.unreadable\.json$/)
    expect(read.setAside?.as).toBe(path.join('.projects', 'Luc Favre', aside!))
    expect(
      fs.readFileSync(path.join(keptProjectsDir(outputDir), 'Luc Favre', aside!), 'utf-8')
    ).toBe(hours)
  })

  it('reads an edit that can be read, and sets nothing aside', async () => {
    fs.writeFileSync(
      edit(),
      JSON.stringify({ version: 1, clips: [], music: [], texts: [], underSound: 0.15 })
    )

    const read = await readOrSetAside(outputDir, edit())

    expect(read.edit?.clips).toEqual([])
    expect(read.setAside).toBeNull()
    expect(kept()).toEqual([])
  })
})
