// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { action } from '../../app/routes/api.dropped'
import { createTmpDir, routeArgs } from './fixtures'

/* A whole folder let go of on the board is not itself copied: this is what is inside it, worked out
   before a byte moves, so the board can list what is coming (RULES, The board — Adding files from
   the computer). It reads names and sizes and nothing else. */

type Answer = { files: { path: string; name: string; size: number }[] }

describe('what a drop from the computer holds', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = createTmpDir('skydock-api-dropped-test-')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const put = (where: string) => {
    const full = path.join(tmpDir, where)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, 'xx')
    return full
  }

  const ask = async (paths: string[]) =>
    (await action(
      routeArgs(
        new Request('http://localhost/api/dropped', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths })
        })
      )
    )) as Answer

  /* in the order the folders put them, so a card of clips arrives as the card has it */
  it('is every video and photo in a folder, and in the folders inside it', async () => {
    put('card/DCIM/100GOPRO/GX010001.MP4')
    put('card/DCIM/101GOPRO/GX010002.MP4')
    put('card/DSC_0001.JPG')

    const said = await ask([path.join(tmpDir, 'card')])

    expect(said.files.map((f) => f.name)).toEqual(['GX010001.MP4', 'GX010002.MP4', 'DSC_0001.JPG'])
  })

  it('leaves what is not a video or a photo where it is', async () => {
    put('card/GX010001.MP4')
    put('card/notes.txt')

    const said = await ask([path.join(tmpDir, 'card')])

    expect(said.files.map((f) => f.name)).toEqual(['GX010001.MP4'])
  })

  it('says how big each one is, so the board can say what is coming', async () => {
    const clip = put('GX010001.MP4')

    const said = await ask([clip])

    expect(said.files).toEqual([{ path: clip, name: 'GX010001.MP4', size: 2 }])
  })

  it('reads nothing that is not there', async () => {
    const said = await ask([path.join(tmpDir, 'gone')])

    expect(said.files).toEqual([])
  })
})
