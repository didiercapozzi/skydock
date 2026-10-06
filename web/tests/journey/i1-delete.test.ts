import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import {
  editorEnv,
  makeProject,
  nameFile,
  nameJump,
  putEditor,
  putTemplate,
  seedTrim
} from './i1-helpers'
import { filesUnder, montageFolder, originalsOf, renderFilm, WHO } from './media'
import { groupsOf, manifestOf } from './record'
import { details, dialogNamed, folders } from './steps'

/* A montage is deleted from its page at whatever step it has reached: its folder goes, its name and trims are
   forgotten, and its files go back to Fresh files, loose. The edit is kept aside all the same. */

const j = harness({
  name: 'i1-delete',
  state: 'sorted',
  prepare: (world) => {
    seedTrim(world, 'group_3')
    putEditor(world)
    putTemplate(world, 'club')
  },
  env: editorEnv
})
const { quiet, see } = j

const montageOf = (first: string) => groupsOf(j.world).find((g) => g.passenger?.firstname === first)
const kept = (who: string) => filesUnder(path.join(j.world.output, '.projects', who))

/* deleting from the foot of the montage's panel, once it is asked and told to go on */
const deleteIt = async (who: string) => {
  await details(j.page).getByRole('button', { name: 'Delete montage…' }).click()
  const ask = dialogNamed(j.page, 'Delete montage')
  await ask.waitFor()
  expect(await ask.innerText()).toContain(`Delete ${who}’s montage`)
  await ask
    .getByRole('button', { name: /^Delete/ })
    .last()
    .click()
  await ask.waitFor({ state: 'detached' })
}

describe('deleting a montage that has only been named', () => {
  test('asks first, and a montage that was only named goes back to loose files with its trims forgotten', async () => {
    await j.open()
    await see('Jump 2')
    await nameJump(j.page, 'Jump 2', WHO)
    await see('Prepare the files')
    await details(j.page).getByRole('button', { name: 'Delete montage…' }).click()
    const ask = dialogNamed(j.page, 'Delete montage')
    await ask.waitFor()
    const text = await ask.innerText()
    expect(text).toContain('Delete Luc Favre’s montage')
    expect(text).toMatch(/loose/i)
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await ask.waitFor({ state: 'detached' })
    expect(montageOf('Luc')).toBeDefined()

    await deleteIt(WHO)
    await expect.poll(() => montageOf('Luc')).toBeUndefined()
    await expect
      .poll(
        async () =>
          await folders(j.page)
            .getByRole('link', { name: /Luc Favre/ })
            .count()
      )
      .toBe(0)
    /* its jump is no more: its three files wait among the loose ones, with no trim left on them */
    await j.page.getByRole('link', { name: /^Fresh files/ }).click()
    await j.page.getByRole('button', { name: /^Pick DJI_20260906090000_0006_D\.MP4/ }).waitFor()
    expect(groupsOf(j.world).some((g) => g.files.some((f) => f.id === '00245caf4098e714'))).toBe(
      false
    )
    expect(manifestOf(j.world).files.filter((f) => f.cropStart != null)).toEqual([])
    await quiet()
  })
})

describe('deleting a prepared montage', () => {
  test('removes its copies and sends its files back loose, leaving the originals where they are', async () => {
    const before = originalsOf(j.world)
    await j.page.getByText('Jump 1', { exact: true }).first().click()
    await j.page.getByRole('button', { name: /Make a montage/ }).click()
    await j.page.getByLabel('Name', { exact: true }).fill('Anna Roux')
    await j.page.keyboard.press('Enter')
    await j.page.getByRole('button', { name: 'Process', exact: true }).click()
    await j.page.getByText('Make the editing project').first().waitFor({ timeout: 60_000 })
    expect(filesUnder(montageFolder(j.world, 'Anna Roux'))).toHaveLength(2)

    await deleteIt('Anna Roux')
    await expect.poll(() => fs.existsSync(montageFolder(j.world, 'Anna Roux'))).toBe(false)
    await expect.poll(() => montageOf('Anna')).toBeUndefined()
    expect(originalsOf(j.world)).toEqual(before)
    await j.page.getByRole('link', { name: /^Fresh files/ }).click()
    await j.page.getByRole('button', { name: /^Pick DJI_20260905143000/ }).waitFor()
    await quiet()
  })
})

describe('deleting a montage that has an edit', () => {
  test('names the edit on its own, removes the project, and keeps every version of it aside', async () => {
    await nameFile(j.page, 'DJI_20260906090000_0006_D.MP4', 'Marc Roux')
    await j.page.getByRole('button', { name: 'Process', exact: true }).click()
    await j.page.getByText('Make the editing project').first().waitFor({ timeout: 60_000 })
    await makeProject(j.page, path.join(j.world.computer, 'club'))
    const folder = montageFolder(j.world, 'Marc Roux')
    const project = filesUnder(folder).find((f) => f.endsWith('.kdenlive'))
    expect(project).toBeDefined()
    const mine = fs.readFileSync(path.join(folder, project!))

    await details(j.page).getByRole('button', { name: 'Delete montage…' }).click()
    const ask = dialogNamed(j.page, 'Delete montage')
    await ask.waitFor()
    expect(await ask.innerText()).toContain('the kdenlive project — the edit itself')
    await ask
      .getByRole('button', { name: /^Delete/ })
      .last()
      .click()

    await expect.poll(() => fs.existsSync(folder)).toBe(false)
    /* the edit exists nowhere else, so it is still there, whole, though the montage is not */
    expect(kept('Marc Roux')).toHaveLength(1)
    expect(
      fs
        .readFileSync(path.join(j.world.output, '.projects', 'Marc Roux', kept('Marc Roux')[0]!))
        .equals(mine)
    ).toBe(true)
    await expect.poll(() => montageOf('Marc')).toBeUndefined()
    await quiet()
  })
})

describe('deleting a montage that has its film', () => {
  test('removes the film with the rest, and the film goes with it from the board', async () => {
    await j.page.getByRole('link', { name: /^Fresh files/ }).click()
    await nameFile(j.page, 'DJI_20260906090300_0007_D.MP4', 'Eva Roux')
    await j.page.getByRole('button', { name: 'Process', exact: true }).click()
    await j.page.getByText('Make the editing project').first().waitFor({ timeout: 60_000 })
    await j.page.getByRole('button', { name: 'Make the project' }).click()
    await j.page
      .getByRole('button', { name: 'Open in kdenlive' })
      .first()
      .waitFor({ timeout: 30_000 })
    const film = path.join(montageFolder(j.world, 'Eva Roux'), 'eva_roux_20260906.mp4')
    renderFilm(j.world, 'Eva Roux', 'eva_roux_20260906.mp4')
    await j.page.getByText('The film', { exact: true }).first().waitFor({ timeout: 30_000 })
    expect(fs.existsSync(film)).toBe(true)

    await deleteIt('Eva Roux')
    await expect.poll(() => fs.existsSync(montageFolder(j.world, 'Eva Roux'))).toBe(false)
    expect(await j.page.getByText('The film', { exact: true }).count()).toBe(0)
    await expect.poll(() => montageOf('Eva')).toBeUndefined()
    expect(kept('Eva Roux')).toHaveLength(1)
    await quiet()
  })
})
