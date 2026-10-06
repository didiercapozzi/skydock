// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loader } from '../../app/routes/board'
import { createTmpDir } from './fixtures'

/* A record that cannot be read is said so, and is not drawn as a board nobody has started: "nothing here
   yet" invites a scan, which would throw away the sorting the record still holds on the disk (RULES, The
   board follows its record). */
describe('opening the board on a record that cannot be read', () => {
  let dir: string
  let was: string | undefined

  beforeEach(() => {
    dir = createTmpDir('skydock-board-loader-')
    was = process.env.SKYDOCK_OUTPUT_DIR
    process.env.SKYDOCK_OUTPUT_DIR = dir
    process.env.SKYDOCK_CONFIG_DIR = dir
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    if (was === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
    else process.env.SKYDOCK_OUTPUT_DIR = was
  })

  it('says the record could not be read, and does not draw a board nobody has started', async () => {
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{"version":2,"files":[{"id":"a"')

    const board = await loader({} as Parameters<typeof loader>[0])

    expect(board.unreadable).toBe(true)
    expect(board.hasManifest).toBe(true)
  })

  it('says so as well when the jumps cannot be read', async () => {
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ version: 2, createdAt: '2026-09-05T10:00:00.000Z', files: [] })
    )
    fs.writeFileSync(path.join(dir, 'groups.json'), '{ this is not json')

    const board = await loader({} as Parameters<typeof loader>[0])

    expect(board.unreadable).toBe(true)
  })

  it('says nothing of the sort for a folder with no record yet', async () => {
    const board = await loader({} as Parameters<typeof loader>[0])

    expect(board.unreadable).toBe(false)
    expect(board.hasManifest).toBe(false)
  })
})
