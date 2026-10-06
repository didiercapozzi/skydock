import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import {
  addDestination,
  FILM,
  filesUnder,
  makeMontageReady,
  montageFolder,
  renderFilm
} from './i2-helpers'

/* The montage every chapter about sending starts from: made from a jump, prepared, with its project, and its
   film dropped where the editor would have rendered it, since the editor cannot run here. Saved as `i2-ready`. */

const j = harness({
  name: 'i2-ready',
  state: 'sorted',
  /* the editor is asked for and does nothing, as a program that was started and closed at once */
  env: () => ({ SKYDOCK_EDITOR_COMMAND: 'true' })
})

describe('a montage ready to be sent', () => {
  test('is made, prepared and given its project, ready for its film to be rendered', async () => {
    await makeMontageReady(j)
    expect(filesUnder(montageFolder(j))).toEqual([
      'luc_favre_20260906.kdenlive',
      'photos/luc_favre_20260906_090130.jpg',
      'videos/luc_favre_20260906_090000.mp4',
      'videos/luc_favre_20260906_090300.mp4'
    ])
    await j.quiet()
  })

  test('has its film noticed by the board once the editor has written it', async () => {
    await renderFilm(j)
    expect(fs.existsSync(path.join(montageFolder(j), FILM))).toBe(true)
    await j.page.getByRole('button', { name: 'Upload…' }).first().waitFor({ timeout: 30_000 })
    await j.see(`${FILM}`)
    await j.quiet()
  })

  test('has destinations to send to', async () => {
    await addDestination(j.page, 'Backup')
    await addDestination(j.page, 'Club')
    /* saved only once the record holds them: the board writes it a moment after the click */
    await expect
      .poll(() => fs.readFileSync(path.join(j.world.output, 'manifest.json'), 'utf8'), {
        timeout: 20_000
      })
      .toMatch(/Club/)
    await j.quiet()
    j.save('i2-ready')
  })
})
