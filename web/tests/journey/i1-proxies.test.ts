import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import { dropFiles } from './page'
import { nameFile, putSlowFfmpeg, slowFfmpegEnv } from './i1-helpers'
import { makeBigClip } from './media'

const j = harness({
  name: 'i1-proxies',
  state: 'sorted',
  prepare: (world) => {
    putSlowFfmpeg(world)
    makeBigClip(path.join(world.computer, 'GX010002.MP4'), '2026-09-06T17:00:00')
    makeBigClip(path.join(world.computer, 'GX010003.MP4'), '2026-09-06T18:00:00')
    fs.writeFileSync(path.join(world.root, 'hold-proxies'), '')
  },
  env: slowFfmpegEnv
})
const { quiet, see } = j

const mark = (name: string) => path.join(j.world.root, name)
const foldCorner = async () => {
  const fold = j.page.getByRole('button', { name: 'Hide the list' })
  if (await fold.count()) await fold.first().click()
}

describe('the small copies of a montage’s clips', () => {
  test('are counted while a clip is still getting its own, and the film editor opens at once', async () => {
    await j.open()
    await see('Jump 2')
    await dropFiles(j.page, [path.join(j.world.computer, 'GX010002.MP4')])
    await see('GX010002.MP4 has been added to Fresh files', 60_000)
    await foldCorner()
    await nameFile(j.page, 'GX010002', 'Noé Roux')
    await j.page.getByText('Edit the film').first().waitFor({ timeout: 60_000 })

    await j.page.getByText('waiting for 1 proxy').waitFor()
    expect(await j.page.getByRole('button', { name: 'Edit the film' }).first().isEnabled()).toBe(
      true
    )
    await quiet()
  })

  test('are no longer waited for once the clip has its own', async () => {
    fs.rmSync(mark('hold-proxies'))
    await expect
      .poll(async () => await j.page.getByText('waiting for 1 proxy').count(), { timeout: 60_000 })
      .toBe(0)
    await quiet()
  })

  test('are not waited for when the small copy was tried and could not be made', async () => {
    fs.writeFileSync(mark('hold-proxies'), '')
    fs.writeFileSync(mark('fail-proxies'), '')
    await j.page.getByRole('link', { name: /^Fresh files/ }).click()
    await dropFiles(j.page, [path.join(j.world.computer, 'GX010003.MP4')])
    await see('GX010003.MP4 has been added to Fresh files', 60_000)
    await foldCorner()
    await nameFile(j.page, 'GX010003', 'Zoé Roux')
    await j.page.getByText('Edit the film').first().waitFor({ timeout: 60_000 })
    await j.page.getByText('waiting for 1 proxy').waitFor()

    fs.rmSync(mark('hold-proxies'))
    await expect
      .poll(async () => await j.page.getByText('waiting for 1 proxy').count(), { timeout: 60_000 })
      .toBe(0)
    await quiet()
  })
})
