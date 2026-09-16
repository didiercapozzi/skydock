// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { binGroupMedia } from '../src/process'
import { createTmpDir } from './fixtures'

/* The edit is the only thing in a tandem's folder that cannot be made again: the footage can be
   re-copied from the originals, the archives rebuilt, the film re-rendered — but the hours someone
   spent choosing cuts exist once. Re-processing used to rename the whole folder into .trash. */
describe('re-processing a tandem folder', () => {
  let outputDir: string
  let groupDir: string

  const fill = () => {
    fs.mkdirSync(path.join(groupDir, 'videos'), { recursive: true })
    fs.mkdirSync(path.join(groupDir, 'photos'), { recursive: true })
    fs.writeFileSync(path.join(groupDir, 'videos', 'a.mp4'), 'v')
    fs.writeFileSync(path.join(groupDir, 'photos', 'b.jpg'), 'p')
  }

  beforeEach(() => {
    outputDir = createTmpDir('skydock-reprocess-')
    groupDir = path.join(outputDir, 'processed', 'Tandems', 'Luc Favre')
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('keeps the project, the film and the archives when there is an edit', () => {
    fill()
    fs.writeFileSync(path.join(groupDir, 'luc_favre.kdenlive'), '<mlt/>')
    fs.writeFileSync(path.join(groupDir, 'luc_favre.mp4'), 'film')
    fs.writeFileSync(path.join(groupDir, 'luc_favre.photos.zip'), 'zip')

    expect(binGroupMedia(groupDir, outputDir)).toBe(true)

    expect(fs.readdirSync(groupDir).sort()).toEqual([
      'luc_favre.kdenlive',
      'luc_favre.mp4',
      'luc_favre.photos.zip'
    ])
  })

  it('bins the media it is about to rewrite, so nothing is deleted outright', () => {
    fill()
    fs.writeFileSync(path.join(groupDir, 'luc_favre.kdenlive'), '<mlt/>')
    binGroupMedia(groupDir, outputDir)
    const binned = fs.readdirSync(path.join(outputDir, '.trash'))
    expect(binned.some((e) => e.startsWith('videos_'))).toBe(true)
    expect(binned.some((e) => e.startsWith('photos_'))).toBe(true)
  })

  it('bins the whole folder when no edit is in it, exactly as before', () => {
    fill()
    expect(binGroupMedia(groupDir, outputDir)).toBe(false)
    expect(fs.existsSync(groupDir)).toBe(false)
    expect(fs.readdirSync(path.join(outputDir, '.trash'))[0]).toMatch(/^Luc Favre_/)
  })

  it('does nothing for a folder that was never processed', () => {
    expect(binGroupMedia(groupDir, outputDir)).toBe(false)
    expect(fs.existsSync(path.join(outputDir, '.trash'))).toBe(false)
  })
})
