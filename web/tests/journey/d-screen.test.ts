import * as fs from 'node:fs'
import * as path from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import { gone, photoFacts, pressed } from './d-helpers'
import { harness } from './harness'
import { dayFolder, makeBigClip, makeClip, makeOwnPhoto, originalFile, probe } from './media'
import { recorded } from './record'
import { closeClip, openClip, place, preview, said } from './steps'

/* The picture on its own: full screen, the machine's own player, and a photo turned. A jump of a big clip —
   the kind that is given a small copy to play —, a small one that is its own small copy, and a photo, on the
   board of the processed Sion; and a program standing for whatever plays videos on the machine, which records
   what it is asked to open. */

const BIG = 'DJI_20260908090000_0020_D.MP4'
const SMALL = 'DJI_20260908090040_0021_D.MP4'
const PHOTO = 'DJI_20260908090120_0022_D.JPG'

const j = harness({
  name: 'd-screen',
  state: 'processed',
  prepare: (world) => {
    const folder = dayFolder(world, '2026-09-08T09:00:00')
    makeBigClip(path.join(folder, BIG), '2026-09-08T09:00:00')
    makeClip(path.join(folder, SMALL), '2026-09-08T09:00:40')
    makeOwnPhoto(path.join(folder, PHOTO), '2026-09-08T09:01:20')
    const player = path.join(world.root, 'player.sh')
    fs.writeFileSync(player, `#!/bin/sh\nprintf '%s\\n' "$@" >> '${world.root}/played.txt'\n`, {
      mode: 0o755
    })
  },
  env: (world) => ({ SKYDOCK_PLAYER_COMMAND: path.join(world.root, 'player.sh') })
})
const { see, quiet } = j

beforeAll(() => j.page.setDefaultTimeout(15_000))

const original = (name: string) => originalFile(j.world, '2026-09-08', name)
const button = (name: string) => preview(j.page).getByRole('button', { name, exact: true })
const fullScreen = () => button('✕ Leave full screen')
/* the browser's own full screen, which is the browser's to give: it is waited for as it comes and goes */
const takesScreen = (yes: boolean) =>
  expect.poll(() => j.page.evaluate(() => document.fullscreenElement !== null)).toBe(yes)
/* leaving: Escape, and the dialog is back with the screen given up */
const leaveFullScreen = async () => {
  await takesScreen(true)
  await j.page.keyboard.press('Escape')
  await gone(fullScreen())
  await takesScreen(false)
}
const quality = () => preview(j.page).getByRole('group', { name: 'Quality' })
const tab = (name: string) =>
  preview(j.page)
    .getByRole('group', { name: 'What to change' })
    .getByRole('button', { name, exact: true })

const playing = () => j.page.evaluate(() => document.querySelector('video')?.currentSrc ?? '')

describe('the picture full screen', () => {
  test('finds the jump of a big clip, a small one and a photo, and opens the big clip by double-clicking it', async () => {
    await j.open()
    await j.page.getByRole('button', { name: 'Scan' }).click()
    await see(/12 files in 4 jumps/, 60_000)
    await j.page.getByText('Jump 3', { exact: true }).click()
    /* the big clip is given its small copy; the small one is its own */
    await j.page.getByText('▶ proxy').first().waitFor({ timeout: 60_000 })
    await openClip(j.page, BIG)
    await preview(j.page)
      .getByText(/\d of \d$/)
      .waitFor()
    await quiet()
  })

  test('takes the whole screen for the picture with the button, F or a double-click, and Escape comes back to the dialog', async () => {
    await button('⛶ Full screen').click()
    await fullScreen().waitFor()
    /* the window's own player is under the clip, to be watched rather than dragged */
    await expect.poll(() => j.page.locator('video').getAttribute('controls')).not.toBeNull()
    await leaveFullScreen()
    await preview(j.page).waitFor()

    await j.page.keyboard.press('f')
    await fullScreen().waitFor()
    await takesScreen(true)
    await j.page.keyboard.press('f')
    await gone(fullScreen())
    await takesScreen(false)

    await j.page.locator('video').dblclick({ position: { x: 40, y: 40 } })
    await fullScreen().waitFor()
    await leaveFullScreen()
    await preview(j.page).waitFor()
    await quiet()
  })

  test('opens full screen on the small copy of a clip, and switches to the file itself and back with Proxy and Original', async () => {
    await button('⛶ Full screen').click()
    await quality().waitFor()
    await pressed(quality().getByRole('button', { name: 'Proxy' }), true)
    const small = await playing()
    expect(small).not.toBe('')

    await quality().getByRole('button', { name: 'Original' }).click()
    await pressed(quality().getByRole('button', { name: 'Original' }), true)
    await expect.poll(playing).not.toBe(small)
    await quality().getByRole('button', { name: 'Proxy' }).click()
    await expect.poll(playing).toBe(small)

    /* it opens on the small copy again each time */
    await quality().getByRole('button', { name: 'Original' }).click()
    await leaveFullScreen()
    await button('⛶ Full screen').click()
    await pressed(quality().getByRole('button', { name: 'Proxy' }), true)
    await leaveFullScreen()
    await quiet()
  })

  test('gives a clip that is its own small copy no choice to make full screen', async () => {
    await closeClip(j.page)
    await openClip(j.page, SMALL)
    await button('⛶ Full screen').click()
    await fullScreen().waitFor()
    await gone(quality())
    await leaveFullScreen()
    await closeClip(j.page)
    await quiet()
  })

  test('shows a photo full screen at its own size, with no small copy to choose', async () => {
    await openClip(j.page, PHOTO)
    await j.page.keyboard.press('f')
    await fullScreen().waitFor()
    await gone(quality())
    expect(
      await j.page
        .locator('img[alt$=".JPG"]')
        .evaluate((img) => (img as HTMLImageElement).naturalWidth)
    ).toBe(320)
    await j.page.keyboard.press('Escape')
    await gone(fullScreen())
    await quiet()
  })
})

describe('turning a photo', () => {
  test('offers a photo only the turn and what is known of it', async () => {
    await said(preview(j.page).getByRole('group', { name: 'What to change' })).toContain('Turn')
    await said(preview(j.page).getByRole('group', { name: 'What to change' })).toContain('Info')
    await gone(tab('Cut'))
    await gone(tab('Frame'))
    await quiet()
  })

  test('turns a photo by the orientation it carries, and no pixel of it is touched', async () => {
    await tab('Turn').click()
    await j.page.keyboard.press('r')
    await pressed(button('↻ +90°'), true)
    await button('Save').click()
    await preview(j.page).waitFor({ state: 'detached' })
    await expect.poll(() => recorded(j.world, PHOTO).rotation).toBe(90)

    const sion = place(j.page, /Sion/)
    await j.page.getByText('Jump 3', { exact: true }).first().dragTo(sion)
    await sion.click()
    await see('3 files need processing')
    await j.page.getByRole('button', { name: 'Process 3 files' }).click()
    await see('6 files are ready to upload', 60_000)

    const photo = photoFacts(
      path.join(
        j.world.output,
        'processed',
        'Sion',
        fs
          .readdirSync(path.join(j.world.output, 'processed', 'Sion'))
          .find((name) => name.endsWith('.jpg'))!
      )
    )
    expect(photo.Orientation, 'turned a quarter clockwise by its orientation').toBe(6)
    expect(photo.ImageWidth, 'its pixels are as they were shot').toBe(320)
    expect(probe(original(BIG)).width).toBe(1280)
    await quiet()
  })
})

describe('in the machine’s own player', () => {
  test('hands the clip itself to whatever plays videos, nothing copied or converted first', async () => {
    await j.page.getByText(BIG, { exact: true }).first().dblclick()
    await preview(j.page).waitFor()
    await button("In the machine's player").click()
    const played = path.join(j.world.root, 'played.txt')
    await expect.poll(() => fs.existsSync(played)).toBe(true)
    expect(fs.readFileSync(played, 'utf8').trim().split('\n')).toEqual([original(BIG)])
    await preview(j.page).waitFor()
    await closeClip(j.page)
    await quiet()
  })
})
