// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { saveManifest } from '@skydock/scripts'
import { loader } from '../../app/routes/edit'
import { placeHref } from '../../app/helpers/places'
import { createTmpDir, routeArgs } from './fixtures'

describe('opening the film editor on its own page', () => {
  let dir: string
  let was: string | undefined

  beforeEach(async () => {
    dir = createTmpDir('skydock-edit-loader-')
    was = process.env.SKYDOCK_OUTPUT_DIR
    process.env.SKYDOCK_OUTPUT_DIR = dir
    process.env.SKYDOCK_CONFIG_DIR = dir
    await saveManifest(path.join(dir, 'manifest.json'), {
      version: 1,
      createdAt: new Date().toISOString(),
      files: [],
      groups: [
        {
          id: 'g1',
          label: 'luc',
          day: '06.09.2026',
          files: [],
          montageJump: true,
          passenger: { firstname: 'Luc', lastname: 'Favre' }
        }
      ],
      destinations: []
    })
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    if (was === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
    else process.env.SKYDOCK_OUTPUT_DIR = was
  })

  const open = (groupId: string) => {
    const args = routeArgs(new Request(`http://localhost/edit/${groupId}`))
    return loader({ ...args, params: { groupId } })
  }

  it('gives the montage’s day, and the page of the montage to go back to', async () => {
    expect(await open('g1')).toEqual({
      groupId: 'g1',
      day: '06.09.2026',
      back: placeHref({ kind: 'pax', name: 'Luc Favre' })
    })
  })

  it('gives one that is not on the board without a day, for the editor to refuse', async () => {
    expect(await open('gone')).toEqual({
      groupId: 'gone',
      day: undefined,
      back: placeHref({ kind: 'montages' })
    })
  })
})
