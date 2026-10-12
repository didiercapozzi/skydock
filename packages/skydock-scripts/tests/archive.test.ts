// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { writeArchive } from '../src/archive'
import { cancelUploading, runUpload, UploadCancelled } from '../src/uploading'
import { createTmpDir } from './fixtures'

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
    const old = new Date(Date.now() - 60 * 60 * 1000)
    fs.utimesSync(clip, old, old)
    fs.utimesSync(film, old, old)
    return { clip, film, zip: path.join(dir, 'rushes.zip') }
  }

  const builtAt = (zip: string) => fs.statSync(zip).mtimeMs

  const aged = (zip: string) => {
    const past = new Date(Date.now() - 60 * 1000)
    fs.utimesSync(zip, past, past)
  }

  it('reuses the archive when nothing in it changed', async () => {
    const { clip, zip } = setup()
    await writeArchive(zip, [{ file: clip, name: 'GX01.MP4' }])
    aged(zip)
    const first = builtAt(zip)

    await writeArchive(zip, [{ file: clip, name: 'GX01.MP4' }])

    expect(builtAt(zip)).toBe(first)
  })

  it('builds it again when asked to hold one more file, however old that file is', async () => {
    const { clip, film, zip } = setup()
    await writeArchive(zip, [{ file: clip, name: 'GX01.MP4' }])
    aged(zip)
    const first = builtAt(zip)

    await writeArchive(zip, [
      { file: clip, name: 'GX01.MP4' },
      { file: film, name: 'film.mp4' }
    ])

    expect(builtAt(zip)).not.toBe(first)
  })
})

describe('a zip being made when the upload is cancelled', () => {
  let dir: string

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('leaves no zip behind', async () => {
    dir = createTmpDir('skydock-archive-')
    const clip = path.join(dir, 'GX01.MP4')
    fs.writeFileSync(clip, Buffer.alloc(64 * 1024 * 1024, 7))
    const zip = path.join(dir, 'rushes.zip')

    const making = runUpload({ key: 'montage:g1', label: 'Luc Favre' }, () =>
      writeArchive(zip, [{ file: clip, name: 'GX01.MP4' }], { level: 9 })
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    cancelUploading()

    await expect(making).rejects.toBeInstanceOf(UploadCancelled)
    expect(fs.readdirSync(dir)).toEqual(['GX01.MP4'])
  })
})
