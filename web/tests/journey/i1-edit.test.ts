import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import { filesUnder, FILM, filmFile, makeClip, montageFolder, projectFile, WHO } from './media'
import { editorEnv, makeAndPrepare, makeProject, putEditor, putTemplate } from './i1-helpers'
import { groupsOf } from './record'
import { details, place, preview } from './steps'

/* Once a montage has a project it is an edit: what decides its files is fixed, the film the editor leaves is
   noticed, and everything SkyDock does to it keeps the project aside first. */

const j = harness({
  name: 'i1-edit',
  state: 'sorted',
  prepare: (world) => {
    putEditor(world)
    putTemplate(world, 'club')
  },
  env: editorEnv
})
const { see, quiet } = j

const folder = () => montageFolder(j.world)
const stepOf = (words: string) =>
  expect
    .poll(async () => await place(j.page, WHO).innerText(), { timeout: 30_000 })
    .toContain(words)

describe('an edit freezes the montage', () => {
  test('shows its files a lock and says why, once the montage has a project', async () => {
    await makeAndPrepare(j)
    await makeProject(j.page, path.join(j.world.computer, 'club'))
    await j.page.getByText('This montage has an edit — change it in kdenlive.').first().waitFor()
    /* the files are no longer there to be picked, nor the name to be changed */
    expect(await j.page.getByRole('button', { name: /^Pick luc_favre/ }).count()).toBe(0)
    expect(await j.page.getByRole('button', { name: 'Change the name' }).count()).toBe(0)
    await j.page.getByText('luc_favre_20260906_090000.mp4').first().click()
    await details(j.page).getByText('This montage has an edit — change it in kdenlive.').waitFor()

    /* previewing goes on, and changing nothing: no way to save a trim, frame or turn */
    await j.page.getByText('luc_favre_20260906_090000.mp4').first().dblclick()
    const dialog = preview(j.page)
    await dialog.waitFor()
    await dialog.getByRole('button', { name: '▶ Play' }).waitFor()
    await dialog.getByText('This montage has an edit — change it in kdenlive.').waitFor()
    expect(await dialog.getByRole('button', { name: 'Save', exact: true }).count()).toBe(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'detached' })
    await quiet()
  })

  test('takes no other jump into a montage that has an edit, and says so', async () => {
    await j.page.getByRole('link', { name: /^Fresh files/ }).click()
    await j.page.getByText('Jump 1', { exact: true }).first().click()
    await j.page.getByRole('button', { name: /Make a montage/ }).click()
    await j.page.getByLabel('Name', { exact: true }).fill('luc favre')
    await j.page.getByText('Joins Luc Favre’s montage').waitFor()
    await j.page.getByRole('button', { name: 'Join montage' }).click()
    await j.page
      .getByText('Luc Favre’s montage has an edit — change it in kdenlive.')
      .first()
      .waitFor()
    expect(groupsOf(j.world).filter((g) => g.passenger)).toHaveLength(1)
    await see('Jump 1')
    await quiet()
  })
})

describe('a finished render is noticed', () => {
  test('does not take a film that cannot be read yet for a film, however still it sits', async () => {
    await place(j.page, WHO).click()
    await j.page.getByRole('heading', { name: WHO, level: 1 }).waitFor()
    /* what an editor has written so far of a render: the start of a film, which has no end to be read */
    makeClip(path.join(j.world.root, 'whole.mp4'), '2026-09-06T09:00:00', 3)
    const whole = fs.readFileSync(path.join(j.world.root, 'whole.mp4'))
    fs.writeFileSync(filmFile(j.world), whole.subarray(0, 3000))
    /* a film that cannot be read is never told, so nothing signals that it was not: the folders are looked at every
       two seconds and a film is settled after two looks the same, so the third look decides — wait for it */
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

  /* preparing again runs as a job in the corner: it is over once the corner has nothing to say about it */
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

  test('notices a project removed by hand, which lifts the lock, and one put back by hand', async () => {
    const mine = fs.readFileSync(projectFile(j.world))
    fs.rmSync(projectFile(j.world))
    await stepOf('to edit')
    await j.page.getByRole('button', { name: 'Change the name' }).waitFor()
    fs.writeFileSync(projectFile(j.world), mine)
    await stepOf('to upload')
    await j.page.getByText('This montage has an edit — change it in kdenlive.').first().waitFor()
    await quiet()
  })

  test('prepares a montage with an edit again from its originals, leaving the project, the film and every name as they were', async () => {
    const tree = filesUnder(folder())
    const [project, film] = [
      fs.readFileSync(projectFile(j.world)),
      fs.readFileSync(filmFile(j.world))
    ]
    await prepareAgain()
    expect(filesUnder(folder())).toEqual(tree)
    expect(fs.readFileSync(projectFile(j.world)).equals(project)).toBe(true)
    expect(fs.readFileSync(filmFile(j.world)).equals(film)).toBe(true)
    await quiet()
  })

  test('keeps the project aside before preparing it again, and pressing the same button twice leaves one version', async () => {
    expect(kept()).toHaveLength(1)
    expect(
      fs
        .readFileSync(path.join(j.world.output, '.projects', WHO, kept()[0]!))
        .equals(fs.readFileSync(projectFile(j.world)))
    ).toBe(true)
    expect(kept()[0]).toMatch(/^luc_favre_20260906-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.kdenlive$/)
    await prepareAgain()
    expect(kept()).toHaveLength(1)
    await quiet()
  })

  test('keeps another version once the project is not what was kept, and deletes none', async () => {
    const [first] = kept()
    fs.appendFileSync(projectFile(j.world), '\n')
    await prepareAgain()
    expect(kept()).toHaveLength(2)
    expect(kept()).toContain(first)
    await quiet()
  })
})
