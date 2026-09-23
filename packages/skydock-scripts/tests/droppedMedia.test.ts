// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { mediaUnder } from '../src/droppedMedia'
import { createTmpDir } from './fixtures'

/* A folder dragged onto the board is everything of ours inside it, however deep the folders go
   (RULES, Bringing files in by hand). */

let dir: string

const put = (where: string) => {
  const full = path.join(dir, where)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, 'x')
  return full
}

const namesOf = (dropped: string[]) => mediaUnder(dropped).map((file) => file.name)

beforeEach(() => {
  dir = createTmpDir('skydock-dropped-')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('a folder dropped on the board', () => {
  it('brings the videos and photos inside it', () => {
    put('card/GX010001.MP4')
    put('card/GX010002.MP4')
    put('card/DSC_0001.JPG')
    expect(namesOf([path.join(dir, 'card')])).toEqual([
      'DSC_0001.JPG',
      'GX010001.MP4',
      'GX010002.MP4'
    ])
  })

  it('brings what is in the folders inside it', () => {
    put('card/DCIM/100GOPRO/GX010001.MP4')
    put('card/DCIM/101GOPRO/GX010002.MP4')
    expect(namesOf([path.join(dir, 'card')])).toEqual(['GX010001.MP4', 'GX010002.MP4'])
  })

  it('leaves everything that is not a video or a photo where it is', () => {
    put('card/GX010001.MP4')
    put('card/notes.txt')
    put('card/.DS_Store')
    put('card/._GX010001.MP4')
    expect(namesOf([path.join(dir, 'card')])).toEqual(['GX010001.MP4'])
  })

  it('counts a file once when the folder it is in was dropped as well', () => {
    const clip = put('card/GX010001.MP4')
    expect(namesOf([path.join(dir, 'card'), clip])).toEqual(['GX010001.MP4'])
  })

  it('says how big each one is, so the board can say what is coming', () => {
    put('card/GX010001.MP4')
    expect(mediaUnder([path.join(dir, 'card')])).toEqual([
      { path: path.join(dir, 'card', 'GX010001.MP4'), name: 'GX010001.MP4', size: 1 }
    ])
  })
})

describe('a file dropped on the board', () => {
  it('is itself', () => {
    const clip = put('GX010001.MP4')
    expect(namesOf([clip])).toEqual(['GX010001.MP4'])
  })

  it('is passed over when it is not a video or a photo', () => {
    expect(namesOf([put('notes.txt')])).toEqual([])
  })

  it('is passed over when it is not there at all', () => {
    expect(namesOf([path.join(dir, 'gone.mp4')])).toEqual([])
  })
})
