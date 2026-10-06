import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Page } from 'playwright'
import { expect, test } from 'vitest'
import {
  disabled,
  lengthenFootage,
  sees,
  sleep,
  useDesk,
  waitFor,
  windowDescribe
} from './window-helpers'

/* Another work folder, and what must not be cut off (RULES.md, Where SkyDock runs): the folder is chosen from
   Settings in SkyDock's own window, never while something is being written, and closing the window while a
   job runs asks first. The folder picker and the question are the machine's own, answered by the keyboard. */

const PICKER = 'Where should SkyDock work from now on?'
const QUESTION = 'SkyDock is working'

/* what a folder holds, to be told whether it was left exactly as it was */
const listing = (folder: string) =>
  fs
    .readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const file = path.join(entry.parentPath, entry.name)
      return `${file} ${fs.statSync(file).size}`
    })
    .sort()

windowDescribe('another work folder, and nothing cut off unasked', () => {
  const desk = useDesk('work-folder')
  const other = () => path.join(desk.root, 'Other')

  /* the dialog under Settings, opened with the pointer */
  const openWorkFolder = async (page: Page) => {
    await desk.click(page, page.getByRole('button', { name: 'Settings' }))
    await desk.click(page, page.getByRole('button', { name: /Work folder…/ }))
    await page.getByRole('dialog', { name: 'Work folder' }).waitFor()
  }
  const closeWork = (page: Page) =>
    desk.click(
      page,
      page.getByRole('dialog', { name: 'Work folder' }).getByRole('button', { name: 'Close' })
    )
  /* the window's own three buttons, at the end of the toolbar */
  const windowButton = (page: Page, name: string) =>
    page
      .locator('span:has(> button[aria-label="Minimise"])')
      .getByRole('button', { name, exact: true })

  test('works from another folder chosen under Settings, leaves the folder behind as it was, and can go back to it', async () => {
    fs.mkdirSync(other())
    await desk.launch({ state: 'sorted' })
    const behind = desk.world.output
    const before = listing(behind)
    const page = await desk.board()
    await page
      .getByRole('navigation', { name: 'Folders' })
      .getByRole('link', { name: /Sion/ })
      .waitFor({ timeout: 60_000 })

    await openWorkFolder(page)
    await waitFor('the dialog to say where the work is', async () =>
      (await page.getByRole('dialog', { name: 'Work folder' }).innerText()).includes(behind)
    )
    await desk.click(page, page.getByRole('button', { name: 'Choose another folder…' }))
    await desk.chooseFolder(PICKER, other())

    /* the window opens on the board the other folder holds: nothing yet */
    await page.getByText('Nothing left to sort').first().waitFor({ timeout: 60_000 })
    await waitFor('the folder remembered', () => desk.settings().outputDir === other())
    expect(listing(behind)).toEqual(before)
    desk.shot('another-folder')

    /* the folder left behind is chosen again, and its work is there */
    await openWorkFolder(page)
    await desk.click(page, page.getByRole('button', { name: 'Choose another folder…' }))
    await desk.chooseFolder(PICKER, behind)
    await page
      .getByRole('navigation', { name: 'Folders' })
      .getByRole('link', { name: /Sion/ })
      .waitFor({ timeout: 60_000 })
    await waitFor('the first folder remembered again', () => desk.settings().outputDir === behind)
    desk.silent()
  })

  test('is not offered another folder while processing writes into this one, and asks before the close button cuts it off', async () => {
    await desk.quit()
    /* long clips, so that processing is still going when the person gets to Settings */
    await desk.launch({ state: 'sorted', prepare: (world) => lengthenFootage(world) })
    const page = await desk.board()
    await desk.click(
      page,
      page.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: /Sion/ })
    )
    await desk.click(page, page.getByRole('button', { name: /Process 3 files/ }))
    const busy = () =>
      page.evaluate(
        async () =>
          ((await (await fetch('/api/busy')).json()) as { running: string | null }).running
      )
    await waitFor('processing to be under way', busy)

    /* Settings offers nothing: the button is there but cannot be pressed, and says why */
    await openWorkFolder(page)
    const choose = page.getByRole('button', { name: 'Choose another folder…' })
    await disabled(choose)
    await sees(page.getByRole('dialog', { name: 'Work folder' }), /wait until it is done/)
    desk.shot('folder-refused-while-processing')
    await closeWork(page)

    /* the close button asks first; keeping on working changes nothing */
    await desk.click(page, windowButton(page, 'Close'))
    await desk.answer(QUESTION, 'first')
    await sleep(1500)
    expect(desk.running).toBe(true)
    expect(await busy()).toBeTruthy()
    desk.shot('kept-on-working')
    desk.silent()

    /* closing anyway stops the work and the app: what was finished stays, the rest is left to do again */
    await desk.click(page, windowButton(page, 'Close'))
    await desk.answer(QUESTION, 'second')
    await waitFor('SkyDock to be gone', () => !desk.running, 60)
    const copies = path.join(desk.world.output, 'processed', 'Sion')
    const made = fs.existsSync(copies)
      ? fs.readdirSync(copies).filter((f) => f.endsWith('.mp4'))
      : []
    expect(made.length).toBeLessThan(3)
  })
})
