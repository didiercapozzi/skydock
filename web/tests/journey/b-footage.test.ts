import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { z } from 'zod'
import {
  cameraEnvironment,
  canMount,
  cardFolder,
  cardQuiet,
  dropFolder,
  fillCard,
  HANDED,
  panelsSeen,
  plugIn,
  recordPanels,
  unplug,
  unplugAll
} from './a-helpers'
import { harness } from './harness'
import { filesUnder, makeClip, makeOwnPhoto, originalFile, originalsDir } from './media'
import { dropFiles, eventsHeard, listenToEvents } from './page'
import { dialogNamed, eventually, place } from './steps'

/* How footage gets on the board: dropped from the computer, and copied off a camera that is plugged in. The
   files of the computer are made before the app starts; the cameras are cards of the run, plugged in and
   taken out while it runs. */

/* the files of a folder that are whole: a file is only given its name once it is, and is written under another until then */
const landed = (folder: string) => filesUnder(folder).filter((file) => !file.endsWith('.part'))

/* what a folder holds, each file with its size and its time: to say nothing was written to it */
const snapshot = (folder: string) =>
  landed(folder).map((file) => {
    const stat = fs.statSync(path.join(folder, file))
    return `${file} ${stat.size} ${stat.mtimeMs}`
  })

const landedOriginals = (world: { output: string }) => landed(originalsDir(world))

const camerasSchema = z.object({
  cameras: z.array(z.object({ key: z.string(), name: z.string(), auto: z.boolean() })).optional()
})

/* the cameras this machine remembers, kept with its settings and not with any work folder */
const remembered = (world: { config: string }) =>
  camerasSchema.parse(JSON.parse(fs.readFileSync(path.join(world.config, 'settings.json'), 'utf8')))
    .cameras ?? []

describe('footage dropped on the board', () => {
  /* a fortnight's footage from the computer: loose clips, a day's rushes in folders by camera with the notes and
     the camera's bookkeeping beside them, and a clip the board holds already under another name */
  const j = harness({
    name: 'b-dropped-footage',
    state: 'sorted',
    prepare: (world) => {
      const made = (file: string, when: string, seconds = 2) => {
        fs.mkdirSync(path.dirname(file), { recursive: true })
        makeClip(file, when, seconds)
      }
      made(path.join(world.computer, 'GX010002.MP4'), '2026-09-07T08:00:00')
      made(path.join(world.computer, 'GX010003.MP4'), '2026-09-07T08:01:00')
      makeOwnPhoto(path.join(world.computer, 'IMG_0001.JPG'), '2026-09-07T08:02:00', 1)
      fs.mkdirSync(path.join(world.computer, 'rushes', 'cam2'), { recursive: true })
      const rushes = path.join(world.computer, 'rushes')
      made(path.join(rushes, 'cam1', 'GX010010.MP4'), '2026-09-08T08:00:00')
      made(path.join(rushes, 'cam1', 'deep', 'er', 'GX010011.MP4'), '2026-09-08T08:01:00')
      makeOwnPhoto(path.join(rushes, 'cam2', 'IMG_0010.JPG'), '2026-09-08T08:02:00', 2)
      fs.writeFileSync(path.join(rushes, 'notes.txt'), 'the rushes of the day')
      fs.writeFileSync(path.join(rushes, 'cam1', 'cut.kdenlive'), '<mlt/>')
      fs.writeFileSync(path.join(rushes, 'cam1', '.DS_Store'), 'bookkeeping')
      fs.writeFileSync(path.join(rushes, 'cam2', '._IMG_0010.JPG'), 'what a Mac leaves')
      made(path.join(world.computer, 'GX010004.MP4'), '2026-09-09T08:00:00')
      made(path.join(world.computer, 'GX010005.MP4'), '2026-09-09T08:01:00')
      /* the fourth clip of the afternoon jump, as it has come off a card the board has already read */
      const known = originalFile(world, '2026-09-05', 'DJI_20260905143000_0004_D.MP4')
      const again = path.join(world.computer, 'briefing.MP4')
      fs.copyFileSync(known, again)
      fs.utimesSync(again, fs.statSync(known).atime, fs.statSync(known).mtime)
      fs.writeFileSync(path.join(world.computer, 'notes-alone.txt'), 'only a note')
    }
  })
  const computer = (...names: string[]) => names.map((name) => path.join(j.world.computer, name))
  const day = (name: string) => path.join(originalsDir(j.world), name)

  test('several files dropped together are copied, not moved, into the originals under the day they were shot, and wait loose in Fresh files', async () => {
    await j.open()
    await j.see(/2 jumps are waiting for a home/)
    const before = landedOriginals(j.world)
    await dropFiles(j.page, computer('GX010002.MP4', 'GX010003.MP4', 'IMG_0001.JPG'))
    await j.see('3 files have been added to Fresh files', 60_000)

    expect(fs.readdirSync(day('2026-09-07')).sort(), 'filed under the day they were shot').toEqual([
      'GX010002.MP4',
      'GX010003.MP4',
      'IMG_0001.JPG'
    ])
    for (const name of ['GX010002.MP4', 'GX010003.MP4', 'IMG_0001.JPG']) {
      expect(
        fs
          .readFileSync(path.join(day('2026-09-07'), name))
          .equals(fs.readFileSync(computer(name)[0]!)),
        `${name} copied byte for byte`
      ).toBe(true)
    }
    expect(fs.readdirSync(j.world.computer), 'copied, not moved').toEqual(
      expect.arrayContaining(['GX010002.MP4', 'GX010003.MP4', 'IMG_0001.JPG'])
    )
    expect(landedOriginals(j.world).filter((f) => !before.includes(f))).toHaveLength(3)
    /* loose, not a jump: each is listed among the loose files of Fresh files */
    await j.see(/in no jump · 4/)
    await j.quiet()
  })

  test('a dropped folder is opened out: every video and photo inside it, however deep, is copied, and notes, projects and bookkeeping are left where they are', async () => {
    const rushes = path.join(j.world.computer, 'rushes')
    const before = snapshot(rushes)
    await dropFolder(j.page, rushes)
    await j.see('3 files have been added to Fresh files', 60_000)

    expect(fs.readdirSync(day('2026-09-08')).sort(), 'only the videos and photos').toEqual([
      'GX010010.MP4',
      'GX010011.MP4',
      'IMG_0010.JPG'
    ])
    expect(landedOriginals(j.world).filter((f) => /notes|kdenlive|DS_Store|\._/.test(f))).toEqual(
      []
    )
    expect(snapshot(rushes), 'the folder itself is not touched').toEqual(before)
    await j.quiet()
  })

  test('what is coming is listed before the first file is copied, and counted as each lands', async () => {
    await recordPanels(j.page, 'Adding')
    await dropFiles(j.page, computer('GX010004.MP4', 'GX010005.MP4'))
    await j.see('2 files have been added to Fresh files', 60_000)

    const seen = await panelsSeen(j.page)
    const first = seen.find((panel) => panel.rows.length > 0)!
    expect(
      first.rows.map((row) => row.slice(0, 12)),
      'every file named at once'
    ).toEqual(['GX010004.MP4', 'GX010005.MP4'])
    expect(first.summary, 'and none copied yet').toContain('0 of 2 copied into the originals')
    expect(
      seen.some((panel) => panel.summary.includes('1 of 2 copied into the originals')),
      'counted as it goes'
    ).toBe(true)
    expect(
      seen.some((panel) => panel.rows.some((row) => row.includes('reading it…'))),
      'a file whose bytes are in is said to be read'
    ).toBe(true)
    expect(fs.readdirSync(day('2026-09-09')).sort()).toEqual(['GX010004.MP4', 'GX010005.MP4'])
    await j.quiet()
  })

  test('a drop holding nothing SkyDock can show says so and copies nothing', async () => {
    const before = landedOriginals(j.world)
    await dropFiles(j.page, computer('notes-alone.txt'))
    await j.see(/is a video or a photo SkyDock can show/)
    expect(landedOriginals(j.world)).toEqual(before)
    await j.quiet()
  })

  test('footage already on the board is recognised by its contents under another name: dropped on a jump it joins that jump and stays in the other, on a destination it moves there, and nothing new is copied', async () => {
    const before = landedOriginals(j.world)
    await j.page.getByText('Jump 1', { exact: true }).first().waitFor()
    await j.see(/Sat 5 Sept · 14:30 · 2 videos/)

    /* onto the other jump of the day: it joins it, and the first one still holds it */
    await dropFiles(j.page, computer('briefing.MP4'), 'text="Jump 2"')
    await j.see(/has been added to Jump 2/)
    await j.see(/Sun 6 Sept · 09:00 · 3 videos, 1 photo/)
    await j.see(/Sat 5 Sept · 14:30 · 2 videos/)
    expect(landedOriginals(j.world), 'one original on the disk, held by both').toEqual(before)

    /* on a destination: a file on its own, moved there as a drag would have moved it */
    await dropFiles(
      j.page,
      computer('briefing.MP4'),
      'nav[aria-label="Folders"] a:has-text("Sion")'
    )
    await j.see(/Moved DJI_20260905143000_0004_D\.MP4 from Fresh files to Sion/)
    expect(landedOriginals(j.world), 'still no new file in the originals').toEqual(before)
    await j.quiet()
  })

  test('a file let go where nothing takes it is left where it was, and the board says where it could have gone', async () => {
    const before = landedOriginals(j.world)
    await j.page.evaluate(() => {
      const w = window as unknown as { __kept?: boolean[] }
      w.__kept = []
      addEventListener('drop', (e) => w.__kept?.push(e.defaultPrevented))
    })
    await dropFiles(j.page, computer('briefing.MP4'), 'header')
    await j.see('Drop a clip on a destination, a montage or a jump to add it.')
    expect(
      await j.page.evaluate(() => (window as unknown as { __kept: boolean[] }).__kept),
      'the drop is taken, so the page never opens the file over the board'
    ).toEqual([true])
    expect(landedOriginals(j.world)).toEqual(before)
    await j.quiet()
  })
})

/* A card is the folder of a camera: DCIM at its top. Each is plugged in by being mounted, which is when the
   machine says a camera is there. */
describe.skipIf(!canMount)('cameras plugged in', () => {
  const clip = (name: string, when: string, seconds = 2) => ({ name, when, seconds })
  const j = harness({
    name: 'b-cameras',
    env: cameraEnvironment,
    prepare: (world) => {
      fillCard(
        cardFolder(world, 'Osmo Action'),
        [
          clip('DJI_20260905100000_0001_D.MP4', '2026-09-05T10:00:00'),
          clip('DJI_20260905100240_0002_D.MP4', '2026-09-05T10:02:40')
        ],
        [clip('DJI_20260905100130_0003_D.JPG', '2026-09-05T10:01:30')]
      )
      /* three clips an hour apart: each is loose on the board once copied */
      fillCard(cardFolder(world, 'Choose Cam'), [
        clip('GX010001.MP4', '2026-09-06T09:00:00'),
        clip('GX010002.MP4', '2026-09-06T10:00:00'),
        clip('GX010003.MP4', '2026-09-06T11:00:00')
      ])
      fillCard(cardFolder(world, 'Auto Cam'), [
        clip('GX020001.MP4', '2026-09-07T09:00:00'),
        clip('GX020002.MP4', '2026-09-07T10:00:00')
      ])
      /* the same clip name as Choose Cam's — the name two cameras of one make both start at — with other bytes */
      fillCard(cardFolder(world, 'Twin Cam'), [clip('GX010002.MP4', '2026-09-06T10:00:00', 3)])
      /* a drive that is not a camera: no DCIM at its top */
      fs.mkdirSync(path.join(cardFolder(world, 'Backup Drive'), 'Documents'), { recursive: true })
      fs.writeFileSync(
        path.join(cardFolder(world, 'Backup Drive'), 'Documents', 'a.txt'),
        'not footage'
      )
      /* a camera that hands its files over: a folder of the desktop's, with its stores inside, the pictures in one */
      const handed = path.join(HANDED(world), 'mtp:host=GoPro_HERO5')
      fillCard(path.join(handed, 'GoPro MTP Client Disk Volume'), [
        clip('GX030001.MP4', '2026-09-10T09:00:00')
      ])
      fs.mkdirSync(path.join(handed, 'Empty Store', 'Music'), { recursive: true })
    }
  })
  afterAll(() => unplugAll(j.world))
  let quiet: () => Promise<void>
  beforeAll(() => {
    quiet = cardQuiet(j.page, j.world)
  })

  const camera = (name: string) => place(j.page, name)
  /* a camera's page is opened from the menu, and its address is that of the camera */
  const openCamera = async (name: string) => {
    await camera(name).click()
    await j.page.waitForURL(/\/camera\//)
  }
  const asking = () => dialogNamed(j.page, 'A new camera')
  const plug = (name: string) => plugIn(cardFolder(j.world, name))
  const unplugCard = (name: string) => unplug(cardFolder(j.world, name))
  const card = (name: string) => path.join(cardFolder(j.world, name), 'DCIM')
  const day = (name: string) => path.join(originalsDir(j.world), name)

  test('a drive without a DCIM folder is not a camera, and a card with one that nobody has met asks first, saying its name and how many files on it are not here yet', async () => {
    await j.open()
    await j.see('Nothing left to sort')
    plug('Backup Drive')
    plug('Osmo Action')
    await asking().waitFor({ timeout: 20_000 })
    expect(await asking().getByRole('heading', { name: 'Osmo Action' }).count()).toBe(1)
    await asking()
      .getByText(/It holds 3 files that are not on this machine yet/)
      .waitFor()
    expect(await j.page.getByText('Backup Drive').count(), 'never listed, never asked about').toBe(
      0
    )
    expect(
      landedOriginals(j.world),
      'nothing is copied from a camera nobody has answered for'
    ).toEqual([])
    await quiet()
  })

  test('closing the question remembers the camera on this machine and copies nothing, with the box to copy it automatically unticked', async () => {
    expect(await asking().getByRole('checkbox').isChecked(), 'unticked').toBe(false)
    await j.page.keyboard.press('Escape')
    await asking().waitFor({ state: 'detached' })
    await camera('Osmo Action').waitFor()
    await camera('Osmo Action').getByText('3 new').waitFor()

    expect(remembered(j.world)).toEqual([
      { key: 'name:Osmo Action', name: 'Osmo Action', auto: false }
    ])
    expect(
      fs.existsSync(path.join(j.world.output, 'settings.json')),
      'not in the work folder'
    ).toBe(false)
    expect(landedOriginals(j.world), 'and still nothing copied').toEqual([])
    await quiet()
  })

  test('copies a camera only when asked from its page: every file is listed first, they are copied not moved, and a preview copy and a Mac’s own files stay on the card', async () => {
    const before = snapshot(card('Osmo Action'))
    await openCamera('Osmo Action')
    await j.see('Plugged in')
    await j.page.getByText('not copied yet', { exact: true }).first().waitFor()
    for (const name of ['0001_D.MP4', '0002_D.MP4', '0003_D.JPG'])
      expect(await j.page.getByText(new RegExp(`100MEDIA/DJI_\\d+_${name}`)).count()).toBe(1)
    expect(await j.page.getByText(/LRF|\._/).count(), 'what is not media is not listed').toBe(0)

    await recordPanels(j.page, 'Copying')
    await listenToEvents(j.page)
    await j.page.getByRole('button', { name: 'Copy 3 files here' }).click()
    await j.page
      .getByText('copied, not uploaded', { exact: true })
      .nth(2)
      .waitFor({ timeout: 60_000 })

    const seen = await panelsSeen(j.page)
    const first = seen.find((panel) => panel.rows.length > 0)!
    expect(first.rows, 'all three on the card named').toHaveLength(3)
    /* before the first lands: asked of what the board is told, since a small file can land within the frame
       the list is first drawn in, and the panel then shows both at once */
    const listed = (await eventsHeard(j.page)).find(
      (e) => e.kind === 'job' && e.type === 'camera-copy' && Array.isArray(e.rows)
    )
    expect(listed?.rows, 'all three on the card named').toHaveLength(3)
    expect(listed?.done, 'before the first lands').toBe(0)
    expect(landedOriginals(j.world).sort()).toEqual([
      path.join('2026-09-05', 'DJI_20260905100000_0001_D.MP4'),
      path.join('2026-09-05', 'DJI_20260905100130_0003_D.JPG'),
      path.join('2026-09-05', 'DJI_20260905100240_0002_D.MP4')
    ])
    for (const file of filesUnder(path.join(card('Osmo Action'), '100MEDIA')).filter((f) =>
      /^[^.].*\.(MP4|JPG)$/.test(f)
    ))
      expect(
        fs
          .readFileSync(path.join(card('Osmo Action'), '100MEDIA', file))
          .equals(fs.readFileSync(path.join(originalsDir(j.world), '2026-09-05', file))),
        `${file} copied byte for byte`
      ).toBe(true)
    expect(
      snapshot(card('Osmo Action')),
      'the card is only read: copied, not moved, nothing written'
    ).toEqual(before)
    expect(filesUnder(card('Osmo Action')).some((f) => f.endsWith('.LRF'))).toBe(true)

    /* once the card is done what came off it is gathered into jumps */
    await j.page.getByRole('link', { name: /Fresh files/ }).click()
    await j.see(/1 jump is waiting for a home/)
    await quiet()
  })

  test('a camera put in again is not asked about twice and costs nothing, and one that is out is listed as not connected', async () => {
    const before = snapshot(originalsDir(j.world))
    unplugCard('Osmo Action')
    await camera('Osmo Action').getByText('not connected').waitFor({ timeout: 20_000 })
    plug('Osmo Action')
    await camera('Osmo Action')
      .getByText('not connected')
      .waitFor({ state: 'detached', timeout: 20_000 })
    expect(await asking().count(), 'a camera met once is not asked again').toBe(0)
    expect(snapshot(originalsDir(j.world)), 'nothing copied again').toEqual(before)
    await quiet()
  })

  test('a camera plugged in can be ejected from the menu of its page, which lets it go as the desktop does and touches no file', async () => {
    const before = snapshot(originalsDir(j.world))
    await openCamera('Osmo Action')
    await j.page.getByRole('button', { name: 'More' }).click()
    await j.page.getByRole('button', { name: 'Eject' }).click()
    await j.page.getByText('Osmo Action can be unplugged now.').waitFor()
    await camera('Osmo Action').getByText('not connected').waitFor({ timeout: 20_000 })
    expect(snapshot(originalsDir(j.world)), 'no file touched').toEqual(before)
    expect(fs.existsSync(card('Osmo Action')), 'what is on the card is where it was').toBe(true)
    /* put back in, as it was for the chapters after */
    plug('Osmo Action')
    await camera('Osmo Action')
      .getByText('not connected')
      .waitFor({ state: 'detached', timeout: 20_000 })
    await quiet()
  })

  test('a camera can be forgotten from its page, which asks first and touches no file, and is new again the next time it is plugged in', async () => {
    const before = snapshot(originalsDir(j.world))
    await openCamera('Osmo Action')
    await j.page.getByRole('button', { name: 'More' }).click()
    await j.page.getByText('Forget this camera…').click()
    const dialog = dialogNamed(j.page, 'Forget this camera')
    await dialog.waitFor()
    await dialog.getByRole('button', { name: 'Keep it' }).click()
    await dialog.waitFor({ state: 'detached' })
    expect(remembered(j.world), 'asking is not forgetting').toHaveLength(1)

    await j.page.getByRole('button', { name: 'More' }).click()
    await j.page.getByText('Forget this camera…').click()
    await j.page.getByRole('button', { name: 'Forget it' }).click()
    await camera('Osmo Action').waitFor({ state: 'detached' })
    expect(remembered(j.world)).toEqual([])
    expect(snapshot(originalsDir(j.world)), 'no file touched').toEqual(before)

    /* the app looks at what is plugged in every couple of seconds: plugged in again before it has seen the card
       go, the card would never have been out */
    await listenToEvents(j.page)
    unplugCard('Osmo Action')
    await eventually(async () =>
      (await eventsHeard(j.page)).some((e) => e.kind === 'cameras' && e.mounted?.length === 0)
    ).toBe(true)
    plug('Osmo Action')
    await asking().waitFor({ timeout: 20_000 })
    await asking().getByRole('button', { name: 'Just remember it' }).click()
    await camera('Osmo Action').waitFor()
    expect(remembered(j.world).map((c) => c.name)).toEqual(['Osmo Action'])
    unplugCard('Osmo Action')
    await quiet()
  })

  test('the dialog’s Choose which files… remembers the camera and opens its page, where only the files ticked are copied and the rest stay on the card', async () => {
    plug('Choose Cam')
    await asking().waitFor({ timeout: 20_000 })
    await asking()
      .getByText(/It holds 3 files/)
      .waitFor()
    await asking().getByRole('button', { name: 'Choose which files…' }).click()
    await j.page.waitForURL(/\/camera\//)
    await j.see('Plugged in')
    expect(
      remembered(j.world)
        .map((c) => c.name)
        .sort()
    ).toEqual(['Choose Cam', 'Osmo Action'])
    expect(landedOriginals(j.world).filter((f) => f.includes('GX0100'))).toEqual([])

    await j.page.getByRole('button', { name: 'Pick 100MEDIA/GX010001.MP4' }).click()
    await j.page.getByRole('button', { name: 'Pick 100MEDIA/GX010002.MP4' }).click()
    await j.page.getByRole('button', { name: 'Copy 2 files selected' }).click()
    await j.page
      .getByText('copied, not uploaded', { exact: true })
      .nth(1)
      .waitFor({ timeout: 60_000 })

    expect(landed(day('2026-09-06')).sort()).toEqual(['GX010001.MP4', 'GX010002.MP4'])
    expect(fs.existsSync(path.join(card('Choose Cam'), '100MEDIA', 'GX010003.MP4'))).toBe(true)
    await j.page.getByText('not copied yet', { exact: true }).first().waitFor()
    await quiet()
  })

  test('a file not copied yet, or copied here and not uploaded, is not offered for deleting from the camera', async () => {
    const del = j.page.getByRole('button', { name: /Delete .*from the camera…/ })
    expect(await del.isDisabled(), 'nothing picked').toBe(true)
    expect(
      await j.page.getByRole('button', { name: 'Pick 100MEDIA/GX010002.MP4' }).count(),
      'a copy not uploaded has no box: the card is its other copy'
    ).toBe(0)
    await j.page.getByRole('button', { name: 'Pick 100MEDIA/GX010003.MP4' }).click()
    await j.page.getByRole('button', { name: 'Copy 1 file selected' }).waitFor()
    expect(await del.isDisabled(), 'ticked to be copied, not to be deleted').toBe(true)
    await j.page.getByRole('button', { name: 'Pick 100MEDIA/GX010003.MP4' }).click()
    await quiet()
  })

  test('a file on a camera is looked at from the card without copying it, and only what lies under its DCIM folder can be asked for', async () => {
    const before = landedOriginals(j.world)
    await j.page.getByRole('button', { name: 'Preview 100MEDIA/GX010003.MP4' }).click()
    const dialog = dialogNamed(j.page, 'Preview from the camera')
    await dialog.waitFor()
    await dialog.locator('video').waitFor()
    await dialog.getByRole('button', { name: 'Copy this file' }).waitFor()
    await j.page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    expect(landedOriginals(j.world), 'looked at, not copied').toEqual(before)

    /* an address outside the card is answered with nothing, however it is spelled */
    const outside = path.join(j.world.root, 'outside.txt')
    fs.writeFileSync(outside, 'not on a card')
    for (const wanted of [
      outside,
      path.join(card('Choose Cam'), '..', '..', 'outside.txt'),
      '/etc/passwd'
    ]) {
      const answer = await j.page.request.get(
        `${j.app.url}/api/camera-file?path=${encodeURIComponent(wanted)}`
      )
      expect(answer.ok(), `${wanted} is not on a card`).toBe(false)
    }
    await quiet()
  })

  test('a file copied from a camera and then put in the bin is shown as such, and can be deleted from the camera once its bytes are proved the same, going to the bin', async () => {
    const size = fs.statSync(path.join(day('2026-09-06'), 'GX010001.MP4')).size
    await j.page.getByRole('link', { name: /Fresh files/ }).click()
    const row = j.page
      .locator('div', { has: j.page.getByText('GX010001.MP4', { exact: true }) })
      .last()
    await row.getByRole('button', { name: 'Pick' }).click()
    await j.page.getByRole('button', { name: /Remove…/ }).click()
    await j.page.getByRole('button', { name: 'Put in the bin' }).click()
    await j.page.getByText('GX010001.MP4', { exact: true }).first().waitFor({ state: 'detached' })

    await openCamera('Choose Cam')
    await j.page.getByText('in the bin', { exact: true }).first().waitFor({ timeout: 30_000 })
    await j.page.getByRole('button', { name: 'Pick 100MEDIA/GX010001.MP4' }).click()
    await j.page.getByRole('button', { name: 'Delete 1 file from the camera…' }).click()
    const dialog = dialogNamed(j.page, 'Delete from the camera')
    await dialog.waitFor()
    await dialog.getByText(/they go to the bin/i).waitFor()
    await dialog.getByRole('button', { name: 'Check and delete 1 file from the camera' }).click()
    await j.page
      .getByText('100MEDIA/GX010001.MP4', { exact: true })
      .waitFor({ state: 'detached', timeout: 60_000 })

    expect(
      fs.existsSync(path.join(card('Choose Cam'), '100MEDIA', 'GX010001.MP4')),
      'off the card'
    ).toBe(false)
    expect(
      filesUnder(card('Choose Cam'))
        .filter((f) => /^100MEDIA.[^.].*\.MP4$/.test(f))
        .sort()
    ).toEqual([path.join('100MEDIA', 'GX010002.MP4'), path.join('100MEDIA', 'GX010003.MP4')])
    const kept = filesUnder(j.world.trash).filter((f) =>
      f.endsWith(path.join('DCIM', '100MEDIA', 'GX010001.MP4'))
    )
    expect(kept, 'moved into the bin, kept as it sat on the card').toHaveLength(1)
    expect(kept[0]).toContain('Choose Cam')
    expect(fs.statSync(path.join(j.world.trash, kept[0]!)).size).toBe(size)
    expect(
      fs.existsSync(path.join(day('2026-09-06'), 'GX010001.MP4')),
      'not back among the originals'
    ).toBe(false)
    await quiet()
  })

  test('a camera set to copy automatically is copied the moment it is plugged in with nobody pressing anything, and what is here already is passed over', async () => {
    unplugCard('Choose Cam')
    plug('Auto Cam')
    await asking().waitFor({ timeout: 20_000 })
    await asking().getByRole('checkbox').check()
    await asking().getByRole('button', { name: 'Copy the 2 new files' }).click()
    await camera('Auto Cam').waitFor()
    await expect.poll(() => landed(day('2026-09-07')).length, { timeout: 60_000 }).toBe(2)
    expect(remembered(j.world).find((c) => c.name === 'Auto Cam')?.auto).toBe(true)
    const placed = snapshot(day('2026-09-07'))

    /* the card goes out, a third clip is on it when it comes back */
    unplugCard('Auto Cam')
    await camera('Auto Cam').getByText('not connected').waitFor({ timeout: 20_000 })
    makeClip(path.join(card('Auto Cam'), '100MEDIA', 'GX020003.MP4'), '2026-09-07T11:00:00', 2)
    plug('Auto Cam')
    await expect.poll(() => landed(day('2026-09-07')).length, { timeout: 60_000 }).toBe(3)
    expect(await asking().count(), 'not asked: it is known').toBe(0)
    expect(
      snapshot(day('2026-09-07')).filter((f) => placed.includes(f)),
      'the two already here untouched'
    ).toEqual(placed)

    await openCamera('Auto Cam')
    await j.page.getByText(/^On — new files are copied as soon as it is plugged in/).waitFor()
    unplugCard('Auto Cam')
    await quiet()
  })

  test('the switch to copy new files automatically starts off for a camera that is not yours, and is turned on and off from its page', async () => {
    await openCamera('Choose Cam')
    const auto = () => j.page.getByRole('switch', { name: /Copy new files automatically/ })
    await auto().waitFor({ state: 'attached' })
    expect(
      remembered(j.world).find((c) => c.name === 'Choose Cam')?.auto,
      'off to begin with, in what is kept'
    ).toBe(false)
    /* the page draws it from what the board was last told, which may be a moment behind what is kept */
    await expect.poll(() => auto().isChecked(), { timeout: 20_000 }).toBe(false)
    await j.page.getByText('Copy new files automatically', { exact: true }).click()
    await expect
      .poll(() => remembered(j.world).find((c) => c.name === 'Choose Cam')?.auto)
      .toBe(true)
    await j.page.getByText('Copy new files automatically', { exact: true }).click()
    await expect
      .poll(() => remembered(j.world).find((c) => c.name === 'Choose Cam')?.auto)
      .toBe(false)
    await quiet()
  })

  test('a second camera’s clip with the same name as one already there is kept beside it under its name with a number', async () => {
    const there = fs.readFileSync(path.join(day('2026-09-06'), 'GX010002.MP4'))
    plug('Twin Cam')
    await asking().waitFor({ timeout: 20_000 })
    await asking().getByRole('button', { name: 'Copy the 1 new file' }).click()
    await expect
      .poll(() => landed(day('2026-09-06')).sort(), { timeout: 60_000 })
      .toEqual(['GX010002.MP4', 'GX010002_2.MP4'])
    expect(
      fs
        .readFileSync(path.join(card('Twin Cam'), '100MEDIA', 'GX010002.MP4'))
        .equals(fs.readFileSync(path.join(day('2026-09-06'), 'GX010002_2.MP4'))),
      'its own bytes, under the number'
    ).toBe(true)
    expect(
      fs.readFileSync(path.join(day('2026-09-06'), 'GX010002.MP4')).equals(there),
      'the one already there is untouched'
    ).toBe(true)
    unplugCard('Twin Cam')
    await quiet()
  })

  test('a camera that hands its files over is found by the DCIM inside one of its stores, named by that store, and said to be slower than a card reader, and its files cannot be looked at from the card', async () => {
    plugIn(HANDED(j.world))
    await asking().waitFor({ timeout: 20_000 })
    expect(
      await asking().getByRole('heading', { name: 'GoPro MTP Client Disk Volume' }).count()
    ).toBe(1)
    expect(
      await j.page.getByText('Empty Store').count(),
      'a store with no DCIM is not a camera'
    ).toBe(0)
    await asking().getByRole('button', { name: 'Just remember it' }).click()
    await openCamera('GoPro MTP Client Disk Volume')
    await j.see('handed over, not a drive — slower than a card reader')
    await j.page.getByText('100MEDIA/GX030001.MP4').waitFor()
    expect(
      await j.page.getByRole('button', { name: /^Preview / }).count(),
      'it cannot be looked at from the card'
    ).toBe(0)
    await j.page.getByRole('button', { name: 'Copy 1 file here' }).click()
    await expect
      .poll(() => landed(day('2026-09-10')), { timeout: 60_000 })
      .toEqual(['GX030001.MP4'])
    await quiet()
  })

  test('a camera’s page draws a small picture of each file it lists', async () => {
    /* the card was taken out by a chapter before: a camera that is not there has no files to draw */
    plug('Osmo Action')
    await camera('Osmo Action')
      .getByText('not connected')
      .waitFor({ state: 'detached', timeout: 20_000 })
    await openCamera('Osmo Action')
    /* a picture beside a name is decoration for a screen reader, so it is found by what it shows */
    await eventually(() =>
      j.page.evaluate(
        () =>
          [...document.querySelectorAll<HTMLImageElement>('img[src^="/api/thumb/"]')].every(
            (img) => img.naturalWidth > 0
          ) && document.querySelectorAll('img[src^="/api/thumb/"]').length > 0
      )
    ).toBe(true)
    await quiet()
  })
})
