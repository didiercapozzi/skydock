import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect, test } from 'vitest'
import { loadState } from '../saved'
import { gone, sees, useDesk, waitFor, windowDescribe } from './window-helpers'

const PICKER = 'Where should SkyDock keep its work?'

windowDescribe('the first time it is opened', () => {
  const desk = useDesk('welcome')
  const first = () => path.join(desk.root, 'First')

  test('shows the welcome page with Start, and closing the folder picker without choosing leaves the page as it was', async () => {
    fs.mkdirSync(first())
    await desk.launch()
    const page = await desk.welcome()
    await page.locator('#start').waitFor()
    desk.shot('welcome')

    await desk.click(page, page.locator('#start'))
    await desk.dismissDialog(PICKER)

    await page.locator('#welcome').waitFor()
    await gone(page.locator('#chosen'))
    expect(desk.settings().outputDir).toBeUndefined()
    expect(fs.readdirSync(first())).toEqual([])
    desk.silent()
  })

  test('shows the folder chosen with the room left, Change and Open the board, and creates nothing in it yet', async () => {
    const page = await desk.welcome()
    await desk.click(page, page.locator('#start'))
    await desk.chooseFolder(PICKER, first())

    await sees(page.locator('#where'), first())
    await sees(page.locator('#free'), /\d+ (GB|TB)/)
    await sees(page.locator('#found'), 'Nothing yet')
    await page.locator('#change').waitFor()
    await page.locator('#open').waitFor()
    desk.shot('first-folder-chosen')
    expect(fs.readdirSync(first())).toEqual([])
    expect(desk.settings().outputDir).toBeUndefined()
    desk.silent()
  })

  test('changes the folder to one that holds the work of an earlier SkyDock, and opens the board on it with no notice that it is ready', async () => {
    const kept = loadState('sorted')
    const earlier = () => kept.output
    const page = await desk.welcome()
    await desk.click(page, page.locator('#change'))
    await desk.chooseFolder(PICKER, earlier())
    await sees(page.locator('#where'), earlier())
    await sees(page.locator('#found'), 'Work from before')

    await desk.click(page, page.locator('#open'))
    const board = await desk.board()
    await board
      .getByRole('navigation', { name: 'Folders' })
      .getByRole('link', { name: /Sion/ })
      .waitFor({ timeout: 60_000 })
    desk.shot('board-opened')

    await waitFor('the folder remembered', () => desk.settings().outputDir === earlier())
    expect(fs.readdirSync(first())).toEqual([])
    const visible = desk.windows().map((w) => w.name)
    expect(visible.filter((name) => /ready/i.test(name))).toEqual([])
    expect(desk.windows().filter((w) => w.width >= 800)).toHaveLength(1)
    fs.rmSync(kept.root, { recursive: true, force: true })
    desk.silent()
  })
})
