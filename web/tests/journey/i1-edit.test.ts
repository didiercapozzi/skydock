import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import { editFile, filesUnder, FILM, filmFile, makeClip, montageFolder, WHO } from './media'
import { makeAndPrepare, makeEdit } from './i1-helpers'
import { place } from './steps'

const j = harness({
  name: 'i1-edit',
  state: 'sorted'
})
const { quiet } = j

const folder = () => montageFolder(j.world)
const stepOf = (words: string) =>
  expect
    .poll(async () => await place(j.page, WHO).innerText(), { timeout: 30_000 })
    .toContain(words)

describe('a finished render is noticed', () => {
  test('does not take a film that cannot be read yet for a film, however still it sits', async () => {
    await makeAndPrepare(j)
    await makeEdit(j)
    await place(j.page, WHO).click()
    await j.page.getByRole('heading', { name: WHO, level: 1 }).waitFor()
    makeClip(path.join(j.world.root, 'whole.mp4'), '2026-09-06T09:00:00', 3)
    const whole = fs.readFileSync(path.join(j.world.root, 'whole.mp4'))
    fs.writeFileSync(filmFile(j.world), whole.subarray(0, 3000))
    await j.page.waitForTimeout(6_500)
    expect(await place(j.page, WHO).innerText()).toContain('to render')
    expect(await j.page.getByText('The film', { exact: true }).count()).toBe(0)
    await quiet()
  })

  test('notices a film that has stopped growing and can be read, with nothing pressed, and says it is ready to upload', async () => {
    fs.copyFileSync(path.join(j.world.root, 'whole.mp4'), filmFile(j.world))
    fs.utimesSync(
      filmFile(j.world),
      new Date('2026-09-06T09:00:00'),
      new Date('2026-09-06T09:00:00')
    )
    await stepOf('to upload')
    await j.page.getByText('The film', { exact: true }).first().waitFor()
    await j.page.getByRole('button', { name: 'Upload…' }).first().waitFor()
    await j.page
      .getByRole('img', { name: /4 of 6 steps done/ })
      .first()
      .waitFor()
    await quiet()
  })

  test('shows the film above its montage with its name, how long it runs, its size and when it was rendered', async () => {
    const card = j.page.getByRole('region', { name: WHO }).last()
    const text = await card.innerText()
    expect(text).toContain(FILM)
    expect(text).toMatch(/0:03\s*·\s*[\d.]+ [KM]B\s*·\s*rendered 09:00/)
    await quiet()
  })

  test('plays the film rendered again, which replaces the one that was there', async () => {
    makeClip(filmFile(j.world), '2026-09-06T11:30:00', 5)
    await expect
      .poll(async () => await j.page.getByRole('region', { name: WHO }).last().innerText(), {
        timeout: 30_000
      })
      .toMatch(/0:05\s*·\s*[\d.]+ [KM]B\s*·\s*rendered 11:30/)
    await quiet()
  })

  test('lets the film that was rendered last be watched where it is shown', async () => {
    await j.page.getByRole('button', { name: 'Watch the film here' }).click()
    const film = j.page.locator('video').first()
    await film.waitFor()
    const src = (await film.getAttribute('src')) ?? ''
    expect(src).toContain('luc_favre_20260906.mp4')
    expect(src).toContain(String(Math.floor(fs.statSync(filmFile(j.world)).mtimeMs / 1000)))
    await quiet()
  })
})

describe('the edit is kept aside, every version of it', () => {
  const kept = () => filesUnder(path.join(j.world.output, '.projects', WHO))
  const copy = () => path.join(folder(), 'videos', 'luc_favre_20260906_090000.mp4')

  const prepareAgain = async () => {
    const before = fs.statSync(copy()).mtimeMs
    await j.page.getByRole('button', { name: 'More', exact: true }).click()
    await j.page.getByRole('button', { name: 'Process again' }).click()
    await expect
      .poll(() => fs.statSync(copy()).mtimeMs, { timeout: 60_000 })
      .toBeGreaterThan(before)
    await expect
      .poll(async () => await j.page.getByText('Preparing the files').count(), { timeout: 60_000 })
      .toBe(0)
  }

  test('notices an edit removed by hand, and one put back by hand', async () => {
    const mine = fs.readFileSync(editFile(j.world))
    fs.rmSync(editFile(j.world))
    await stepOf('to edit')
    fs.writeFileSync(editFile(j.world), mine)
    await stepOf('to upload')
    await quiet()
  })

  test('prepares a montage with an edit again from its originals, leaving the edit, the film and every name as they were', async () => {
    const tree = filesUnder(folder())
    const [edited, film] = [fs.readFileSync(editFile(j.world)), fs.readFileSync(filmFile(j.world))]
    await prepareAgain()
    expect(filesUnder(folder())).toEqual(tree)
    expect(fs.readFileSync(editFile(j.world)).equals(edited)).toBe(true)
    expect(fs.readFileSync(filmFile(j.world)).equals(film)).toBe(true)
    await quiet()
  })

  test('keeps the edit aside before preparing it again, and pressing the same button twice leaves one version', async () => {
    expect(kept()).toHaveLength(1)
    expect(
      fs
        .readFileSync(path.join(j.world.output, '.projects', WHO, kept()[0]!))
        .equals(fs.readFileSync(editFile(j.world)))
    ).toBe(true)
    expect(kept()[0]).toMatch(/^luc_favre_20260906-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.edit\.json$/)
    await prepareAgain()
    expect(kept()).toHaveLength(1)
    await quiet()
  })

  test('keeps another version once the edit is not what was kept, and deletes none', async () => {
    const [first] = kept()
    fs.appendFileSync(editFile(j.world), '\n')
    await prepareAgain()
    expect(kept()).toHaveLength(2)
    expect(kept()).toContain(first)
    await quiet()
  })
})
