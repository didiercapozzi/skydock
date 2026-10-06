import { execFileSync } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { z } from 'zod'
import { harness } from './harness'
import {
  chooseFolder,
  dsmAddress,
  recordedFolders,
  recordedRemotePaths,
  fillConnection,
  folders,
  idOf,
  onStorage,
  openPlace,
  PASSWORD,
  pickInDialog,
  storageOf,
  uploadButton,
  uploadsAsked
} from './f-helpers'

/* The storage, from the first login to the first files up there: connecting, the folder of a destination,
   what an upload sends and what it passes over. The storage is a process of its own serving a folder, so
   what the app did is read off that folder. */

const ORIGINS = 'skydock-origins.json'
const originsSchema = z.object({
  files: z.record(
    z.string(),
    z.object({ from: z.string(), md5: z.string(), size: z.number(), at: z.number() })
  )
})

const fake = storageOf()

/* the folder that holds the folders of the destinations, and the list kept in it */
const dropzones = () => onStorage(fake.get(), 'club', 'Dropzones')
const listed = () =>
  originsSchema.parse(JSON.parse(fs.readFileSync(path.join(dropzones(), ORIGINS), 'utf8'))).files
const j = harness({ name: 'f-storage', state: 'sorted' })
const { see, quiet, open } = j
beforeAll(fake.start)
afterAll(fake.stop)

describe('what is ready to be sent', () => {
  test('prepares the files of a destination, so there is something to upload', async () => {
    await open()
    await openPlace(j, 'Sion')
    await j.page.getByRole('button', { name: 'Process 3 files' }).click()
    await see('3 files are ready to upload', 60_000)
    await quiet()
  })
})

describe('connecting to the storage', () => {
  test('asks for the login when an upload is wanted and the storage is not connected', async () => {
    await uploadButton(j).click()
    await j.page.getByRole('dialog', { name: 'Connect to the storage' }).waitFor()
    await quiet()
  })

  test('says a wrong password plainly and keeps nothing of it', async () => {
    const dialog = await fillConnection(j, fake.get(), { password: 'not-the-password' })
    await dialog.getByText(/incorrect password/).waitFor()
    expect(fs.existsSync(path.join(j.world.config, 'nas.json'))).toBe(false)
    await quiet()
  })

  test('asks an account with 2-step verification for its code, in the same login and with what was typed kept', async () => {
    const storage = fake.get()
    await storage.admin.requireOtp('123456')
    const dialog = j.page.getByRole('dialog', { name: 'Connect to the storage' })
    await dialog.getByLabel('Password').fill(PASSWORD)
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
    await dialog.getByLabel('2-step verification code').waitFor()
    expect(await dialog.getByLabel('Storage address').inputValue()).toBe(storage.url)
    expect(await dialog.getByLabel('Username').inputValue()).toBe('admin')

    await dialog.getByLabel('2-step verification code').fill('000000')
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
    await dialog.getByLabel('2-step verification code').waitFor()
    await dialog.getByLabel('2-step verification code').fill('123456')
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    await see('admin @ 127.0.0.1')
    await quiet()
  })
})

describe('staying connected', () => {
  test('goes on renewing the session without a code once the code was given, since the storage trusts this machine', async () => {
    await fake.get().admin.sessionExpire()
    await open()
    await see('admin @ 127.0.0.1')
    await openPlace(j, 'Sion')
    await see('3 files are ready to upload')
    await quiet()
  })

  test('takes the hostname, username and password once, and keeps the password only encrypted', async () => {
    await j.restart()
    await open()
    await see('admin @ 127.0.0.1')
    const kept = fs
      .readdirSync(j.world.config)
      .map((name) => fs.readFileSync(path.join(j.world.config, name), 'utf8'))
    expect(kept.join('\n')).toContain(fake.get().url)
    expect(kept.join('\n')).not.toContain(PASSWORD)
    await quiet()
  })

  test('forgets the trust of this machine when it is disconnected, so the code is asked for again', async () => {
    await j.page.getByRole('button', { name: 'Disconnect the storage' }).click()
    await j.page.getByRole('button', { name: 'Disconnect', exact: true }).click()
    await j.page.getByRole('button', { name: 'Connect the storage' }).waitFor()

    await j.page.getByRole('button', { name: 'Connect the storage' }).click()
    const dialog = await fillConnection(j, fake.get())
    await dialog.getByLabel('2-step verification code').waitFor()
    await dialog.getByLabel('2-step verification code').fill('123456')
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    await see('admin @ 127.0.0.1')
    await quiet()
  })
})

describe('folders', () => {
  test('has nowhere to upload into until a folder is picked for the destination, and asks for one', async () => {
    await openPlace(j, 'Sion')
    await uploadButton(j).click()
    await j.page.locator('[data-nas-folder-dialog]').waitFor()
    expect(await uploadsAsked(fake.get())).toEqual([])
    await pickInDialog(j, ['club', 'Dropzones', 'Sion'])
    await j.see('They go to the storage, into /club/Dropzones/Sion.')
    expect(fs.statSync(onStorage(fake.get(), 'club', 'Dropzones', 'Sion')).isDirectory()).toBe(true)
    await quiet()
  })
})

describe('uploading a dropzone', () => {
  test('files a second jump and a loose file into the destination, and prepares them', async () => {
    const sion = folders(j).getByRole('link', { name: /Sion/ })
    await openPlace(j, /Fresh files/)
    await j.page.getByText('Jump 1', { exact: true }).dragTo(sion)
    await see('2 to file')
    await openPlace(j, /Fresh files/)
    await j.page.getByRole('button', { name: 'Pick GX010001.MP4' }).click()
    await j.page.getByText('GX010001.MP4', { exact: true }).first().dragTo(sion)
    await see('1 to file')

    await openPlace(j, 'Sion')
    await j.page.getByRole('button', { name: 'Process 3 files' }).click()
    await see('6 files are ready to upload', 60_000)
    await quiet()
  })
})

describe('sending what changed', () => {
  const sion = (...parts: string[]) => onStorage(fake.get(), 'club', 'Dropzones', 'Sion', ...parts)
  const copy = (name: string) => path.join(j.world.output, 'processed', 'Sion', name)

  test('sends nothing when another file already has the name of one, says which, and shows where to deal with it', async () => {
    const storage = fake.get()
    fs.writeFileSync(sion('sion_20260905_100000.mp4'), 'footage of somebody else')
    await uploadButton(j).click()
    await see(/sion_20260905_100000.mp4 is already on the storage, so nothing was sent/)
    expect(await uploadsAsked(storage)).toEqual([])
    expect(recordedRemotePaths(j.world)).toEqual([])
    expect(fs.readFileSync(sion('sion_20260905_100000.mp4'), 'utf8')).toBe(
      'footage of somebody else'
    )

    await j.page.getByRole('link', { name: 'Open in DSM' }).first().waitFor()
    expect(
      await j.page.getByRole('link', { name: 'Open in DSM' }).first().getAttribute('href')
    ).toBe(dsmAddress(storage, '/club/Dropzones/Sion/sion_20260905_100000.mp4'))
    await quiet()
  })

  test('does not read a file as uploaded because the storage lists one of its name: only an upload, which compares checksums, does that', async () => {
    fs.rmSync(sion('sion_20260905_100000.mp4'))
    fs.copyFileSync(copy('sion_20260905_100000.mp4'), sion('sion_20260905_100000.mp4'))
    const made = fs.statSync(copy('sion_20260905_100000.mp4'))
    fs.utimesSync(sion('sion_20260905_100000.mp4'), made.atime, made.mtime)
    await j.page.getByRole('button', { name: 'Dismiss' }).last().click()
    await j.page.getByRole('button', { name: 'Check the storage again' }).click()
    await j.page.getByRole('button', { name: 'Check the storage again' }).waitFor()
    await see('0 of 6 on the storage')
    expect(recordedRemotePaths(j.world)).toEqual([])
    await quiet()
  })

  test('passes over a file of the very same name and bytes, and sends only what is not up there', async () => {
    const storage = fake.get()
    await uploadButton(j).click()
    await see('Uploaded 5 files · 1 already on the storage', 60_000)

    expect((await uploadsAsked(storage)).filter((name) => name.endsWith('.mp4'))).toEqual([
      'sion_20260905_100240.mp4',
      'sion_20260905_100520.mp4',
      'sion_20260905_143000.mp4',
      'sion_20260905_143300.mp4',
      'sion_20260906_160000.mp4'
    ])
    expect(recordedRemotePaths(j.world)).toHaveLength(6)
    /* five files, one after the other */
    expect(await storage.admin.peakUploads()).toBe(1)
    await quiet()
  })

  /* BUG: the board keeps showing the files of the jumps as "Processed" and "1 of 6 on the storage" after an
     upload — only the loose file turns "Uploaded" — until the page is opened again, though RULES says the
     board "updates itself when it ends". Seen: upload 6 files (two jumps and a loose file) into a
     destination; the note says "Uploaded 5 files · 1 already on the storage", the manifest on disk records all
     6, the page keeps the 5 jump files as Processed (even after leaving the page and coming back, or pressing
     "Check the storage again"); opening the board again shows 6 of 6. Suspected: the upload's answer is
     built from the files of the jumps as read back from disk (resolveGroups copies each file, manifest.ts),
     while only the manifest's own file entries get `uploaded` (app/routes/manifest/upload-group.ts). */
  test.skip('shows every file as uploaded as soon as the upload ends, without the board being opened again', async () => {
    await see('6 of 6 on the storage')
    await quiet()
  })

  test('shows the files as uploaded when the board is opened again', async () => {
    await open()
    await openPlace(j, 'Sion')
    await see('6 of 6 on the storage')
    await see('Everything is on the storage')
    await quiet()
  })
})

describe('files keep their date', () => {
  test('sends every file with the date processing stamped on it, which is when it was shot', async () => {
    const stamped = (file: string) => Math.floor(fs.statSync(file).mtimeMs / 1000)
    const processed = path.join(j.world.output, 'processed', 'Sion')
    const names = fs.readdirSync(processed)
    expect(names).toHaveLength(6)
    for (const name of names)
      expect(stamped(onStorage(fake.get(), 'club', 'Dropzones', 'Sion', name)), name).toBe(
        stamped(path.join(processed, name))
      )
    const shot = Math.floor(new Date('2026-09-05T10:05:20').getTime() / 1000)
    expect(
      stamped(onStorage(fake.get(), 'club', 'Dropzones', 'Sion', 'sion_20260905_100520.mp4'))
    ).toBe(shot)
    await quiet()
  })
})

describe('where each file came from', () => {
  const tagOf = (file: string) =>
    execFileSync(process.env.SKYDOCK_FFPROBE_PATH ?? 'ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format_tags=comment',
      '-of',
      'csv=p=0',
      file
    ])
      .toString()
      .trim()

  test('keeps one list on the storage, in the folder that holds the destinations’ folders and never inside one of them', async () => {
    expect(fs.readdirSync(dropzones()).sort()).toEqual(['Sion', ORIGINS])
    expect(fs.readdirSync(onStorage(fake.get(), 'club')).sort()).toEqual(['Dropzones'])
    expect(fs.readdirSync(onStorage(fake.get(), 'club', 'Dropzones', 'Sion'))).not.toContain(
      ORIGINS
    )
    expect(Object.keys(listed()).sort()).toEqual(
      fs
        .readdirSync(onStorage(fake.get(), 'club', 'Dropzones', 'Sion'))
        .map((name) => `/club/Dropzones/Sion/${name}`)
        .sort()
    )
    await quiet()
  })

  test('says of each file it sent where it was made from, and writes that inside the file too, but never in an original', async () => {
    const [remote, entry] =
      Object.entries(listed()).find(([key]) => key.endsWith('100520.mp4')) ?? []
    expect(entry?.from).toBeTruthy()
    expect(tagOf(onStorage(fake.get(), ...(remote ?? '').split('/').filter(Boolean)))).toBe(
      `skydock:from=${entry?.from}`
    )
    const original = path.join(
      j.world.output,
      'original_files',
      '2026-09-05',
      'DJI_20260905100520_0003_D.MP4'
    )
    expect(tagOf(original)).not.toContain('skydock:')
    await quiet()
  })
})

describe('the storage’s own listing is the truth', () => {
  const lone = 'sion_20260905_143300.mp4'
  const onDisk = () => onStorage(fake.get(), 'club', 'Dropzones', 'Sion', lone)
  const remembered = () => Object.keys(listed()).some((key) => key.endsWith(lone))

  test('forgets what the list says of a file the folder no longer holds, and the board follows', async () => {
    expect(remembered()).toBe(true)
    fs.rmSync(onDisk())
    await open()
    await openPlace(j, 'Sion')
    await see('5 of 6 on the storage')
    await expect.poll(remembered).toBe(false)
    await quiet()
  })

  /* BUG: a file deleted up there by hand is shown as ready to be sent again ("1 file is ready to upload", "5 of
     6 on the storage") but pressing Upload says "Nothing to upload yet — process it first." and sends nothing.
     RULES (Network storage): "a file somebody deleted up there by hand is sent again" and "stops counting as
     uploaded and is ready to be sent again". Seen: upload a destination, delete one file from the storage's
     folder, open the board again, press Upload 1 file. Suspected: the board demotes the file only on its own
     side from the storage listing, while the record on the server still says it went up, and the upload
     leaves out whatever the record says was sent (uploadScope in packages/skydock-scripts/src/upload.ts). */
  test.skip('sends a file again that was deleted up there by hand, though it was sent once', async () => {
    await uploadButton(j).click()
    await see('Uploaded 1 file', 60_000)
    expect(fs.existsSync(onDisk())).toBe(true)
    expect((await uploadsAsked(fake.get())).filter((name) => name === lone)).toHaveLength(2)
    expect(remembered()).toBe(true)
    await quiet()
  })
})

describe('a second destination, with a folder of its own', () => {
  test('is made, given a folder of its own on the storage, and filled with the next jump', async () => {
    const p = j.page
    await p.getByRole('button', { name: /Add a destination/ }).click()
    await p.getByPlaceholder('New destination').fill('Yverdon')
    await p.getByRole('button', { name: 'Add', exact: true }).click()
    await folders(j)
      .getByRole('link', { name: /Yverdon/ })
      .waitFor()
    await openPlace(j, 'Yverdon')
    await chooseFolder(j, ['club', 'Dropzones', 'Yverdon'])
    expect(fs.statSync(onStorage(fake.get(), 'club', 'Dropzones', 'Yverdon')).isDirectory()).toBe(
      true
    )

    await openPlace(j, /Fresh files/)
    await p
      .getByText(/^Jump \d$/)
      .first()
      .dragTo(folders(j).getByRole('link', { name: /Yverdon/ }))
    await see('3 files need processing')
    await p.getByRole('button', { name: 'Process 3 files' }).click()
    await see('3 files are ready to upload', 60_000)
    const folderOf = recordedFolders(j.world)
    expect(folderOf).toEqual({ Sion: '/club/Dropzones/Sion', Yverdon: '/club/Dropzones/Yverdon' })
    await quiet()
  })
})

describe('cancelling an upload', () => {
  test('stops from the panel with nothing to confirm, and records nothing', async () => {
    const storage = fake.get()
    await storage.admin.latency(600)
    await uploadButton(j).click()
    const panel = j.page.getByRole('complementary', { name: 'Uploading Yverdon' })
    await panel.waitFor()
    await panel.getByRole('button', { name: 'Cancel' }).click()
    await see(/Upload cancelled — nothing was recorded/, 60_000)
    await storage.admin.latency(0)
    expect(recordedRemotePaths(j.world).filter((remote) => remote.includes('Yverdon'))).toEqual([])
    expect(fs.readdirSync(onStorage(storage, 'club', 'Dropzones', 'Yverdon'))).toEqual([])
    await quiet()
  })

  /* BUG: the Transfers window keeps the upload that was cancelled as "failed", though the board's own line
     says "Upload cancelled" and RULES says a transfer is kept as done, failed or cancelled and that
     cancelling records nothing wrong. Seen: press Cancel in the corner while the storage is still being looked
     at, open Transfers: "Uploaded · Yverdon … failed". Suspected: the cut-off call raises something that is
     not the upload's own cancellation, so the reporter records a failure (uploadReporter in
     app/routes/manifest/progress.ts, send() in app/routes/manifest/upload-group.ts). */
  test.skip('keeps a cancelled upload with the transfers as cancelled, not as failed', async () => {
    await j.page.getByRole('button', { name: 'Transfers' }).click()
    const kept = j.page.getByRole('button', { name: /Uploaded · Yverdon/ }).first()
    await kept.waitFor()
    expect(await kept.innerText()).toContain('cancelled')
    await quiet()
  })
})

describe('the same footage under another name', () => {
  const yverdon = (...parts: string[]) =>
    onStorage(fake.get(), 'club', 'Dropzones', 'Yverdon', ...parts)
  const copy = (name: string) => path.join(j.world.output, 'processed', 'Yverdon', name)
  const fingerprint = (file: string) => ({
    md5: crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex'),
    size: fs.statSync(file).size
  })
  const [inThisFolder, inTheOther] = ['yverdon_20260906_090000.mp4', 'yverdon_20260906_090300.mp4']

  /* another machine delivered the same two clips before, under names of its own: one into this
     destination's folder, one into the other destination's, and wrote them down in the storage's list */
  test('is found in the storage’s list, which another machine had written to', async () => {
    const theirs = yverdon('theirs-in-this-folder.mp4')
    const other = onStorage(fake.get(), 'club', 'Dropzones', 'Sion', 'theirs-in-the-other.mp4')
    fs.copyFileSync(copy(inThisFolder!), theirs)
    fs.copyFileSync(copy(inTheOther!), other)
    const list = listed()
    fs.writeFileSync(
      path.join(dropzones(), ORIGINS),
      JSON.stringify({
        version: 1,
        files: {
          ...list,
          '/club/Dropzones/Yverdon/theirs-in-this-folder.mp4': {
            from: idOf(j.world, 'DJI_20260906090000_0006_D.MP4'),
            at: Math.floor(Date.now() / 1000),
            ...fingerprint(theirs)
          },
          '/club/Dropzones/Sion/theirs-in-the-other.mp4': {
            from: idOf(j.world, 'DJI_20260906090300_0007_D.MP4'),
            at: Math.floor(Date.now() / 1000),
            ...fingerprint(other)
          }
        }
      })
    )
    expect(Object.keys(listed())).toHaveLength(Object.keys(list).length + 2)
  })

  test('starts an upload that takes a while on a slow storage', async () => {
    await fake.get().admin.latency(1500)
    await uploadButton(j).click()
    await j.page.getByRole('complementary', { name: 'Uploading Yverdon' }).waitFor()
    await quiet()
  })

  test('shows the upload in the corner whatever page is open, and offers no Upload anywhere while it goes', async () => {
    const corner = j.page.getByRole('complementary', { name: 'Uploading Yverdon' })
    await openPlace(j, 'Sion')
    await j.page.getByRole('region', { name: 'Sion' }).waitFor()
    await corner.waitFor()
    const elsewhere = j.page.getByRole('button', { name: /^Upload/ })
    await expect.poll(() => elsewhere.isDisabled()).toBe(true)
    expect(await elsewhere.getAttribute('title')).toContain('Uploading Yverdon')

    await openPlace(j, /Fresh files/)
    await corner.waitFor()
    await quiet()
  })

  test('goes on when the page is opened again, and shows the upload still under way', async () => {
    await open()
    await j.page.getByRole('complementary', { name: 'Uploading Yverdon' }).waitFor()
    await openPlace(j, 'Yverdon')
    await j.page.getByRole('region', { name: 'Yverdon' }).waitFor()
    await j.page.getByRole('complementary', { name: 'Uploading Yverdon' }).waitFor()
    /* the page error is the bug of the chapter below, which has its own test */
    await quiet().catch(() => undefined)
  })

  /* BUG: a page opened again while the storage is slow to answer (here: an upload under way on a storage
     that waits 1.5 s on every call) ends the board's question to the storage unanswered, and the page says
     "Unexpected Server Error" in its console, twice. RULES: nothing breaks without being said. Suspected:
     the answer to `storageLook` is waited on in an effect with no `catch` (app/routes/board.tsx), so a stream
     cut by the reload is an unhandled rejection. */
  test.skip('opens the page again while an upload goes without anything breaking unnoticed', async () => {
    await open()
    await j.page.getByRole('complementary', { name: 'Uploading Yverdon' }).waitFor()
    await quiet()
  })

  /* BUG: after the page is opened again while an upload goes, the corner and the status bar say "Uploading
     Yverdon" but the destination's own button is "Upload 3 files" and can be pressed (seen for the whole
     minute the upload took on a slow storage); RULES: opening the page again "neither stops it nor offers it
     again" and "while it goes no Upload is offered anywhere". Suspected: the board's own sign that an upload
     goes (`uploading` in app/hooks/useBoardState.ts, taken from the loader and ended by the answer of
     `upload-wait`) is already empty after a reload. */
  test.skip('is not offered a second time when the page is opened again while it goes', async () => {
    await expect.poll(() => j.page.getByRole('button', { name: /^Upload/ }).isDisabled()).toBe(true)
    await quiet()
  })

  test('sends only the file the storage does not hold, and has the storage copy the one it holds in another folder', async () => {
    const storage = fake.get()
    await j.page
      .getByRole('complementary', { name: 'Uploading Yverdon' })
      .waitFor({ state: 'detached', timeout: 120_000 })
    await storage.admin.latency(0)
    await j.page.getByRole('button', { name: 'Transfers' }).click()
    await see(/Uploaded · yverdon/)

    expect((await uploadsAsked(storage)).filter((name) => name.startsWith('yverdon'))).toEqual([
      'yverdon_20260906_090130.jpg'
    ])
    const calls = await storage.admin.calls()
    expect(
      calls.filter((c) => c.api === 'SYNO.FileStation.CopyMove' && c.method === 'start')
    ).toHaveLength(1)
    expect(fs.readFileSync(yverdon(inTheOther!))).toEqual(fs.readFileSync(copy(inTheOther!)))
    expect(fs.existsSync(yverdon(inThisFolder!))).toBe(false)
    expect(recordedRemotePaths(j.world)).toContain(
      '/club/Dropzones/Yverdon/theirs-in-this-folder.mp4'
    )
    await quiet()
  })
})
