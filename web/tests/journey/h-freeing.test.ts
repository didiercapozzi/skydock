import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  folders,
  onStorage,
  openPlace,
  recordedJumps,
  recordedRemotePaths,
  recordedUploads,
  storageOf,
  uploadButton,
  uploadSion,
  uploadsAsked
} from './f-helpers'
import { harness } from './harness'

/* Giving the room back and fetching a file again: a destination whose files are on the storage is freed,
   asked first, proved by the bytes up there, and what comes back comes back because somebody asked for it.
   It starts from the files prepared, and sends them itself. */

const fake = storageOf()
const j = harness({ name: 'h-freeing', state: 'processed' })
const { see, quiet, open } = j
beforeAll(fake.start)
afterAll(fake.stop)

/* the destination holds two jumps: the morning's, which the saved state sorted into it, and the afternoon's */
const MORNING = [
  'DJI_20260905100000_0001_D.MP4',
  'DJI_20260905100240_0002_D.MP4',
  'DJI_20260905100520_0003_D.MP4'
]
const AFTERNOON = ['DJI_20260905143000_0004_D.MP4', 'DJI_20260905143300_0005_D.MP4']
const MORNING_COPIES = [
  'sion_20260905_100000.mp4',
  'sion_20260905_100240.mp4',
  'sion_20260905_100520.mp4'
]
const AFTERNOON_COPIES = ['sion_20260905_143000.mp4', 'sion_20260905_143300.mp4']
const COPIES = [...MORNING_COPIES, ...AFTERNOON_COPIES].sort()
const original = (name: string) => path.join(j.world.output, 'original_files', '2026-09-05', name)
const copiesDir = () => path.join(j.world.output, 'processed', 'Sion')
const sion = (...parts: string[]) => onStorage(fake.get(), 'club', 'Dropzones', 'Sion', ...parts)

const openSion = async () => {
  await openPlace(j, 'Sion')
  await j.page.getByRole('region', { name: 'Sion' }).waitFor()
}

/* asking to free the destination, and confirming in the dialog that asks first */
const free = async () => {
  await j.page.getByRole('button', { name: 'Free up space…' }).click()
  await j.page
    .getByRole('dialog', { name: 'Free up space' })
    .getByRole('button', { name: /^Check and free/ })
    .click()
}

describe('the afternoon so far', () => {
  test('is on the storage already: connected, a folder chosen and the morning’s three files sent', async () => {
    await uploadSion(j, fake.get())
    await quiet()
  })

  test('has the afternoon’s jump filed into the destination, prepared and sent as well', async () => {
    await openPlace(j, /Fresh files/)
    await j.page
      .getByText('Jump 1', { exact: true })
      .dragTo(folders(j).getByRole('link', { name: /Sion/ }))
    await see('2 files need processing')
    await j.page.getByRole('button', { name: 'Process 2 files' }).click()
    await see('2 files are ready to upload', 60_000)
    await uploadButton(j).click()
    await see('Uploaded 2 files', 60_000)
    await open()
    await openSion()
    await see('5 of 5 on the storage')
    expect(fs.readdirSync(sion()).sort()).toEqual(COPIES)
    await quiet()
  })
})

describe('freeing space', () => {
  test('asks first, saying what is proved, what is deleted and what stays, and deletes nothing when it is turned down', async () => {
    await j.page.getByRole('button', { name: 'Free up space…' }).click()
    const dialog = j.page.getByRole('dialog', { name: 'Free up space' })
    await dialog.getByText('Proved first').waitFor()
    await dialog
      .getByText(/each of the 5 copies that went up is hashed here and by the storage/)
      .waitFor()
    await dialog.getByText(/the originals, the copies and the working copies/).waitFor()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'detached' })
    for (const name of [...MORNING, ...AFTERNOON])
      expect(fs.existsSync(original(name)), name).toBe(true)
    expect(fs.readdirSync(copiesDir()).sort()).toEqual(COPIES)
    await quiet()
  })

  test('is refused while the storage cannot be reached, and nothing is deleted', async () => {
    const storage = fake.get()
    await storage.admin.unreachable(true)
    await free()
    await see(/freeing needs it to prove it holds the files/)
    await storage.admin.unreachable(false)
    for (const name of MORNING) expect(fs.existsSync(original(name)), name).toBe(true)
    expect(fs.readdirSync(copiesDir()).sort()).toEqual(COPIES)
    await quiet()
  })

  test('is refused naming each file the storage does not hold as it was sent, and nothing is deleted', async () => {
    const storage = fake.get()
    await open()
    await openSion()
    await storage.admin.corrupt('/club/Dropzones/Sion/sion_20260905_100240.mp4')
    await free()
    await see(/sion_20260905_100240\.mp4 on the storage is not the file that was sent/)
    for (const name of MORNING) expect(fs.existsSync(original(name)), name).toBe(true)
    expect(fs.readdirSync(copiesDir()).sort()).toEqual(COPIES)
    /* the window of the refusal stays until it is put away */
    const window = j.page.getByRole('complementary', { name: 'Freeing Sion' })
    await window.getByText(/not the file that was sent/).waitFor()
    await window.getByRole('button', { name: 'Dismiss' }).click()
    await window.waitFor({ state: 'detached' })
    await quiet()
  })

  test('frees a dropzone: proves the storage holds each file, shows it going in the corner and in the transfers, then deletes the originals and the copies', async () => {
    const storage = fake.get()
    const copy = path.join(copiesDir(), 'sion_20260905_100240.mp4')
    const made = fs.statSync(copy)
    fs.copyFileSync(copy, sion('sion_20260905_100240.mp4'))
    fs.utimesSync(sion('sion_20260905_100240.mp4'), made.atime, made.mtime)

    await storage.admin.latency(1000)
    await free()
    const window = j.page.getByRole('complementary', { name: 'Freeing Sion' })
    await window.waitFor()
    await window.getByText(/Proving the storage holds every file that went up/).waitFor()
    await j.page.getByRole('button', { name: 'Transfers' }).click()
    await j.page.getByRole('list', { name: 'Going now' }).getByText('Freeing Sion').waitFor()
    /* nothing is deleted before the storage is proved */
    for (const name of MORNING) expect(fs.existsSync(original(name)), name).toBe(true)
    await window.waitFor({ state: 'detached', timeout: 120_000 })
    await storage.admin.latency(0)

    for (const name of [...MORNING, ...AFTERNOON])
      expect(fs.existsSync(original(name)), name).toBe(false)
    expect(fs.readdirSync(copiesDir())).toEqual([])
    expect(fs.readdirSync(sion()).sort()).toEqual(COPIES)
    await see(/Sion: 5 files freed from this machine/)
    await j.page
      .getByRole('complementary', { name: 'Transfers' })
      .getByRole('button', { name: 'Close' })
      .click()
    await quiet()
  })
})

describe('what is freed', () => {
  test('is no longer listed among the files this machine holds, and the storage tab says it is only there', async () => {
    await see('No files yet')
    for (const name of COPIES) expect(await j.page.getByText(name).count(), name).toBe(0)
    await j.page.getByRole('button', { name: 'On the storage', exact: true }).click()
    await see('5 files')
    for (const name of COPIES)
      await j.page.getByRole('link', { name: new RegExp(`${name} .*only there`) }).waitFor()
    await quiet()
  })

  test('is left as it is by a scan, which brings nothing back', async () => {
    await j.page.getByRole('button', { name: 'Scan' }).click()
    await see(/Scan: /, 60_000)
    for (const name of [...MORNING, ...AFTERNOON])
      expect(fs.existsSync(original(name)), name).toBe(false)
    await j.page.getByRole('button', { name: 'Local', exact: true }).click()
    await see('No files yet')
    await quiet()
  })
})

describe('bring back', () => {
  const transfers = () => j.page.getByRole('complementary', { name: 'Transfers' })
  const fetched = 'DJI_20260905100240_0002_D.MP4'

  test('fetches a file back from the storage tab on asking, shown going in the corner with its name and size', async () => {
    const storage = fake.get()
    await j.page.getByRole('button', { name: 'On the storage', exact: true }).click()
    const row = j.page.getByRole('link', { name: /sion_20260905_100240\.mp4/ })
    await row.waitFor()
    await storage.admin.latency(800)
    await row.locator('xpath=..').getByRole('button', { name: 'More' }).click()
    await j.page
      .getByRole('group', { name: 'More' })
      .getByRole('button', { name: 'Bring back' })
      .click()

    const corner = j.page.getByRole('complementary', { name: 'Bringing back from the storage' })
    await corner.waitFor()
    await corner.getByText(fetched).waitFor()
    await corner.getByText('86 KB').waitFor()
    await corner.getByRole('progressbar').first().waitFor()
    await see(/is back — the copy that was delivered, already cut, so its trim is cleared/, 60_000)
    await storage.admin.latency(0)
    await corner.waitFor({ state: 'detached' })
    expect(fs.existsSync(original(fetched))).toBe(true)
    await quiet()
  })

  test('keeps it with the transfers as brought back', async () => {
    await j.page.getByRole('button', { name: 'Transfers' }).click()
    const kept = transfers().getByRole('button', { name: /^Brought back · / })
    await kept.waitFor()
    expect(await kept.innerText()).toMatch(/1 done[\s\S]*done/)
    await transfers().getByRole('button', { name: 'Close' }).click()
    await quiet()
  })

  test('rejoins its jump, stops reading as freed, and is a file to prepare again', async () => {
    await j.page.getByRole('button', { name: 'Local', exact: true }).click()
    await see('1 file needs processing')
    await j.page.getByText(fetched).first().waitFor()
    for (const other of [MORNING[0]!, MORNING[2]!, ...AFTERNOON])
      expect(fs.existsSync(original(other)), `${other} stays freed`).toBe(false)
    await j.page.getByRole('button', { name: 'Process 1 file' }).click()
    await see('1 file is ready to upload', 60_000)
    expect(fs.readdirSync(copiesDir())).toEqual(['sion_20260905_100240.mp4'])
    await quiet()
  })

  test('is not delivered over the name the storage still holds: the upload does not start, and says which file is in the way', async () => {
    const before = await uploadsAsked(fake.get())
    await j.page.getByRole('button', { name: 'Upload 1 file' }).click()
    await see(/sion_20260905_100240\.mp4 is already on the storage, so nothing was sent/)
    expect(await uploadsAsked(fake.get())).toEqual(before)
    await quiet()
  })
})

describe('partly back', () => {
  test('is sent again once the old copy is deleted up there by hand, and reads as on the storage like any other file', async () => {
    fs.rmSync(sion('sion_20260905_100240.mp4'))
    await j.page.getByRole('button', { name: 'Dismiss' }).last().click()
    await j.page.getByRole('button', { name: 'Upload 1 file' }).click()
    await see('Uploaded 1 file', 60_000)
    expect(fs.existsSync(sion('sion_20260905_100240.mp4'))).toBe(true)
    expect(recordedRemotePaths(j.world)).toContain('/club/Dropzones/Sion/sion_20260905_100240.mp4')

    await open()
    await openSion()
    await see('Everything is on the storage')
    /* the file is here as well as up there; the others stayed freed and are only there */
    expect(fs.existsSync(original('DJI_20260905100240_0002_D.MP4'))).toBe(true)
    expect(fs.existsSync(original('DJI_20260905100000_0001_D.MP4'))).toBe(false)
    await quiet()
  })
})

describe('footage that is nowhere', () => {
  test('is kept as it is when the storage cannot be asked: a call that failed proves nothing', async () => {
    await fake.get().admin.unreachable(true)
    await open()
    await j.page.getByRole('link', { name: /Sion/ }).first().waitFor()
    await j.page.waitForTimeout(3000)
    await fake.get().admin.unreachable(false)
    for (const name of AFTERNOON) expect(recordedUploads(j.world).has(name), name).toBe(true)
    expect(recordedJumps(j.world)).toContain('group_2')
    await quiet()
  })

  test('is forgotten when the storage is asked and says it is not there, with the jump it was the last file of', async () => {
    for (const name of AFTERNOON_COPIES) fs.rmSync(sion(name))
    await open()
    await expect
      .poll(() => AFTERNOON.some((name) => recordedUploads(j.world).has(name)), {
        timeout: 30_000
      })
      .toBe(false)
    expect(recordedJumps(j.world)).not.toContain('group_2')
    /* the morning's jump has a file back on this machine, which no answer from the storage takes away */
    expect(recordedUploads(j.world).has('DJI_20260905100240_0002_D.MP4')).toBe(true)
    expect(recordedJumps(j.world)).toContain('group_1')
    await quiet()
  })
})
