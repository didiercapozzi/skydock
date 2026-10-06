import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect, test } from 'vitest'
import { useDesk, waitFor, windowDescribe } from './window-helpers'
import { place, preview } from '../steps'

/* A file opened in a window of its own, apart from the board, and a clip handed to the machine's own player
   (RULES.md, Cropping and turning). The player is the machine's: here it is a small program, named the way a
   machine names its own, that writes down what it was asked to open. */

const FIRST = /DJI_20260905100000_0001_D\.MP4/
const SECOND = /DJI_20260905100240_0002_D\.MP4/

windowDescribe('a file in a window of its own, and the machine own player', () => {
  const desk = useDesk('preview-window')
  const played = () => path.join(desk.root, 'played.txt')

  test('opens a double-clicked file in a second window, keeps the board going behind it, and shows the next file in the same window', async () => {
    const player = path.join(desk.root, 'player.sh')
    fs.writeFileSync(player, `#!/bin/sh\nprintf '%s' "$1" > '${played()}'\n`, { mode: 0o755 })
    await desk.launch({ state: 'sorted', env: { SKYDOCK_PLAYER_COMMAND: player } })
    const board = await desk.board()
    await desk.click(board, place(board, /Sion/))
    await board.getByText(FIRST).first().waitFor({ timeout: 60_000 })

    await desk.click(board, board.getByText(FIRST).first(), 2)
    const file = await desk.preview()
    await preview(file).waitFor()
    desk.shot('file-window')

    /* two windows on the screen, and the board behind still answers */
    expect(desk.pages()).toHaveLength(2)
    expect(desk.windows().filter((w) => w.width >= 800)).toHaveLength(2)
    await board.getByRole('navigation', { name: 'Folders' }).waitFor()

    /* stepping on stays in that window */
    await desk.click(file, file.getByRole('button', { name: 'Next' }))
    await waitFor('the next file in the same window', async () =>
      (await preview(file).innerText()).match(SECOND)
    )
    expect(desk.pages()).toHaveLength(2)
    desk.silent()
  })

  test('hands the clip, as it was shot, to the machine own player from the file window, copying nothing', async () => {
    const file = await desk.preview()
    /* what the work folder holds, bar the pictures the board draws as it is looked at */
    const held = () =>
      fs
        .readdirSync(desk.world.output, { recursive: true })
        .map(String)
        .filter((name) => !name.startsWith('.thumbs'))
        .sort()
    const before = held()
    await desk.click(file, file.getByRole('button', { name: /In the machine.s player/ }))
    const asked = await waitFor('the player to be asked', () =>
      fs.existsSync(played()) ? fs.readFileSync(played(), 'utf8') : undefined
    )
    expect(path.basename(asked)).toMatch(/^DJI_2026090510\d+_000[12]_D\.MP4$/)
    expect(fs.existsSync(asked)).toBe(true)
    expect(asked.startsWith(desk.world.output)).toBe(true)
    /* nothing was converted or copied to make it playable */
    expect(held()).toEqual(before)
    desk.silent()
  })

  test('brings the file window back to the front when it is under the board and another file is asked for, and closes it with Escape and not the board', async () => {
    const board = await desk.board()
    const file = await desk.preview()
    /* the file's window is drawn 1360 wide, and the desktop gives each window a thin border on top of that */
    const window = desk.windows().find((w) => Math.abs(w.width - 1360) <= 16)
    const boardWindow = desk.windows().find((w) => w.width === 1440)
    if (!window || !boardWindow) throw new Error('both windows should be on the screen')

    /* the board comes forward, over the file's window */
    desk.pointer('windowactivate', boardWindow.id)
    await waitFor('the board in front', () => desk.pointer('getactivewindow') === boardWindow.id)
    await desk.click(board, board.getByText(FIRST).first(), 2)
    await waitFor(
      'the file window in front again',
      () => desk.pointer('getactivewindow') === window.id
    )
    expect(desk.pages()).toHaveLength(2)

    desk.pointer('windowfocus', window.id)
    desk.key('Escape')
    await waitFor('the file window to close', () => desk.pages().length === 1)
    await board.getByRole('navigation', { name: 'Folders' }).waitFor()
    expect(file.isClosed()).toBe(true)
    desk.silent()
  })
})
