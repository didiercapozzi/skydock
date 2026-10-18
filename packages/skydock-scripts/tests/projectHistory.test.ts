// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { keepProject, keptProjectsDir } from '../src/projectHistory'
import { createTmpDir } from './fixtures'

let outputDir: string
let dir: string

const BASE = 'luc_favre_20260802'
const project = () => path.join(dir, `${BASE}.kdenlive`)
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
    fs.writeFileSync(project(), '<mlt>an afternoon</mlt>')

    await keepProject(outputDir, dir, BASE, new Date(2026, 8, 21, 18, 5, 12))

    expect(kept()).toEqual(['luc_favre_20260802-2026-09-21T18-05-12.kdenlive'])
    expect(
      fs.readFileSync(path.join(keptProjectsDir(outputDir), 'Luc Favre', kept()[0]!), 'utf-8')
    ).toBe('<mlt>an afternoon</mlt>')
  })

  it('keeps one version of an edit that has not changed', async () => {
    fs.writeFileSync(project(), '<mlt>an afternoon</mlt>')
    await keepProject(outputDir, dir, BASE, new Date(2026, 8, 21, 18, 5, 12))

    await keepProject(outputDir, dir, BASE, new Date(2026, 8, 21, 18, 9, 30))

    expect(kept()).toHaveLength(1)
  })

  it('keeps the next version beside it once the edit moves on', async () => {
    fs.writeFileSync(project(), '<mlt>an afternoon</mlt>')
    await keepProject(outputDir, dir, BASE, new Date(2026, 8, 21, 18, 5, 12))
    fs.writeFileSync(project(), '<mlt>and an evening</mlt>')

    await keepProject(outputDir, dir, BASE, new Date(2026, 8, 21, 21, 40, 0))

    expect(kept()).toEqual([
      'luc_favre_20260802-2026-09-21T18-05-12.kdenlive',
      'luc_favre_20260802-2026-09-21T21-40-00.kdenlive'
    ])
  })

  it('keeps nothing for a montage that has no edit yet', async () => {
    expect(await keepProject(outputDir, dir, BASE)).toBeNull()
    expect(kept()).toEqual([])
  })
})

describe('the film editor’s edit, kept aside', () => {
  const edit = () => path.join(dir, `${BASE}.edit.json`)

  it('is copied beside the projects, under the moment it was kept', async () => {
    fs.writeFileSync(edit(), '{"version":1}')

    await keepProject(outputDir, dir, BASE, new Date(2026, 8, 21, 18, 5, 12))

    expect(kept()).toEqual(['luc_favre_20260802-2026-09-21T18-05-12.edit.json'])
  })

  it('keeps one version of an edit that has not changed, whatever the kdenlive project does', async () => {
    fs.writeFileSync(edit(), '{"version":1}')
    fs.writeFileSync(project(), '<mlt>an afternoon</mlt>')
    await keepProject(outputDir, dir, BASE, new Date(2026, 8, 21, 18, 5, 12))
    fs.writeFileSync(project(), '<mlt>and an evening</mlt>')

    await keepProject(outputDir, dir, BASE, new Date(2026, 8, 21, 21, 40, 0))

    expect(kept()).toEqual([
      'luc_favre_20260802-2026-09-21T18-05-12.edit.json',
      'luc_favre_20260802-2026-09-21T18-05-12.kdenlive',
      'luc_favre_20260802-2026-09-21T21-40-00.kdenlive'
    ])
  })
})
