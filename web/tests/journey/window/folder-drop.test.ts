import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect, test } from 'vitest'
import { CLIPS, makeClip, makePhoto, PHOTOS } from '../media'
import { JOURNEY, useDesk, waitFor, windowDescribe } from './window-helpers'

/* A whole folder let go over the board from another program, by address, the way a file manager offers it
   (RULES.md, Adding files): the folder itself is not copied, every video and photo inside it is, however deep,
   and what else is in there is left where it is. */

windowDescribe('a whole folder dropped from outside the window', () => {
  const desk = useDesk('folder-drop')

  test('takes in every video and photo inside a folder let go over the board, however deep, and leaves the notes and bookkeeping where they are', async () => {
    const output = path.join(desk.root, 'work')
    const rushes = path.join(desk.root, 'computer', 'Rushes')
    const media = [
      path.join(rushes, 'camera-a', CLIPS[0][0]),
      path.join(rushes, 'camera-a', CLIPS[1][0]),
      path.join(rushes, 'camera-b', 'day-two', 'deeper', CLIPS[5][0]),
      path.join(rushes, 'camera-b', 'day-two', 'deeper', PHOTOS[0][0])
    ]
    const left = [
      path.join(rushes, 'camera-a', 'notes.txt'),
      path.join(rushes, 'camera-b', 'MISC', 'card.idx'),
      path.join(rushes, 'edit.kdenlive')
    ]
    for (const file of [...media, ...left]) fs.mkdirSync(path.dirname(file), { recursive: true })
    makeClip(media[0]!, CLIPS[0][1])
    makeClip(media[1]!, CLIPS[1][1])
    makeClip(media[2]!, CLIPS[5][1])
    makePhoto(media[3]!, PHOTOS[0][1])
    for (const file of left) fs.writeFileSync(file, 'not footage')

    await desk.launch({ settings: { outputDir: output } })
    const page = await desk.board()
    await page.getByText('Nothing left to sort').first().waitFor()

    /* the folder is offered by its address, and carried over the middle of the board */
    desk.run('python3', [path.join(JOURNEY, 'drag-source.py'), '1000', '640', rushes])
    await desk.dialog('files to drag')
    desk.shot('folder-offered')
    const over = await desk.middleOf(page, page.locator('section[aria-label]').first())
    await desk.drag({ x: 1100, y: 690 }, over)

    await waitFor('every video and photo of the folder in the originals', () => {
      const taken = fs.existsSync(path.join(output, 'original_files'))
        ? fs
            .readdirSync(path.join(output, 'original_files'), { recursive: true })
            .map(String)
            .filter((f) => /\.(MP4|JPG)$/i.test(f))
        : []
      return taken.length === 4
    })
    await page
      .getByText(/added to Fresh files/)
      .first()
      .waitFor()
    desk.shot('folder-taken')

    /* the folder itself and what is not footage came to nothing, and nothing was moved */
    const everything = fs
      .readdirSync(output, { recursive: true })
      .map(String)
      .filter((f) => !f.startsWith('.'))
    expect(everything.filter((f) => /notes\.txt|card\.idx|\.kdenlive|Rushes/.test(f))).toEqual([])
    for (const file of [...media, ...left]) expect(fs.existsSync(file)).toBe(true)
    desk.silent()
  })
})
