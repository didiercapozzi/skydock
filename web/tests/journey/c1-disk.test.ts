import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { harness } from './harness'
import { makeClip } from './media'
import { addDestination, eventually, folders, fresh, rowOf, sionLink } from './steps'

/* What lands on disk (RULES): the work folder's tree, as a person would find it opening the folder — the
   originals one folder a day, what is handed over flat in the destination's folder under names built from
   who it is for, the date and the time shot. Started from the work folder the story left processed. */

const j = harness({ name: 'c1-disk', state: 'processed' })
const { see, quiet } = j
beforeAll(() => j.page.setDefaultTimeout(10_000))
afterEach(() => j.page.keyboard.press('Escape'))

const at = (...parts: string[]) => path.join(j.world.output, ...parts)
const listing = (...parts: string[]) => fs.readdirSync(at(...parts)).sort()

describe('the work folder', () => {
  test('keeps every original as it came off the camera in a folder a day, what is handed over flat in the folder of its destination, and the board record at the top', async () => {
    await j.open()
    await sionLink(j.page).click()
    await j.page.getByRole('heading', { name: '3 files are ready to upload' }).waitFor()
    /* the pictures are drawn once and kept */
    await rowOf(j.page, 'DJI_20260905100000_0001_D.MP4').locator('img').first().waitFor()
    await eventually(() => fs.existsSync(at('.thumbs'))).toBe(true)

    expect(listing('original_files')).toEqual(['2026-09-05', '2026-09-06'])
    expect(listing('original_files', '2026-09-05')).toEqual([
      'DJI_20260905100000_0001_D.MP4',
      'DJI_20260905100240_0002_D.MP4',
      'DJI_20260905100520_0003_D.MP4',
      'DJI_20260905143000_0004_D.MP4',
      'DJI_20260905143300_0005_D.MP4'
    ])
    expect(listing('original_files', '2026-09-06')).toEqual([
      'DJI_20260906090000_0006_D.MP4',
      'DJI_20260906090130_0008_D.JPG',
      'DJI_20260906090300_0007_D.MP4',
      'GX010001.MP4'
    ])

    /* a destination is flat: no folder per jump, no folder per day */
    const entries = fs.readdirSync(at('processed'), { withFileTypes: true })
    expect(entries.map((entry) => entry.name)).toEqual(['Sion'])
    const flat = fs.readdirSync(at('processed', 'Sion'), { withFileTypes: true })
    expect(flat.every((entry) => entry.isFile())).toBe(true)
    expect(flat.map((entry) => entry.name).sort()).toEqual([
      'sion_20260905_100000.mp4',
      'sion_20260905_100240.mp4',
      'sion_20260905_100520.mp4'
    ])

    /* the record, written whole, and nothing kept beside it */
    expect(fs.existsSync(at('manifest.json'))).toBe(true)
    expect(fs.existsSync(at('manifest.json.bak'))).toBe(false)
    expect(fs.existsSync(at('.history'))).toBe(false)
    await quiet()
  })

  test('shows the name of the copy that is handed over with the camera name kept beside it, and finds a file by either name', async () => {
    const copy = rowOf(j.page, 'sion_20260905_100240.mp4')
    await copy.waitFor()
    expect(await copy.textContent()).toContain('DJI_20260905100240_0002_D.MP4')

    await j.page.getByRole('button', { name: 'Search' }).click()
    const box = j.page.getByRole('textbox', { name: 'Find a file' })
    await box.fill('sion_20260905_1002')
    await eventually(() => j.page.locator('main [role=button][data-file]').count()).toBe(1)
    await box.fill('DJI_2026090510052')
    await eventually(() => j.page.locator('main [role=button][data-file]').count()).toBe(1)
    expect(await j.page.locator('main [role=button][data-file]').first().textContent()).toContain(
      'sion_20260905_100520.mp4'
    )
    await box.fill('')
    await eventually(() => j.page.locator('main [role=button][data-file]').count()).toBe(3)
    await quiet()
  })

  test('leaves no copy of a file taken out of a jump, so nothing stale is left to hand over, and the original stays where it is', async () => {
    const name = 'DJI_20260905100520_0003_D.MP4'
    await rowOf(j.page, name).click()
    await j.page.keyboard.press('Delete')
    await j.page.getByRole('button', { name: 'Loose in Fresh files' }).click()
    await eventually(() => listing('processed', 'Sion')).toEqual([
      'sion_20260905_100000.mp4',
      'sion_20260905_100240.mp4'
    ])
    expect(fs.existsSync(at('original_files', '2026-09-05', name))).toBe(true)
    await quiet()
  })
})

describe('the names of what is handed over', () => {
  test('are built from who it is for, the date and the time shot, folding accents and spaces away in the file names but not in the folder name, and a counter keeps two files shot in the same second apart', async () => {
    /* a second clip of the same second, a few seconds longer so it is not the same bytes */
    makeClip(
      path.join(at('original_files', '2026-09-05'), 'DJI_20260905143000_0099_D.MP4'),
      '2026-09-05T14:30:00',
      3
    )
    await fresh(j.page).click()
    await j.page.getByRole('button', { name: 'Rescan cameras' }).click()
    await see('Scan: +1 new', 60_000)
    await addDestination(j.page, 'Chloé Perret')
    await j.page
      .getByRole('button', { name: /^Jump 1, / })
      .dragTo(folders(j.page).getByRole('link', { name: /Chloé Perret/ }))
    await j.page
      .getByRole('heading', { name: '3 files need processing' })
      .waitFor({ timeout: 30_000 })
    await j.page.getByRole('button', { name: 'Process 3 files' }).click()
    await j.page
      .getByRole('heading', { name: '3 files are ready to upload' })
      .waitFor({ timeout: 90_000 })

    expect(listing('processed')).toEqual(['Chloé Perret', 'Sion'])
    const names = listing('processed', 'Chloé Perret')
    expect(names).toHaveLength(3)
    expect(
      names.every((name) => /^chloe_perret_20260905_14(30|33)\d\d(_\d+)?\.mp4$/.test(name))
    ).toBe(true)
    expect(names.filter((name) => name.startsWith('chloe_perret_20260905_143000'))).toHaveLength(2)
    expect(names).toContain('chloe_perret_20260905_143300.mp4')
    await quiet()
  })
})
