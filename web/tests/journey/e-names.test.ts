import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import { place } from './steps'

/* The work folder reached by another name than the one its record was written under — a container and the
   machine it sits on — as when the board is opened from the other. Starts from the sorted board, whose record
   is then written as if the folder were at /home/host/skydock/output. */

const OTHER = '/home/host/skydock/output'

const j = harness({
  name: 'e-names',
  state: 'sorted',
  prepare: (world) => {
    for (const name of ['manifest.json', 'groups.json']) {
      const file = path.join(world.output, name)
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').split(world.output).join(OTHER))
    }
  }
})
const { see, quiet, open } = j

describe('a record written under the other name of the output folder', () => {
  test('processes the files of a destination, found wherever the folder is opened from', async () => {
    const record = fs.readFileSync(path.join(j.world.output, 'manifest.json'), 'utf8')
    expect(record, 'every clip is named by the other name').toContain(`${OTHER}/original_files/`)
    expect(record).not.toContain(j.world.output)
    await open()
    await place(j.page, /Sion/).click()
    await see('3 files need processing')
    await j.page.getByRole('button', { name: 'Process 3 files' }).click()
    await see('3 files are ready to upload', 60_000)
    expect(fs.readdirSync(path.join(j.world.output, 'processed', 'Sion')).sort()).toEqual([
      'sion_20260905_100000.mp4',
      'sion_20260905_100240.mp4',
      'sion_20260905_100520.mp4'
    ])
    await quiet()
  })
})
