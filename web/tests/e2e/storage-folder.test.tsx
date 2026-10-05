import { createElement } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { StorageFolder } from '../../app/components/storage-folder'

/* A place is connected to its folder on the storage: what is up there is listed under the place's
   own files and played from there, whether or not any of it is still on this machine. The storage
   is stood in for; the list, the player and the address it plays from are the real thing. */

const DIR = '/SkyDock/Passengers/Luc Favre'

const folder = {
  ok: true,
  dir: DIR,
  files: [
    { name: 'luc favre.mp4', path: `${DIR}/luc favre.mp4`, size: 3_000_000, mtime: 1_785_000_000, kind: 'video', shot: null, shareUrl: null },
    { name: 'luc_1.jpg', path: `${DIR}/luc_1.jpg`, size: 90_000, mtime: 1_785_000_000, kind: 'photo', shot: null, shareUrl: 'https://nas.local/sharing/abc' },
    { name: 'luc.photos.zip', path: `${DIR}/luc.photos.zip`, size: 500_000, mtime: null, kind: 'other', shot: null, shareUrl: null }
  ]
}

const asked: string[] = []

const storageAnswers = (answer: unknown) =>
  vi.stubGlobal('fetch', async (url: string | URL) => {
    asked.push(String(url))
    return new Response(JSON.stringify(answer), { headers: { 'Content-Type': 'application/json' } })
  })

afterEach(() => {
  asked.length = 0
  vi.unstubAllGlobals()
})

const renderFolder = (hereToo?: Set<string>, dsmHost?: string) =>
  render(createElement(StorageFolder, { where: { groupId: 'g1' }, hereToo, dsmHost }))

/* A file on the storage can be handed out by a link of its own — one clip, one photo — without the
   folder's link, which opens everything in it (RULES, Network storage). */
describe('a file’s own link', () => {
  test('is offered where there is none, and copied or taken away where there is', async () => {
    storageAnswers(folder)
    await renderFolder()

    const list = page.getByRole('region', { name: 'On the storage' })
    /* the link is in the ⋯ menu of its row: offered on the film that has none, copied or taken away on the photo that has one */
    await userEvent.click(list.getByRole('button', { name: 'More' }).first())
    await expect.element(list.getByRole('button', { name: 'Create a link' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(list.getByRole('button', { name: 'More' }).nth(1))
    await expect.element(list.getByRole('button', { name: 'Remove the link' })).toBeVisible()
  })

  /* a link is a way in: the row says so without the menu being opened */
  test('is marked on its row by a link icon that copies it, on the files that have one only', async () => {
    storageAnswers(folder)
    await renderFolder()

    const list = page.getByRole('region', { name: 'On the storage' })
    await expect.element(list.getByRole('button', { name: 'Copy the link' })).toBeVisible()
    expect(list.getByRole('button', { name: 'Copy the link' }).elements()).toHaveLength(1)
  })

  test('is put on the clipboard by pressing the link icon', async () => {
    storageAnswers(folder)
    const copied: string[] = []
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (text: string) => void copied.push(text) } })
    await renderFolder()

    await userEvent.click(page.getByRole('button', { name: 'Copy the link' }))

    expect(copied).toEqual(['https://nas.local/sharing/abc'])
  })

  test('is asked of the storage for that one file, and shows on the row at once', async () => {
    storageAnswers(folder)
    await renderFolder()
    const list = page.getByRole('region', { name: 'On the storage' })
    await userEvent.click(list.getByRole('button', { name: 'More' }).first())
    await expect.element(list.getByRole('button', { name: 'Create a link' })).toBeVisible()
    vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
      asked.push(`${String(url)} ${String(init?.body ?? '')}`)
      return new Response(
        JSON.stringify({ path: `${DIR}/luc favre.mp4`, shareUrl: 'https://nas.local/sharing/new' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    })

    await userEvent.click(list.getByRole('button', { name: 'Create a link' }))

    /* the row answers at once: it now carries the mark that copies the link */
    await expect.poll(() => list.getByRole('button', { name: 'Copy the link' }).elements().length).toBe(2)
    expect(asked.some((a) => a.includes('/api/share-link') && a.includes('"intent":"create"'))).toBe(
      true
    )
  })
})

/* Where the storage's address is known, a file is a link: pressed, it opens the storage's own web
   interface — File Station — on that file's folder, in a new browser tab. The player is a button of its
   own then. The address is the one the board is connected with. */
describe('a file shown in the storage’s own web interface', () => {
  test('opens File Station on that file, in a new tab', async () => {
    storageAnswers(folder)
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    await renderFolder(undefined, 'https://nas.local:5001/')

    const row = page.getByRole('button', { name: /luc favre\.mp4/ })
    await expect.element(row).toBeVisible()
    await userEvent.click(row)

    const [href, target] = opened.mock.calls[0] ?? []
    expect(target).toBe('_blank')
    expect(String(href).startsWith('https://nas.local:5001/index.cgi?launchApp=SYNO.SDS.App.FileStation3.Instance')).toBe(true)
    /* the file itself, so its folder is shown with it chosen — its path twice encoded as File Station reads it */
    expect(decodeURIComponent(decodeURIComponent(String(href).split('launchParam=')[1] ?? ''))).toMatch(
      new RegExp(`^openfile=${DIR}/`)
    )
    opened.mockRestore()
  })

  /* a film is watched from a button of its own; a photo has none, and its row is only the link */
  test('is watched from a button of its own, on a video only', async () => {
    storageAnswers(folder)
    await renderFolder(undefined, 'https://nas.local:5001/')

    await expect.element(page.getByRole('button', { name: 'Watch' })).toBeVisible()
    expect(page.getByRole('button', { name: 'Watch' }).elements()).toHaveLength(1)
    await userEvent.click(page.getByRole('button', { name: 'Watch' }))

    await expect.element(page.getByRole('dialog')).toBeVisible()
  })

  test('is not also opened in File Station when a button on its row is pressed', async () => {
    storageAnswers(folder)
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    await renderFolder(undefined, 'https://nas.local:5001/')

    await userEvent.click(page.getByRole('button', { name: 'More' }).first())
    await userEvent.keyboard('{Escape}')
    await userEvent.click(page.getByRole('button', { name: 'Watch' }))

    await expect.element(page.getByRole('dialog')).toBeVisible()
    expect(opened).not.toHaveBeenCalled()
    opened.mockRestore()
  })

  test('is a button that plays where the storage’s address is not known', async () => {
    storageAnswers(folder)
    await renderFolder()

    await expect.element(page.getByText('luc favre.mp4')).toBeVisible()
    await expect.element(page.getByRole('button', { name: /luc favre\.mp4/ })).toBeVisible()
  })
})

describe('a place’s folder on the storage', () => {
  test('lists what is up there, and says which of it is only there', async () => {
    storageAnswers(folder)
    await renderFolder(new Set(['luc_1.jpg']))

    const list = page.getByRole('region', { name: 'On the storage' })
    await expect.element(list.getByText('luc favre.mp4')).toBeInTheDocument()
    await expect.element(list.getByText('3 files · 2 only there')).toBeInTheDocument()
    await expect.element(list.getByText(DIR)).toBeInTheDocument()
    const photo = list.getByRole('button', { name: /luc_1\.jpg/ })
    await expect.poll(() => photo.element().textContent).toContain('Here too')
    const film = list.getByRole('button', { name: /luc favre\.mp4/ })
    await expect.poll(() => film.element().textContent).toContain('Only there')
  })

  /* through the board's own server, the path in pieces so the space in the name survives */
  test('plays a film from the storage when it is clicked', async () => {
    storageAnswers(folder)
    await renderFolder()

    await userEvent.click(page.getByRole('button', { name: /luc favre\.mp4/ }))

    const player = page.getByRole('dialog', { name: 'On the storage' })
    await expect.element(player).toBeInTheDocument()
    const video = player.getByLabelText('luc favre.mp4').element() as HTMLVideoElement
    expect(new URL(video.src).pathname).toBe(
      '/api/storage-file/SkyDock/Passengers/Luc%20Favre/luc%20favre.mp4'
    )
  })

  test('keeps an archive listed, with nothing to play', async () => {
    storageAnswers(folder)
    await renderFolder()

    await expect.element(page.getByText('luc.photos.zip')).toBeVisible()
    await expect.element(page.getByRole('button', { name: /luc\.photos\.zip/ })).not.toBeInTheDocument()
  })

  test('asks the storage again when told to look again', async () => {
    storageAnswers(folder)
    await renderFolder()
    await expect.element(page.getByText('luc_1.jpg')).toBeInTheDocument()
    const before = asked.length

    await userEvent.click(page.getByRole('button', { name: 'Look again' }))

    await expect.poll(() => asked.length).toBeGreaterThan(before)
  })

  /* the storage dates a file by the day it was sent; its name says when it was shot */
  test('dates each file by when it was shot, not by when it went up', async () => {
    const shot = Math.floor(new Date(2026, 8, 13, 1, 34, 0).getTime() / 1000)
    const sent = Math.floor(new Date(2026, 8, 18, 12, 0, 0).getTime() / 1000)
    storageAnswers({
      ok: true,
      dir: DIR,
      files: [
        {
          name: 'yverdon_20260913_013400.mp4',
          path: `${DIR}/y.mp4`,
          size: 1,
          mtime: sent,
          kind: 'video',
          shot,
          shareUrl: null
        }
      ]
    })
    await renderFolder()

    const row = page.getByRole('button', { name: /yverdon_20260913_013400\.mp4/ })
    await expect.poll(() => row.element().textContent).toContain('13 September 2026 01:34')
    expect(row.element().textContent).not.toContain('18 September')
  })

  test('says why when the storage cannot answer', async () => {
    storageAnswers({ ok: false, reason: 'The storage is not connected.' })
    await renderFolder()

    await expect.element(page.getByText('The storage is not connected.')).toBeInTheDocument()
  })

  test('says so when nothing has been uploaded there yet', async () => {
    storageAnswers({ ok: true, dir: DIR, files: [] })
    await renderFolder()

    await expect.element(page.getByText(/Nothing up there yet/)).toBeInTheDocument()
  })
})
