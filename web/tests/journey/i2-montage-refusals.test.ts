import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { startFakeStorage } from './fake-storage'
import type { FakeStorage } from './fake-storage'
import { harness } from './harness'
import { arrangeAsUsual, region, stored, uploadDialog } from './i2-helpers'
import { FILM, filmFile, montageFolder, renderFilm, STEM } from './media'
import { connectStorage, disabled, PASSWORD, said, titled } from './steps'

/* What stops an upload, each said in its own words: every refusal RULES lists, walked on a montage whose
   film is rendered and whose copies are prepared. */

let storage: FakeStorage
const j = harness({
  name: 'i2-montage-refusals',
  state: 'i2-ready',
  prepare: async () => {
    storage = await startFakeStorage({ password: PASSWORD })
  }
})
afterAll(async () => storage?.stop())

const upload = () => uploadDialog(j.page).getByRole('button', { name: 'Upload', exact: true })
const body = () => j.page.locator('body')
/* a refusal stays in the small window in the corner until it is put away */
const dismissCorner = () => j.page.getByText('Dismiss', { exact: true }).click()

describe('uploading a montage is refused', () => {
  test('opens the montage page with the storage connected', async () => {
    await j.open()
    await j.page.getByRole('link', { name: /Luc Favre/ }).click()
    await j.see('Upload…')
    await connectStorage(j.page, storage)
    await j.quiet()
  })

  test('when it has no name: a jump is not made a montage until it is named', async () => {
    await j.page.getByRole('link', { name: /Fresh files/ }).click()
    await j.page
      .getByRole('button', { name: /^Pick GX010001/ })
      .getByRole('button', { name: 'Pick' })
      .click()
    await j.page.getByRole('button', { name: /Make a montage/ }).click()
    const make = j.page.getByRole('button', { name: /^Make montage$/ })
    await make.waitFor()
    await disabled(make).toBe(true)
    await j.page.getByLabel('Name', { exact: true }).fill('   ')
    await disabled(make).toBe(true)
    await j.page.getByRole('button', { name: 'Cancel' }).click()
    await j.page.getByRole('link', { name: /Luc Favre/ }).click()
    await j.see('Upload…')
    await j.quiet()
  })

  test('when nothing is put anywhere, and says so', async () => {
    await j.page.getByRole('button', { name: 'Upload…' }).first().click()
    await uploadDialog(j.page).waitFor()
    await uploadDialog(j.page)
      .getByRole('button', { name: 'Leave Backup out of this upload' })
      .click()
    await disabled(upload()).toBe(true)
    await titled(upload()).toMatch(/Put at least one thing in a destination/)
    await j.quiet()
  })

  test('when a destination has no folder on the storage, and says so', async () => {
    await uploadDialog(j.page).getByLabel('Add a destination').selectOption('Backup')
    await uploadDialog(j.page)
      .getByRole('button', { name: 'Original videos', exact: true })
      .dragTo(region(j.page, 'Backup'))
    await disabled(upload()).toBe(true)
    await titled(upload()).toMatch(/Choose a folder on the storage for every destination used/)
    await uploadDialog(j.page).getByRole('button', { name: 'Cancel' }).click()
    await j.quiet()
  })

  test('when a file is still to process, and says how many', async () => {
    /* a person deletes a prepared copy, or the disk loses it */
    fs.rmSync(path.join(montageFolder(j.world), 'videos', 'luc_favre_20260906_090300.mp4'))
    await j.restart()
    await j.open()
    await j.page.getByRole('link', { name: /Luc Favre/ }).click()
    await j.page.getByRole('button', { name: 'Upload…' }).first().waitFor()
    await expect
      .poll(() => j.page.getByRole('button', { name: 'Upload…' }).first().isDisabled(), {
        timeout: 20_000
      })
      .toBe(true)
    await expect
      .poll(() => j.page.getByRole('button', { name: 'Upload…' }).first().getAttribute('title'))
      .toMatch(/1 file needs processing/)
    await j.quiet()
  })

  test('is possible again once the file that was missing is processed again', async () => {
    await j.page.getByRole('button', { name: 'Process again' }).click()
    await expect
      .poll(() => j.page.getByRole('button', { name: 'Upload…' }).first().isDisabled(), {
        timeout: 60_000
      })
      .toBe(false)
    expect(
      fs.existsSync(path.join(montageFolder(j.world), 'videos', 'luc_favre_20260906_090300.mp4'))
    ).toBe(true)
    await j.quiet()
  })

  test('when there is no film yet, naming the film that was looked for', async () => {
    /* the dialog is open on a film that is then taken away, and Upload is pressed before the board has noticed */
    await arrangeAsUsual(j.page)
    const film = filmFile(j.world)
    fs.renameSync(film, `${film}.aside`)
    await upload().click()
    await said(body()).toContain(`nothing named ${FILM}`)
    await said(body()).toContain('Render the film in kdenlive first')
    expect(stored(storage)).toEqual([])
    fs.renameSync(`${film}.aside`, film)
    /* the refusal stays in the corner until it is put away */
    await dismissCorner()
    await j.quiet()
  })

  test('while the film is still being written', async () => {
    const film = filmFile(j.world)
    const growing = setInterval(() => fs.appendFileSync(film, 'x'), 100)
    try {
      await j.page.getByRole('button', { name: 'Upload…' }).first().click()
      await uploadDialog(j.page).waitFor()
      await upload().click()
      await said(body()).toContain('The film is still being written')
    } finally {
      clearInterval(growing)
    }
    expect(stored(storage)).toEqual([])
    await dismissCorner()
    await j.quiet()
    renderFilm(j.world)
  })

  /* the one upload of the montage, begun slowly and under another film name, is both what another upload is
     refused for and what the film rendered under another name is taken for */
  test('while another upload is going, naming it', async () => {
    await j.page.getByRole('link', { name: /^Sion/ }).click()
    await j.page.getByRole('button', { name: 'Process 3 files' }).click()
    await j.see('3 files are ready to upload', 60_000)

    await storage.admin.latency(1200)
    await j.page.getByRole('link', { name: /Luc Favre/ }).click()
    await j.page.getByRole('button', { name: 'Upload…' }).first().click()
    await uploadDialog(j.page).waitFor()
    /* a film rendered under another name, the only one there */
    const film = filmFile(j.world)
    fs.renameSync(film, path.join(montageFolder(j.world), 'final-cut.mp4'))
    await upload().click()
    await uploadDialog(j.page).waitFor({ state: 'detached' })

    await j.page.getByRole('link', { name: /^Sion/ }).click()
    const sion = j.page.getByRole('button', { name: /^Upload 3 files|^Uploading/ })
    await disabled(sion).toBe(true)
    await titled(sion).toMatch(/Uploading Luc Favre.* — wait for it, or cancel it/)
    await j.quiet()
  })

  test('with a film rendered under another name, when it is the only one there, taken as the film and sent named after the montage', async () => {
    await expect.poll(() => stored(storage, 'Films'), { timeout: 90_000 }).toHaveLength(2)
    await storage.admin.latency(0)
    expect(stored(storage, 'Films')).toContain(`${STEM}.mp4`)
    expect(fs.existsSync(filmFile(j.world))).toBe(true)
    expect(fs.existsSync(path.join(montageFolder(j.world), 'final-cut.mp4'))).toBe(false)
    await j.quiet()
  })
})
