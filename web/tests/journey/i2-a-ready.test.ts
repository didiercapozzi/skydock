import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import { makeMontageReady } from './i2-helpers'
import { filesUnder, FILM, filmFile, montageFolder, renderFilm } from './media'
import { addDestination } from './steps'

const j = harness({
  name: 'i2-ready',
  state: 'sorted'
})

describe('a montage ready to be sent', () => {
  test('is made and edited, with nothing processed, ready for its film to be rendered', async () => {
    await makeMontageReady(j)
    expect(filesUnder(montageFolder(j.world))).toEqual(['luc_favre_20260906.edit.json'])
    await j.quiet()
  })

  test('has its film noticed by the board once the editor has written it', async () => {
    renderFilm(j.world)
    expect(fs.existsSync(filmFile(j.world))).toBe(true)
    await j.page.getByRole('button', { name: 'Upload…' }).first().waitFor({ timeout: 30_000 })
    await j.see(`${FILM}`)
    await j.quiet()
  })

  test('has destinations to send to', async () => {
    await addDestination(j.page, 'Backup')
    await addDestination(j.page, 'Club')
    await expect
      .poll(() => fs.readFileSync(path.join(j.world.output, 'manifest.json'), 'utf8'), {
        timeout: 20_000
      })
      .toMatch(/Club/)
    await j.quiet()
    j.save('i2-ready')
  })
})
