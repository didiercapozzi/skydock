import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { startFakeStorage } from './fake-storage'
import type { FakeStorage } from './fake-storage'
import { harness } from './harness'
import {
  dragPart,
  emptySpace,
  openUpload,
  region,
  sendTo,
  stored,
  uploadDialog,
  zipEntries
} from './i2-helpers'
import { filmFile, STEM } from './media'
import {
  connectStorage,
  counted,
  disabled,
  PASSWORD,
  pickInDialog,
  said,
  titled,
  typed
} from './steps'

/* A montage with its copies prepared and its film rendered, and a storage to send it to: the upload dialog
   worked by hand, the zips it makes read off the storage's disk. */

let storage: FakeStorage
const j = harness({
  name: 'i2-montage-out',
  state: 'i2-ready',
  prepare: async () => {
    storage = await startFakeStorage({ password: PASSWORD })
  }
})
afterAll(async () => storage?.stop())

const zips = () => uploadDialog(j.page).getByRole('region', { name: /\.zip$/ })
const upload = () => uploadDialog(j.page).getByRole('button', { name: 'Upload', exact: true })
const part = (name: string) => uploadDialog(j.page).getByRole('button', { name, exact: true })
const FULL = `${STEM}.full.zip`
const PHOTOS = `${STEM}.photos.zip`

describe('uploading a montage: make the zips', () => {
  test('opens on the montage page, with the storage connected, and offers the four parts it has', async () => {
    await j.open()
    await j.page.getByRole('link', { name: /Luc Favre/ }).click()
    await j.see('Upload…')
    await connectStorage(j.page, storage)
    await openUpload(j.page)
    for (const name of [
      'Original videos',
      'Original photos',
      'The montage',
      'The kdenlive project'
    ])
      await part(name).waitFor()
    await j.quiet()
  })

  test('starts with one zip of the originals, the photos and the project, named from the montage and the day and time of its first jump, and puts it in Backup', async () => {
    await counted(zips()).toBe(1)
    const full = region(j.page, FULL)
    await said(full).toContain('videos/')
    await said(full).toContain('2 clips')
    await said(full).toContain('photos/')
    await said(full).toContain('1 photo')
    await said(full).toContain(`${STEM}.kdenlive`)
    /* the very first time, only the zips go anywhere, and to Backup */
    await said(region(j.page, 'Backup')).toContain(FULL)
    await counted(region(j.page, 'Club')).toBe(0)
    await j.quiet()
  })

  test('drags a part onto a zip to put it in, and onto the empty space to make a new zip ending with that part', async () => {
    await dragPart(j.page, 'The montage', region(j.page, FULL))
    await said(region(j.page, FULL)).toContain(`${STEM}.mp4`)

    await dragPart(j.page, 'Original photos', emptySpace(j.page))
    await counted(zips()).toBe(2)
    await said(region(j.page, `${STEM}.photos.zip`)).toContain('1 photo')
    await j.quiet()
  })

  test('says how many zips each part is in, since the same part can go into several', async () => {
    await said(part('Original photos')).toContain('in 2 zips')
    await said(part('Original videos')).not.toContain('zips')
    await said(part('The montage')).not.toContain('zips')
    await j.quiet()
  })

  test('takes a part out of a zip, drops a zip left empty, and removes a zip', async () => {
    /* the photos' own zip left empty is no zip at all */
    await uploadDialog(j.page)
      .getByRole('button', { name: `Take Original photos out of ${PHOTOS}` })
      .click()
    await counted(zips()).toBe(1)
    await said(part('Original photos')).not.toContain('zips')

    /* a zip made again, then removed whole */
    await dragPart(j.page, 'Original photos', emptySpace(j.page))
    await uploadDialog(j.page)
      .getByRole('button', { name: `Remove ${PHOTOS}` })
      .click()
    await counted(zips()).toBe(1)
    await uploadDialog(j.page)
      .getByRole('button', { name: `Remove ${FULL}` })
      .click()
    /* making no zip at all is fine */
    await counted(zips()).toBe(0)
    await uploadDialog(j.page).getByText('Drop here: it makes a zip').waitFor()
    await j.quiet()
  })

  test('names each zip by an ending of lowercase letters, digits and dashes, no two alike, one of them with none', async () => {
    await dragPart(j.page, 'Original videos', emptySpace(j.page))
    await dragPart(j.page, 'Original photos', emptySpace(j.page))
    const ending = (i: number) => zips().nth(i).getByLabel('Name ends with')
    await counted(zips()).toBe(2)

    /* what is typed is made into one */
    await ending(0).fill('Boogie 2026')
    await ending(0).blur()
    await typed(ending(0)).toBe('boogie-2026')
    await region(j.page, `${STEM}.boogie-2026.zip`).waitFor()

    /* none at all: the name has no ending */
    await ending(1).fill('')
    await ending(1).blur()
    await region(j.page, `${STEM}.zip`).waitFor()

    /* two alike are refused */
    await ending(1).fill('boogie-2026')
    await uploadDialog(j.page).getByText('Two zips end the same way').waitFor()
    await disabled(upload()).toBe(true)
    await ending(1).fill('photos')
    await ending(0).fill('full')
    await ending(0).blur()
    await counted(uploadDialog(j.page).getByText('Two zips end the same way')).toBe(0)
    await said(region(j.page, FULL)).toContain('videos/')
    await said(region(j.page, PHOTOS)).toContain('photos/')
    await j.quiet()
  })
})

describe('uploading a montage: where it goes', () => {
  test('lists every zip with its whole name and, among the destinations something is already in, the ones to add', async () => {
    /* the project goes into the full zip, the film into both: the whole names are on screen, never cut short */
    await dragPart(j.page, 'The kdenlive project', region(j.page, FULL))
    await dragPart(j.page, 'The montage', region(j.page, FULL))
    await said(region(j.page, FULL)).toContain(`${STEM}.kdenlive`)
    /* the zips are put in Backup by dragging the zip itself */
    await uploadDialog(j.page).getByLabel(`Send ${FULL}`).dragTo(region(j.page, 'Backup'))
    await uploadDialog(j.page).getByLabel(`Send ${PHOTOS}`).dragTo(region(j.page, 'Backup'))
    await said(region(j.page, 'Backup')).toContain(FULL)
    await said(region(j.page, 'Backup')).toContain(PHOTOS)
    const options = await uploadDialog(j.page)
      .getByLabel('Add a destination')
      .locator('option')
      .allInnerTexts()
    expect(options).toEqual(['Add a destination', 'Sion', 'Club'])
    await j.quiet()
  })

  test('adds any other destination, drags a part onto it as it is, and takes what is in it out again', async () => {
    await uploadDialog(j.page).getByLabel('Add a destination').selectOption('Club')
    await region(j.page, 'Club').waitFor()
    await dragPart(j.page, 'The montage', region(j.page, 'Club'))
    await dragPart(j.page, 'Original photos', region(j.page, 'Club'))
    await said(region(j.page, 'Club')).toContain(`${STEM}.mp4`)
    await said(region(j.page, 'Club')).toContain('photos/')
    /* the film as it is is the one that is shared */
    await said(region(j.page, 'Club')).toContain('share link')

    await uploadDialog(j.page).getByRole('button', { name: 'Take photos/ out of Club' }).click()
    await said(region(j.page, 'Club')).not.toContain('photos/')
    await dragPart(j.page, 'Original photos', region(j.page, 'Club'))
    await said(region(j.page, 'Club')).toContain('photos/')
    await j.quiet()
  })

  test('puts what lands in a destination straight in its folder or in the project folder, and makes what is typed into one name', async () => {
    const folder = uploadDialog(j.page).getByLabel('Project folder')
    await typed(folder).toBe('luc-favre')
    await folder.fill('Boogie 2026')
    await folder.blur()
    await typed(folder).toBe('boogie-2026')
    await said(region(j.page, 'Backup')).toContain('boogie-2026/')
    await folder.fill('Luc Favre')
    await folder.blur()
    await typed(folder).toBe('luc-favre')

    await region(j.page, 'Club').getByRole('button', { name: 'Straight in' }).click()
    await counted(region(j.page, 'Club').getByText('luc-favre/', { exact: true })).toBe(0)
    await region(j.page, 'Club').getByRole('button', { name: 'In the project folder' }).click()
    await said(region(j.page, 'Club')).toContain('luc-favre/')
    await j.quiet()
  })

  test('says nothing is sent until each destination has a folder on the storage, and a destination left out takes what was in it', async () => {
    /* a destination has to have its folder before anything is sent */
    await disabled(upload()).toBe(true)
    await titled(upload()).toMatch(/Choose a folder on the storage/)

    /* Sion is added, put something in, and left out again: what was in it goes with it */
    await uploadDialog(j.page).getByLabel('Add a destination').selectOption('Sion')
    await dragPart(j.page, 'The kdenlive project', region(j.page, 'Sion'))
    await said(region(j.page, 'Sion')).toContain(`${STEM}.kdenlive`)
    await uploadDialog(j.page)
      .getByRole('button', { name: 'Leave Sion out of this upload' })
      .click()
    await counted(region(j.page, 'Sion')).toBe(0)
    await j.quiet()
  })

  test('has the folder of each destination chosen from the storage, and shows what will land there as a tree from that folder', async () => {
    await region(j.page, 'Backup')
      .getByRole('button', { name: 'choose its folder on the storage' })
      .click()
    await pickInDialog(j.page, ['club', 'Backup'])
    await sendTo(j.page, 'Club', [], ['club', 'Films'], true)
    await said(region(j.page, 'Backup')).toContain('/club/Backup/')
    await said(region(j.page, 'Backup')).toContain('luc-favre/')
    await said(region(j.page, 'Club')).toContain('/club/Films/')
    await disabled(upload()).toBe(false)
    await j.quiet()
  })
})

describe('uploading a montage: what stays here', () => {
  test('says an item put nowhere stays on this machine', async () => {
    /* the dialog is still open from the chapters before, with the destinations they gave it */
    await said(uploadDialog(j.page)).toMatch(/stays? on this machine/)
  })
})

describe('uploading a montage: what went up', () => {
  test('is sent when Upload is pressed: each zip holds what it was made of, laid out as shown, and the film and photos landed as they are', async () => {
    /* nothing was sent before this */
    expect(fs.existsSync(path.join(storage.root, 'club', 'Backup'))).toBe(true)
    expect(stored(storage)).toEqual([])
    await upload().click()
    await uploadDialog(j.page).waitFor({ state: 'detached' })
    await expect.poll(() => stored(storage, 'Films'), { timeout: 60_000 }).toHaveLength(2)

    expect(stored(storage, 'Backup')).toEqual([`luc-favre/${FULL}`, `luc-favre/${PHOTOS}`])
    expect(zipEntries(path.join(storage.root, 'club', 'Backup', 'luc-favre', FULL))).toEqual([
      `${STEM}.kdenlive`,
      `${STEM}.mp4`,
      'videos/DJI_20260906090000_0006_D.MP4',
      'videos/DJI_20260906090300_0007_D.MP4'
    ])
    expect(zipEntries(path.join(storage.root, 'club', 'Backup', 'luc-favre', PHOTOS))).toEqual([
      'photos/luc_favre_20260906_090130.jpg'
    ])
    expect(stored(storage, 'Films')).toEqual([
      `${STEM}.mp4`,
      'photos/luc_favre_20260906_090130.jpg'
    ])
    /* the film is the montage as it was rendered */
    expect(
      fs
        .readFileSync(path.join(storage.root, 'club', 'Films', `${STEM}.mp4`))
        .equals(fs.readFileSync(filmFile(j.world)))
    ).toBe(true)
    await j.quiet()
  })
})

describe('uploading a montage: what was handed over, shown afterwards', () => {
  test('shows one card per destination the montage is linked to, with its folder and what it holds', async () => {
    await j.see('Send Luc the link', 60_000)
    const storageCard = j.page
      .locator('section', { has: j.page.getByRole('heading', { name: 'On the storage' }) })
      .last()
    await said(storageCard).toContain('/club/Films')
    await said(storageCard).toContain('/club/Backup/luc-favre')
    await said(storageCard).toContain('2 items')
    await said(storageCard).toContain(`${STEM}.mp4`)
    await said(storageCard).toContain(`${STEM}.full.zip`)
    await said(storageCard).toContain(`${STEM}.photos.zip`)
    /* the card the film went into comes first */
    const text = (await storageCard.innerText()).replace(/\s+/g, ' ')
    expect(text.indexOf('/club/Films')).toBeLessThan(text.indexOf('/club/Backup/luc-favre'))
    await j.quiet()
  })

  test('keeps a zip closed until its row is pressed, then shows what is inside it, and closes it when pressed again', async () => {
    const row = j.page.getByRole('button', { name: new RegExp(`^${STEM}.full.zip`) })
    const inside = j.page.getByText('Inside', { exact: true })
    await counted(inside).toBe(0)
    await row.click()
    await said(j.page.locator('main')).toContain('videos/')
    await said(j.page.locator('main')).toContain('2 clips')
    await said(j.page.locator('main')).toContain('DJI_20260906090000_0006_D.MP4')
    await said(j.page.locator('main')).toContain(`${STEM}.kdenlive`)
    await row.click()
    await counted(j.page.getByText('DJI_20260906090000_0006_D.MP4')).toBe(0)
    await j.quiet()
  })

  test('does not say the photos folder is gone from the storage while the storage holds it', async () => {
    const answered = j.page.waitForResponse((r) => r.url().includes('/api/remote-files'))
    await j.page.getByRole('button', { name: 'Check the storage again' }).click()
    await answered
    /* the button is offered again once the page has drawn what the storage answered */
    await j.page.getByRole('button', { name: 'Check the storage again' }).waitFor()
    expect(stored(storage, 'Films')).toContain('photos/luc_favre_20260906_090130.jpg')
    await said(j.page.locator('main')).not.toContain('no longer on the storage')
    await j.quiet()
  })
})
