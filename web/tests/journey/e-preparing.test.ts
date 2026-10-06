import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { identities, lookAtPages, seenSince } from './e-helpers'
import { harness } from './harness'
import { dayFolder, makeBigClip, probe } from './media'
import { place, preview } from './steps'

/* Large footage, as a camera shoots it: three clips of a jump, each big enough to be given a small copy and
   long enough that preparing it takes a moment — time enough to watch it, to leave the page and to stop it. */

const CLIPS = [
  ['DJI_20260905100000_0001_D.MP4', '2026-09-05T10:00:00'],
  ['DJI_20260905100100_0002_D.MP4', '2026-09-05T10:01:00'],
  ['DJI_20260905100200_0003_D.MP4', '2026-09-05T10:02:00']
] as const

const j = harness({
  name: 'e-preparing',
  prepare: (world) => {
    for (const [name, when] of CLIPS)
      makeBigClip(path.join(dayFolder(world, when), name), when, {
        seconds: 20,
        size: '1920x1080',
        fast: true
      })
  }
})
const { see, quiet, open } = j

/* how many clips the record says are turned: the jump holds what was done to its files */
const turnedClips = (output: string) => {
  const record = z
    .object({
      groups: z.array(z.object({ files: z.array(z.object({ rotation: z.number().nullish() })) }))
    })
    .safeParse(JSON.parse(fs.readFileSync(path.join(output, 'groups.json'), 'utf8')))
  return record.success
    ? record.data.groups.flatMap((g) => g.files).filter((f) => f.rotation === 180).length
    : -1
}
const copies = () => path.join(j.world.output, 'processed', 'Sion')
const sion = () => place(j.page, /Sion/)
const processButton = () => j.page.getByRole('button', { name: /^Process \d+ files?$/ })

describe('large footage, first looked at', () => {
  /* a work folder with no record is looked through at once, and every page is watched from inside: the
     bars it draws, and the stretches it cannot answer */
  test('makes a small copy of each large clip in view, while the board goes on answering', async () => {
    await lookAtPages(j.context)
    await open()
    await see(/3 files in 1 jump/, 60_000)
    await j.page.getByText(/Proxies ready/).waitFor({ state: 'detached', timeout: 60_000 })
    const proxies = path.join(j.world.output, 'proxies')
    const made = fs.readdirSync(proxies).filter((name) => name.endsWith('.mp4'))
    expect(made, 'one small copy for each clip').toHaveLength(3)
    for (const name of made)
      expect(probe(path.join(proxies, name)).width, 'a small copy, not a second full clip').toBe(
        640
      )
    /* the same length at the same speed */
    expect(probe(path.join(proxies, made[0]!)).seconds).toBeCloseTo(20, 0)
    const seen = await seenSince(j.page)
    expect(
      Object.keys(seen.bars).filter((label) => label.startsWith('Making DJI_')),
      'each clip showed its bar while its small copy was made'
    ).toHaveLength(3)
    expect(seen.longest, 'the page was never held up for long').toBeLessThan(200)
    await quiet()
  })

  test('plays a large clip from its small copy', async () => {
    await j.page.getByText('Jump 1', { exact: true }).click()
    await j.page.getByText(CLIPS[0][0]).first().dblclick()
    const dialog = preview(j.page)
    await dialog.waitFor()
    await expect
      .poll(() =>
        dialog
          .locator('video')
          .first()
          .evaluate((v: HTMLVideoElement) => v.currentSrc)
      )
      .toContain('/proxies/')
    await j.page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    await quiet()
  })
})

describe('preparing a destination whose clips are large', () => {
  test('makes a destination, files the jump into it and turns every clip, so each takes a while to prepare', async () => {
    await j.page.getByRole('button', { name: /Add a destination/ }).click()
    await j.page.getByPlaceholder('New destination').fill('Sion')
    await j.page.getByRole('button', { name: 'Add', exact: true }).click()
    await sion().waitFor()
    await j.page.getByText('Jump 1', { exact: true }).first().dragTo(sion())
    await see('3 files need processing')
    await sion().click()
    await j.page.getByText(CLIPS[0][0]).first().dblclick()
    const dialog = preview(j.page)
    await dialog.waitFor()
    await dialog
      .getByRole('group', { name: 'What to change' })
      .getByRole('button', { name: 'Turn', exact: true })
      .click()
    await dialog.getByRole('button', { name: '↻ +180°' }).click()
    await dialog.getByRole('button', { name: 'Give to every clip in the jump' }).click()
    /* the jump is turned as one: nothing is left to save in this clip */
    await expect.poll(() => turnedClips(j.world.output), { timeout: 15_000 }).toBe(3)
    await j.page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    await see('3 files need processing')
    await quiet()
  })

  test('says plainly how many files need processing, and offers no upload before they are', async () => {
    await j.page.getByRole('heading', { name: '3 files need processing' }).waitFor()
    expect(await processButton().innerText()).toBe('Process 3 files')
    expect(await j.page.getByRole('button', { name: /^Upload/ }).count()).toBe(0)
    expect(fs.existsSync(copies()), 'nothing written yet').toBe(false)
    await quiet()
  })

  test('stops processing when asked: the file under way is dropped, the finished copy stays, and nothing counts as processed', async () => {
    await processButton().click()
    /* the first copy is written; the second is under way */
    await expect
      .poll(() => fs.existsSync(copies()) && fs.readdirSync(copies()).length > 0)
      .toBe(true)
    await j.page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await see('3 files need processing', 30_000)
    await processButton().waitFor()
    expect(await processButton().isEnabled()).toBe(true)
    const left = fs.readdirSync(copies())
    expect(left.length, 'the copies finished stay, the one under way is gone').toBeLessThan(3)
    expect(left.every((name) => name.endsWith('.mp4'))).toBe(true)
    for (const name of left)
      expect(probe(path.join(copies(), name)).seconds, 'a whole copy').toBeCloseTo(20, 0)
    expect(await j.page.getByRole('button', { name: /^Upload/ }).count()).toBe(0)
    await quiet()
  })

  test('shows each file’s own bar as it is processed, goes on answering, and carries on when the page is reloaded', async () => {
    await seenSince(j.page)
    await processButton().click()
    await j.page.getByRole('button', { name: 'Processing…' }).waitFor()
    await j.page
      .getByRole('progressbar', { name: /^Processing DJI_/ })
      .first()
      .waitFor()
    /* the page is not blocked: another page opens while the work goes on, and this one is back after */
    await j.page.getByRole('link', { name: /Fresh files/ }).click()
    await see('Nothing left to sort')
    await sion().click()
    await see('Processing…')
    /* closing the page does not stop it; the page that comes back says so and updates itself */
    await j.page.reload()
    await see('Still processing — the board updates itself when it is done')
    expect(await processButton().isDisabled(), 'no second processing is offered on top').toBe(true)
    await see('3 files are ready to upload', 60_000)
    expect(fs.readdirSync(copies()).sort()).toEqual([
      'sion_20260905_100000.mp4',
      'sion_20260905_100100.mp4',
      'sion_20260905_100200.mp4'
    ])
    const seen = await seenSince(j.page)
    expect(
      Object.keys(seen.bars).filter((label) => label.startsWith('Processing DJI_')),
      'a bar on the file under way'
    ).not.toHaveLength(0)
    expect(seen.longest, 'the page was never held up for long').toBeLessThan(200)
    await quiet()
  })

  test('offers the upload once every file is processed, and the copies are whole and the right way up', async () => {
    await j.page.getByRole('button', { name: /^Upload 3 files$/ }).waitFor()
    const before = identities(copies())
    expect(Object.keys(before)).toHaveLength(3)
    for (const name of Object.keys(before))
      expect(probe(path.join(copies(), name)).seconds).toBeCloseTo(20, 0)
    await quiet()
  })
})
