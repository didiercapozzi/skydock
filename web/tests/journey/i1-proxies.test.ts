import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import {
  editorEnv,
  groupsOf,
  makeBigClip,
  makeProject,
  montageFolder,
  nameFile,
  nameJump,
  putEditor,
  putSlowFfmpeg,
  putTemplate,
  SIDE,
  slowFfmpegEnv,
  WHO
} from './i1-helpers'
import { dropFiles } from './page'

/* The editor opens on small copies of the clips, so the project waits for them. The tool that makes them is
   the real ffmpeg, made slow or unable by the world it runs in: marks in the world's folder say when. */

const j = harness({
  name: 'i1-proxies',
  state: 'sorted',
  prepare: (world) => {
    putEditor(world)
    putSlowFfmpeg(world)
    putTemplate(world, 'club')
    makeBigClip(path.join(world.computer, 'GX010002.MP4'), '2026-09-06T17:00:00')
    makeBigClip(path.join(world.computer, 'GX010003.MP4'), '2026-09-06T18:00:00')
    fs.writeFileSync(path.join(world.root, 'hold-proxies'), '')
  },
  env: (world) => ({ ...editorEnv(world), ...slowFfmpegEnv(world) })
})
const { quiet, see } = j

const mark = (name: string) => path.join(j.world.root, name)
const panel = () => j.page.locator(SIDE)
/* the corner lists the clips still getting a small copy over the panel on the right: a person folds it away */
const foldCorner = async () => {
  const fold = j.page.getByRole('button', { name: 'Hide the list' })
  if (await fold.count()) await fold.first().click()
}
const makeIt = () => j.page.getByRole('button', { name: 'Make the project' })

describe('the project waits for the proxies', () => {
  test('cannot be made while a clip is still getting its proxy, and says how many it waits for', async () => {
    await j.open()
    await see('Jump 2')
    await dropFiles(j.page, [path.join(j.world.computer, 'GX010002.MP4')])
    await see('GX010002.MP4 has been added to Fresh files', 60_000)
    await foldCorner()
    await nameFile(j.page, 'GX010002', 'Noé Roux')
    await j.page.getByRole('button', { name: 'Process', exact: true }).click()
    await j.page.getByText('Make the editing project').first().waitFor({ timeout: 60_000 })

    await j.page.getByText('waiting for 1 proxy').waitFor()
    expect(await makeIt().isDisabled()).toBe(true)
    expect(
      fs.readdirSync(montageFolder(j.world, 'Noé Roux')).some((f) => f.endsWith('.kdenlive'))
    ).toBe(false)
    await quiet()
  })

  test('makes the project once the clip has its proxy, with the clip playing from it', async () => {
    fs.rmSync(mark('hold-proxies'))
    await expect.poll(async () => await makeIt().isDisabled(), { timeout: 60_000 }).toBe(false)
    expect(await j.page.getByText('waiting for 1 proxy').count()).toBe(0)
    await makeProject(j.page, path.join(j.world.computer, 'club'))
    const folder = montageFolder(j.world, 'Noé Roux')
    const project = fs.readdirSync(folder).find((f) => f.endsWith('.kdenlive'))!
    const xml = fs.readFileSync(path.join(folder, project), 'utf8')
    expect(xml).toMatch(/<property name="kdenlive:proxy">[^<]*\/proxies\/[^<]*<\/property>/)
    await quiet()
  })

  test('does not wait for a clip whose proxy was tried and could not be made, which opens as it is', async () => {
    fs.writeFileSync(mark('hold-proxies'), '')
    fs.writeFileSync(mark('fail-proxies'), '')
    await j.page.getByRole('link', { name: /^Fresh files/ }).click()
    await dropFiles(j.page, [path.join(j.world.computer, 'GX010003.MP4')])
    await see('GX010003.MP4 has been added to Fresh files', 60_000)
    await foldCorner()
    await nameFile(j.page, 'GX010003', 'Zoé Roux')
    await j.page.getByRole('button', { name: 'Process', exact: true }).click()
    await j.page.getByText('Make the editing project').first().waitFor({ timeout: 60_000 })
    await j.page.getByText('waiting for 1 proxy').waitFor()

    /* the proxy is tried and fails: the board hears of it at once, and the wait is over */
    fs.rmSync(mark('hold-proxies'))
    await expect.poll(async () => await makeIt().isDisabled(), { timeout: 60_000 }).toBe(false)
    expect(await j.page.getByText('waiting for 1 proxy').count()).toBe(0)
    await makeIt().click()
    await j.page
      .getByRole('button', { name: 'Open in kdenlive' })
      .first()
      .waitFor({ timeout: 30_000 })
    const folder = montageFolder(j.world, 'Zoé Roux')
    const xml = fs.readFileSync(
      path.join(
        folder,
        fs.readdirSync(folder).find((f) => f.endsWith('.kdenlive'))!
      ),
      'utf8'
    )
    expect(xml).toContain('<property name="kdenlive:proxy">-</property>')
    expect(xml).not.toContain('kdenlive:originalurl')
    await quiet()
  })
})

describe('while a montage is being processed', () => {
  test('cannot be reset or deleted until the processing is over', async () => {
    fs.writeFileSync(mark('hold-copies'), '')
    await j.page.getByRole('link', { name: /^Fresh files/ }).click()
    await nameJump(j.page, 'Jump 2', WHO)
    await j.page.getByRole('button', { name: 'Process', exact: true }).click()
    await j.page.getByText('Preparing the files').first().waitFor()
    expect(await panel().getByRole('button', { name: 'Reset…' }).isDisabled()).toBe(true)
    expect(await panel().getByRole('button', { name: 'Delete montage…' }).isDisabled()).toBe(true)

    fs.rmSync(mark('hold-copies'))
    await j.page.getByText('Make the editing project').first().waitFor({ timeout: 60_000 })
    expect(await panel().getByRole('button', { name: 'Reset…' }).isDisabled()).toBe(false)
    expect(groupsOf(j.world).find((g) => g.passenger?.lastname === 'Favre')?.processed).toBe(true)
    await quiet()
  })
})

describe('the one template there is', () => {
  test('is simply used when it is whole, without asking which template to make the project from', async () => {
    await makeIt().click()
    await j.page
      .getByRole('button', { name: 'Open in kdenlive' })
      .first()
      .waitFor({ timeout: 30_000 })
    expect(await j.page.getByRole('dialog', { name: 'Editing templates' }).count()).toBe(0)
    const folder = montageFolder(j.world, WHO)
    expect(fs.readdirSync(folder).some((f) => f.endsWith('.kdenlive'))).toBe(true)
    await quiet()
  })
})
