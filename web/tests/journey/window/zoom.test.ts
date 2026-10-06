import { expect, test } from 'vitest'
import type { Page } from 'playwright'
import { disabled, sees, useDesk, waitFor, windowDescribe } from './window-helpers'

/* How big the board is drawn (RULES.md, How big it is drawn): the − and + at the end of the status bar and the
   keys ⌘ or ctrl with + − 0, from half to three times a tenth at a time, kept for next time. */

windowDescribe('how big the board is drawn in the window', () => {
  const desk = useDesk('zoom')
  const group = (page: Page) => page.getByRole('group', { name: 'Size of the board' })
  const size = (page: Page) => group(page).getByRole('button', { name: 'As drawn' })

  test('draws the board bigger and smaller from the buttons of the status bar, a tenth at a time, and back to as drawn when the size is pressed', async () => {
    await desk.launch({ state: 'sorted' })
    const page = await desk.board()
    await sees(size(page), '100%')

    await desk.click(page, group(page).getByRole('button', { name: 'Bigger' }))
    await desk.click(page, group(page).getByRole('button', { name: 'Bigger' }))
    await sees(size(page), '120%')
    expect(await page.evaluate(() => window.devicePixelRatio)).toBeCloseTo(1.2, 1)
    await desk.click(page, group(page).getByRole('button', { name: 'Smaller' }))
    await sees(size(page), '110%')
    desk.shot('zoomed')

    await desk.click(page, size(page))
    await sees(size(page), '100%')
    desk.silent()
  })

  test('draws the board at the size the keys ask, never beyond half or three times, and keeps the size for next time', async () => {
    const page = await desk.board()
    desk.pointer('windowfocus', desk.windows().find((w) => w.width >= 1000)!.id)
    for (let step = 0; step < 3; step++) desk.key('ctrl+equal')
    await sees(size(page), '130%')
    desk.key('ctrl+minus')
    await sees(size(page), '120%')
    desk.key('ctrl+0')
    await sees(size(page), '100%')
    for (let step = 0; step < 6; step++) desk.key('ctrl+minus')
    await sees(size(page), '50%')
    await disabled(group(page).getByRole('button', { name: 'Smaller' }))

    /* kept: the settings say it, and the window opens at it next time */
    desk.key('ctrl+equal')
    desk.key('ctrl+equal')
    await sees(size(page), '70%')
    await waitFor('the size kept', () => desk.settings().zoom === 70)
    await desk.quit()
    await desk.launch()
    const again = await desk.board()
    await sees(size(again), '70%')
    expect(desk.settings().zoom).toBe(70)
    desk.silent()
  })
})
