// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { writeArchive } from '../src/archive'
import { createTmpDir } from './fixtures'

/* An archive is gigabytes of originals, so it is built once and reused — but only while it holds
   exactly what is asked for. A film asked into the backup is older than the zip it was never in, so
   "newer than everything in it" alone would hand back the old zip without it. */
describe('reusing an archive', () => {
  let dir: string

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const setup = () => {
    dir = createTmpDir('skydock-archive-')
    const clip = path.join(dir, 'GX01.MP4')
    const film = path.join(dir, 'film.mp4')
    fs.writeFileSync(clip, 'clip')
    fs.writeFileSync(film, 'film')
    return { clip, film, zip: path.join(dir, 'rushes.zip') }
  }

  const builtAt = (zip: string) => fs.statSync(zip).mtimeMs

  it('reuses the archive when nothing in it changed', async () => {
    const { clip, zip } = setup()
    await writeArchive(zip, [{ file: clip, name: 'GX01.MP4' }])
    const first = builtAt(zip)
    await new Promise((resolve) => setTimeout(resolve, 20))

    await writeArchive(zip, [{ file: clip, name: 'GX01.MP4' }])

    expect(builtAt(zip)).toBe(first)
  })

  it('builds it again when asked to hold one more file, however old that file is', async () => {
    const { clip, film, zip } = setup()
    await writeArchive(zip, [{ file: clip, name: 'GX01.MP4' }])
    const first = builtAt(zip)
    await new Promise((resolve) => setTimeout(resolve, 20))

    await writeArchive(zip, [
      { file: clip, name: 'GX01.MP4' },
      { file: film, name: 'film.mp4' }
    ])

    expect(builtAt(zip)).not.toBe(first)
    expect(JSON.parse(fs.readFileSync(`${zip}.contents`, 'utf-8'))).toEqual([
      'GX01.MP4',
      'film.mp4'
    ])
  })
})
