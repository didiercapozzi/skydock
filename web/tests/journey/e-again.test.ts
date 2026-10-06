import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { identities } from './e-helpers'
import { harness } from './harness'
import { storageOf, uploadsAsked } from './f-helpers'
import { recordedUploads } from './record'
import { connectStorage, folders, openPlace, pickInDialog, uploadButton } from './steps'

/* A destination whose first day has gone up and whose second day has just been filed into it: the step beside
   what it owes deals with the files that need it and nothing else. Starts from the three processed copies of
   Sion, which are sent first. */

const fake = storageOf()
const j = harness({ name: 'e-again', state: 'processed' })
const { see, quiet, open } = j
beforeAll(fake.start)
afterAll(fake.stop)

const copies = () => path.join(j.world.output, 'processed', 'Sion')
const region = () => j.page.getByRole('region', { name: 'Sion' })
/* what the storage was asked to take, by the name of each film */
const videosSent = async () => (await uploadsAsked(fake.get())).filter((n) => n.endsWith('.mp4'))
const SECOND_DAY = ['sion_20260905_143000.mp4', 'sion_20260905_143300.mp4']

describe('the page of a destination that is connected to a folder', () => {
  test('connects the storage and gives the destination its folder, asked for when the upload is pressed', async () => {
    await open()
    await connectStorage(j.page, fake.get())
    await openPlace(j.page, 'Sion')
    await uploadButton(j.page).click()
    await j.page.locator('[data-nas-folder-dialog]').waitFor()
    await pickInDialog(j.page, ['club', 'Dropzones', 'Sion'])
    await see('They go to the storage, into /club/Dropzones/Sion.')
    await quiet()
  })

  test('is headed by who it is, with a menu of three dots for changing its folder and taking it off the board, and a Local and an On the storage tab under it', async () => {
    await region().getByRole('heading', { name: 'Sion', level: 1 }).waitFor()
    await region().getByText('3 files', { exact: true }).first().waitFor()
    await region().getByRole('button', { name: 'More' }).click()
    await j.page.getByRole('button', { name: 'Change folder…' }).waitFor()
    await j.page.getByRole('button', { name: 'Remove destination…' }).waitFor()
    await j.page.keyboard.press('Escape')
    const tabs = region().getByRole('group', { name: 'Where to look' })
    expect(await tabs.getByRole('button', { name: 'Local' }).getAttribute('aria-pressed')).toBe(
      'true'
    )
    await tabs.getByRole('button', { name: 'On the storage' }).waitFor()
    await quiet()
  })

  test('heads its page as a calm page is, with its name, its count, a search and a menu, and says in its card which folder on the storage the files go into', async () => {
    await region().getByRole('button', { name: 'Search' }).waitFor()
    await region().getByRole('button', { name: 'More' }).waitFor()
    expect(await region().innerText()).toContain('/club/Dropzones/Sion')
    await region().getByRole('button', { name: 'More' }).click()
    await j.page.getByRole('button', { name: 'Change folder…' }).waitFor()
    await j.page.keyboard.press('Escape')
    await quiet()
  })
})

describe('a destination whose first day is on the storage and whose second day is filed in', () => {
  let first: Record<string, string>

  test('sends the first day, which is then everything on the storage', async () => {
    first = identities(copies())
    await uploadButton(j.page).click()
    await expect.poll(async () => (await videosSent()).length, { timeout: 60_000 }).toBe(3)
    await expect
      .poll(() => [...recordedUploads(j.world).values()].filter(Boolean).length, {
        timeout: 30_000
      })
      .toBe(3)
    /* the board is opened again to read what went up: it is the record that says */
    await open()
    await openPlace(j.page, 'Sion')
    await see('Everything is on the storage')
    await quiet()
  })

  test('files the second jump into it, and says plainly that two files need processing', async () => {
    const sion = folders(j.page).getByRole('link', { name: /Sion/ })
    await openPlace(j.page, /Fresh files/)
    await j.page.getByText('Jump 1', { exact: true }).dragTo(sion)
    await openPlace(j.page, 'Sion')
    await j.page.getByRole('heading', { name: '2 files need processing' }).waitFor()
    await j.page.getByRole('button', { name: 'Process 2 files' }).waitFor()
    expect(await j.page.getByRole('button', { name: /^Upload/ }).count()).toBe(0)
    await quiet()
  })

  test('counts every file of the folder that needs processing in the step beside what it owes, whatever a search is showing', async () => {
    await region().getByRole('button', { name: 'Search' }).click()
    await region().getByRole('textbox', { name: 'Find a file' }).fill('143000')
    await j.page.getByText('DJI_20260905143000_0004_D.MP4').first().waitFor()
    await expect
      .poll(() => j.page.getByText('DJI_20260905143300_0005_D.MP4').count(), {
        message: 'the search hides one'
      })
      .toBe(0)
    await j.page.getByRole('button', { name: 'Process 2 files' }).waitFor()
    await region().getByRole('textbox', { name: 'Find a file' }).fill('')
    await quiet()
  })

  test('prepares only the two that need it, leaves the day already on the storage as it is, and names the new copies after the destination', async () => {
    await j.page.getByRole('button', { name: 'Process 2 files' }).click()
    await see('2 files are ready to upload', 60_000)
    expect(fs.readdirSync(copies()).sort()).toEqual(
      [
        'sion_20260905_100000.mp4',
        'sion_20260905_100240.mp4',
        'sion_20260905_100520.mp4',
        ...SECOND_DAY
      ].sort()
    )
    const now = identities(copies())
    for (const [name, was] of Object.entries(first))
      expect(now[name], `${name} was not written again`).toBe(was)
    expect(
      [...recordedUploads(j.world).values()].filter(Boolean),
      'the record of having gone up'
    ).toHaveLength(3)
    await quiet()
  })

  test('uploads the one day that was prepared, and nothing of the first day again', async () => {
    await uploadButton(j.page).click()
    await expect.poll(async () => (await videosSent()).length, { timeout: 60_000 }).toBe(5)
    expect(await videosSent()).toEqual(
      [
        'sion_20260905_100000.mp4',
        'sion_20260905_100240.mp4',
        'sion_20260905_100520.mp4',
        ...SECOND_DAY
      ].sort()
    )
    await quiet()
  })
})
