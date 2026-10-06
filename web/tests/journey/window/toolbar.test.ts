import { expect, test } from 'vitest'
import type { Page } from 'playwright'
import { hasAttribute, sleep, useDesk, waitFor, windowDescribe } from './window-helpers'

/* The window's own buttons and its toolbar (RULES.md, The toolbar and the status bar): SkyDock's window has no
   frame of the desktop's, so minimise, maximise and close are drawn at the end of the toolbar, and its empty
   space moves the window when dragged and maximises it when pressed twice. All of it is worked by the real
   pointer on a real window manager. */

windowDescribe('the window buttons of the toolbar', () => {
  const desk = useDesk('toolbar')
  const buttons = (page: Page) => page.locator('span:has(> button[aria-label="Minimise"])')
  const toolbar = (page: Page) => page.locator('header.drag-region').first()
  const boardWindow = () => desk.windows().find((w) => w.width >= 1000)

  test('draws minimise, maximise and close at the end of the toolbar, and minimise puts the window away until it is asked back', async () => {
    await desk.launch({ state: 'sorted' })
    const page = await desk.board()
    await buttons(page).waitFor({ timeout: 60_000 })
    for (const name of ['Minimise', 'Maximise', 'Close'])
      await buttons(page).getByRole('button', { name, exact: true }).waitFor()
    const window = boardWindow()
    if (!window) throw new Error('the board window is not on the screen')

    await desk.click(page, buttons(page).getByRole('button', { name: 'Minimise', exact: true }))
    await waitFor('the window to be put away', () => !boardWindow())
    desk.shot('minimised')
    /* asked back the way a taskbar does */
    desk.pointer('windowmap', window.id)
    desk.pointer('windowactivate', window.id)
    await waitFor('the window back', () => boardWindow())
    desk.silent()
  })

  test('maximises and restores from the middle button, and by pressing the empty toolbar twice', async () => {
    const page = await desk.board()
    const middle = buttons(page).getByRole('button', { name: /^(Maximise|Restore)$/ })
    await hasAttribute(middle, 'aria-label', 'Maximise')
    await desk.click(page, middle)
    await hasAttribute(middle, 'aria-label', 'Restore')
    await desk.click(page, middle)
    await hasAttribute(middle, 'aria-label', 'Maximise')

    const empty = await desk.emptySpaceOf(page, toolbar(page))
    desk.moveTo(empty.x, empty.y)
    await sleep(150)
    desk.pointer('click', '--repeat', '2', '--delay', '90', '1')
    await hasAttribute(middle, 'aria-label', 'Restore')
    desk.pointer('click', '--repeat', '2', '--delay', '90', '1')
    await hasAttribute(middle, 'aria-label', 'Maximise')
    desk.silent()
  })

  test('moves the window when the empty toolbar is dragged', async () => {
    const page = await desk.board()
    const before = boardWindow()
    if (!before) throw new Error('the board window is not on the screen')
    const from = await desk.emptySpaceOf(page, toolbar(page))
    await desk.drag(from, { x: from.x + 120, y: from.y + 70 })
    await waitFor('the window to have moved', () => {
      const now = boardWindow()
      return now && (now.x !== before.x || now.y !== before.y)
    })
    const after = boardWindow()!
    expect(after.x - before.x).toBeGreaterThan(60)
    expect(after.y - before.y).toBeGreaterThan(30)
    desk.shot('moved')
    desk.silent()
  })

  test('closes SkyDock from the close button, without asking anything when nothing is running', async () => {
    const page = await desk.board()
    await desk.click(page, buttons(page).getByRole('button', { name: 'Close', exact: true }))
    await waitFor('SkyDock to be gone', () => !desk.running, 30)
    expect(desk.windows().filter((w) => /SkyDock/.test(w.name))).toEqual([])
  })
})
