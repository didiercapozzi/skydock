import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import {
  editorEnv,
  filesUnder,
  groupsOf,
  makeAndPrepare,
  makeProject,
  montageFolder,
  PROJECT,
  putEditor,
  putTemplate,
  renderFilm,
  seedTrim,
  WHO
} from './i1-helpers'

/* A montage is taken back from its page, from the foot of its panel. Reset puts it back to before processing
   and keeps what was decided about it; delete undoes it. Both ask first. The first jump of the saved state
   is filed under a destination and untouched; the second is the montage, with a trim already on its first file. */

const j = harness({
  name: 'i1-reset',
  state: 'sorted',
  prepare: (world) => {
    seedTrim(world, 'group_3')
    putEditor(world)
    putTemplate(world, 'club')
  },
  env: editorEnv
})
const { quiet } = j

const folder = () => montageFolder(j.world)
const panel = () => j.page.locator('aside[aria-label=Details]')
const dialog = (name: RegExp) => j.page.getByRole('dialog', { name })
const menuEntry = () =>
  j.page.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: /Luc Favre/ })
const luc = () => groupsOf(j.world).find((g) => g.passenger?.lastname === 'Favre')
const originals = () => filesUnder(path.join(j.world.output, 'original_files'))

describe('resetting a montage', () => {
  test('asks first, saying what goes and what stays, and changes nothing when told to cancel', async () => {
    await makeAndPrepare(j)
    await panel().getByRole('button', { name: 'Reset…' }).click()
    const ask = dialog(/Reset montage/)
    await ask.waitFor()
    const text = await ask.innerText()
    expect(text).toContain('Reset Luc Favre to before processing')
    expect(text).toContain('Deleted from this machine')
    expect(text).toContain('Kept, ready to process again')
    expect(text).toContain('never touched')
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await ask.waitFor({ state: 'detached' })
    expect(filesUnder(folder())).toHaveLength(3)
    expect(luc()?.processed).toBe(true)
    await quiet()
  })

  test('puts a processed montage back to before processing, and keeps its name and its trims', async () => {
    const before = originals()
    await panel().getByRole('button', { name: 'Reset…' }).click()
    await dialog(/Reset montage/)
      .getByRole('button', { name: 'Reset', exact: true })
      .click()
    await expect.poll(() => fs.existsSync(folder())).toBe(false)

    /* still a montage of the same name, at the step before processing, with the trim it had */
    await expect.poll(async () => await menuEntry().innerText()).toContain('to process')
    expect(luc()?.processed).toBeFalsy()
    expect(luc()?.files.some((f) => f.cropStart === 1)).toBe(true)
    expect(originals()).toEqual(before)
    await j.page.getByRole('button', { name: 'Process', exact: true }).waitFor()
    await quiet()
  })

  test('names the edit on its own in the question, and keeps it aside when the montage is reset', async () => {
    await j.page.getByRole('button', { name: 'Process', exact: true }).click()
    await j.page.getByText('Make the editing project').first().waitFor({ timeout: 60_000 })
    await makeProject(j.page, path.join(j.world.computer, 'club'))
    renderFilm(j.world)
    await expect
      .poll(async () => await menuEntry().innerText(), { timeout: 30_000 })
      .toContain('to upload')
    const project = fs.readFileSync(path.join(folder(), PROJECT))

    await panel().getByRole('button', { name: 'Reset…' }).click()
    const ask = dialog(/Reset montage/)
    await ask.waitFor()
    const text = await ask.innerText()
    expect(text).toContain('the kdenlive project — the edit itself')
    expect(text).toContain('the rendered film')
    await ask.getByRole('button', { name: 'Reset', exact: true }).click()

    /* the copies, the project and the film are gone from the folder; the edit is kept aside */
    await expect.poll(() => fs.existsSync(folder())).toBe(false)
    const kept = filesUnder(path.join(j.world.output, '.projects', WHO))
    expect(kept).toHaveLength(1)
    expect(
      fs.readFileSync(path.join(j.world.output, '.projects', WHO, kept[0]!)).equals(project)
    ).toBe(true)
    await expect.poll(async () => await menuEntry().innerText()).toContain('to process')
    expect(luc()?.passenger).toEqual({ firstname: 'Luc', lastname: 'Favre' })
    expect(luc()?.files.some((f) => f.cropStart === 1)).toBe(true)
    /* the lock is lifted: the name can be changed again */
    await j.page.getByRole('button', { name: 'Change the name' }).waitFor()
    await quiet()
  })
})
