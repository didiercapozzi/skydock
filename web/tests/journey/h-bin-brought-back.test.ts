import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { harness } from './harness'
import { onStorage, storageOf, uploadSion } from './f-helpers'
import { originalFile } from './media'
import { dialogNamed } from './steps'

/* Whatever state a file is in — sent to the storage, freed, fetched back — it can be put in the bin when
   somebody wants it gone: the bin takes this machine's copy, and nothing the storage holds is touched
   (RULES, Putting files in the bin). */

const fake = storageOf()
const j = harness({ name: 'h-bin-brought-back', state: 'processed' })
const { see, quiet } = j
beforeAll(fake.start)
afterAll(fake.stop)

const NAME = 'DJI_20260905100240_0002_D.MP4'
const COPY = 'sion_20260905_100240.mp4'
const SENT = 'DJI_20260905100520_0003_D.MP4'
const SENT_COPY = 'sion_20260905_100520.mp4'
const original = (name: string) => originalFile(j.world, '2026-09-05', name)
const sion = (...parts: string[]) => onStorage(fake.get(), 'club', 'Dropzones', 'Sion', ...parts)

/* the file looked at, then Remove… in its panel, then the bin chosen */
const putInTheBin = async (name: string) => {
  /* a day whose files are all on the storage is folded into one line, opened by a click */
  const folded = j.page.getByRole('button', { name: /on the storage$/ })
  if (await folded.count()) await folded.first().click()
  await j.page.getByText(name, { exact: true }).first().click()
  await j.page.getByRole('button', { name: /Remove…/ }).click()
  /* the dialog says the storage keeps its own copy, and offers only the bin for what is up there */
  await j.page.getByText(/is on the storage as well, which keeps its own copy/).waitFor()
  expect(await j.page.getByRole('button', { name: 'Loose in Fresh files' }).count()).toBe(0)
  await j.page.getByRole('button', { name: 'Put in the bin' }).click()
  await j.page.getByText(name, { exact: true }).first().waitFor({ state: 'detached' })
}

const binned = () =>
  fs
    .readdirSync(j.world.trash)
    .flatMap((folder) =>
      fs.readdirSync(path.join(j.world.trash, folder), { recursive: true }).map(String)
    )

describe('a file that went up and is still here', () => {
  test('can be put in the bin: the bin takes this machine’s copy and the storage keeps its own', async () => {
    await uploadSion(j, fake.get())
    await putInTheBin(SENT)

    expect(await j.page.getByText(/is on the storage already/).count(), 'not turned away').toBe(0)
    expect(fs.existsSync(original(SENT)), 'moved out of the originals').toBe(false)
    expect(
      binned().some((file) => file.endsWith(SENT)),
      'moved, not erased'
    ).toBe(true)
    expect(fs.existsSync(sion(SENT_COPY)), 'the storage keeps what it holds').toBe(true)
    await quiet()
  })
})

describe('a file brought back from the storage', () => {
  test('is on this machine again after being sent, freed and fetched back on asking', async () => {
    await j.page.getByRole('button', { name: 'Free up space…' }).click()
    await dialogNamed(j.page, 'Free up space')
      .getByRole('button', { name: /^Check and free/ })
      .click()
    await see(/Sion: 2 files freed from this machine/, 60_000)
    expect(fs.existsSync(original(NAME))).toBe(false)

    await j.page.getByRole('button', { name: 'On the storage', exact: true }).click()
    const row = j.page.getByRole('link', { name: new RegExp(COPY) })
    await row.waitFor()
    await row.locator('xpath=..').getByRole('button', { name: 'More' }).click()
    await j.page
      .getByRole('group', { name: 'More' })
      .getByRole('button', { name: 'Bring back' })
      .click()
    await see(/is back — the copy that was delivered, already cut, so its trim is cleared/, 60_000)
    expect(fs.existsSync(original(NAME))).toBe(true)
    await quiet()
  })

  test('can be put in the bin as well: the bin takes this machine’s copy and the storage keeps its own', async () => {
    await j.page.getByRole('button', { name: 'Local', exact: true }).click()
    await putInTheBin(NAME)

    expect(await j.page.getByText(/is on the storage already/).count(), 'not turned away').toBe(0)
    expect(fs.existsSync(original(NAME)), 'moved out of the originals').toBe(false)
    expect(
      binned().some((file) => file.endsWith(NAME)),
      'moved, not erased'
    ).toBe(true)
    expect(fs.existsSync(sion(COPY)), 'the storage keeps what it holds').toBe(true)
    await quiet()
  })
})
