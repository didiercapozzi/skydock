import { expect, test } from 'vitest'
import type { Page } from 'playwright'
import { useDesk, waitFor, windowDescribe } from './window-helpers'

/* The status bar's empty stretch moves SkyDock's window when dragged, as the toolbar's does (RULES.md, The
   toolbar and the status bar), and the About opens over the toolbar and closes. Worked by the real pointer on
   a real window manager. */

windowDescribe('the empty space of the window', () => {
  const desk = useDesk('status-bar')
  const boardWindow = () => desk.windows().find((w) => w.width >= 1000)

  /* dragged by an empty place, the window is somewhere else, and then it is put back */
  const movedBy = async (from: { x: number; y: number }) => {
    const before = boardWindow()
    if (!before) throw new Error('the board window is not on the screen')
    /* towards the middle of the screen, which the pointer cannot leave */
    const to = { x: from.x + (from.x > 720 ? -120 : 120), y: from.y + (from.y > 450 ? -70 : 70) }
    await desk.drag(from, to)
    await waitFor('the window to have moved', () => {
      const now = boardWindow()
      return now && (now.x !== before.x || now.y !== before.y)
    })
    const after = boardWindow()!
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(60)
    expect(Math.abs(after.y - before.y)).toBeGreaterThan(30)
    /* put back, so that the next chapter finds the page where it was */
    desk.pointer('windowmove', before.id, String(before.x), String(before.y))
    await waitFor('the window back where it was', () => {
      const now = boardWindow()
      return now && now.x === before.x && now.y === before.y
    })
  }

  const emptyOf = async (page: Page, selector: string) =>
    desk.emptyPlaceIn(page, page.locator(selector).first())

  test('moves the window when the empty stretch of the status bar is dragged', async () => {
    await desk.launch({ state: 'sorted' })
    const page = await desk.board()
    await page.locator('footer').first().waitFor({ timeout: 60_000 })
    await movedBy(await emptyOf(page, 'footer'))
    desk.shot('status-bar')
    desk.silent()
  })

  test('opens the About from Settings, and closes it with its Close button', async () => {
    const page = await desk.board()
    await desk.click(page, page.getByRole('button', { name: 'Settings' }))
    await desk.click(page, page.getByRole('button', { name: 'About SkyDock…' }))
    const about = page.getByRole('dialog', { name: 'About SkyDock' })
    await about.waitFor({ timeout: 15_000 })
    expect(await about.getByRole('link', { name: 'donkeyfall.com' }).getAttribute('href')).toBe(
      'https://donkeyfall.com'
    )
    await desk.click(page, about.getByRole('button', { name: 'Close' }))
    await about.waitFor({ state: 'detached', timeout: 15_000 })
    desk.silent()
  })
})
