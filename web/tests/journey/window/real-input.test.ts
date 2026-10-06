import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect, test } from 'vitest'
import { CLIPS, makeClip } from '../media'
import { JOURNEY, useDesk, waitFor, windowDescribe } from './window-helpers'

/* SkyDock's own window, on a screen of its own, worked with a real pointer: the X server is real, so is the
   window manager, and so is the drop — files offered by another program, by address, the way a file manager
   offers them, and let go over the board by a mouse that is pressed, moved and released. Nothing here is
   handed to the page; the page is only read (by its debugging port) to say what it shows. */

windowDescribe('the window, worked with a real pointer', () => {
  const desk = useDesk('real-input')

  test('files let go over the board from another program are copied into the originals, and become a jump when asked', async () => {
    const output = path.join(desk.root, 'work')
    const computer = path.join(desk.root, 'computer')
    fs.mkdirSync(computer)
    await desk.launch({ settings: { outputDir: output } })
    const page = await desk.board()
    await page.getByText('Nothing left to sort').first().waitFor()

    const files = CLIPS.slice(0, 3).map(([name, when]) => {
      const file = path.join(computer, name)
      makeClip(file, when)
      return file
    })
    desk.run('python3', [path.join(JOURNEY, 'drag-source.py'), '1000', '640', ...files])
    await desk.dialog('files to drag')
    desk.shot('files-offered')

    /* press on the files, carry them across the screen, and let go over the board */
    await desk.drag({ x: 1100, y: 690 }, { x: 720, y: 470 })
    desk.shot('carried-over-the-board')

    await waitFor('the files in the originals', () => {
      const inside = fs.existsSync(path.join(output, 'original_files'))
        ? fs
            .readdirSync(path.join(output, 'original_files'), { recursive: true })
            .filter((f) => String(f).endsWith('.MP4'))
        : []
      return inside.length === 3
    })
    await page
      .getByText(/has been added to Fresh files|files have been added to Fresh files/)
      .first()
      .waitFor()
    desk.shot('copied')

    /* the button that makes a jump of them, pressed with the pointer */
    desk.moveTo(1315, 177)
    desk.pointer('click', '1')
    await page.getByText('Jump 1', { exact: true }).waitFor({ timeout: 30_000 })
    desk.shot('grouped')
    expect(fs.readdirSync(computer).filter((f) => f.endsWith('.MP4'))).toHaveLength(3)
    desk.silent()
  })
})
