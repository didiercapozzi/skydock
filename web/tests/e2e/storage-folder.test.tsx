import { createElement } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { StorageFolder } from '../../app/components/storage-folder'

/* A place is connected to its folder on the storage: what is up there is listed under the place's
   own files and played from there, whether or not any of it is still on this machine. The storage
   is stood in for; the list, the player and the address it plays from are the real thing. */

const DIR = '/SkyDock/Tandems/Luc Favre'

const folder = {
  ok: true,
  dir: DIR,
  files: [
    { name: 'luc favre.mp4', path: `${DIR}/luc favre.mp4`, size: 3_000_000, mtime: 1_785_000_000, kind: 'video' },
    { name: 'luc_1.jpg', path: `${DIR}/luc_1.jpg`, size: 90_000, mtime: 1_785_000_000, kind: 'photo' },
    { name: 'luc.photos.zip', path: `${DIR}/luc.photos.zip`, size: 500_000, mtime: null, kind: 'other' }
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

const renderFolder = (hereToo?: Set<string>) =>
  render(createElement(StorageFolder, { where: { groupId: 'g1' }, hereToo }))

describe('a place’s folder on the storage', () => {
  test('lists what is up there, and says which of it is only there', async () => {
    storageAnswers(folder)
    await renderFolder(new Set(['luc_1.jpg']))

    const list = page.getByRole('region', { name: 'On the storage' })
    await expect.element(list.getByText('luc favre.mp4')).toBeInTheDocument()
    await expect.element(list.getByText('3 files · 2 only there')).toBeInTheDocument()
    await expect.element(list.getByText(DIR)).toBeInTheDocument()
    const photo = list.getByRole('button', { name: /luc_1\.jpg/ })
    await expect.poll(() => photo.element().textContent).toContain('here too')
    const film = list.getByRole('button', { name: /luc favre\.mp4/ })
    await expect.poll(() => film.element().textContent).toContain('only on the storage')
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
      '/api/storage-file/SkyDock/Tandems/Luc%20Favre/luc%20favre.mp4'
    )
  })

  test('keeps an archive listed, with nothing to play', async () => {
    storageAnswers(folder)
    await renderFolder()

    await expect.element(page.getByRole('button', { name: /luc\.photos\.zip/ })).toBeDisabled()
  })

  test('asks the storage again when told to look again', async () => {
    storageAnswers(folder)
    await renderFolder()
    await expect.element(page.getByText('luc_1.jpg')).toBeInTheDocument()
    const before = asked.length

    await userEvent.click(page.getByRole('button', { name: 'Look again' }))

    await expect.poll(() => asked.length).toBeGreaterThan(before)
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
