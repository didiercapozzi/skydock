import { createElement } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { CameraFiles } from '../../app/components/camera-files'

/* What is on a camera plugged in (RULES, Seeing what is on a camera): each file says whether it is
   on the storage, only copied here, or not copied yet; only one on the storage can be picked, and
   deleting asks first. The server is stubbed; the page is clicked the way a person clicks it. */

const MOUNT = '/mnt/osmo/capo/OsmoNano'
const onCard = (name: string, state: 'stored' | 'copied' | 'missing') => ({
  path: `${MOUNT}/DCIM/${name}`,
  name,
  size: 1_000_000,
  mtime: 1_785_000_000,
  state
})

const listing = {
  cameras: [
    {
      camera: 'OsmoNano',
      mount: MOUNT,
      files: [
        onCard('DJI_0001.MP4', 'stored'),
        onCard('DJI_0002.MP4', 'copied'),
        onCard('DJI_0003.MP4', 'missing')
      ]
    }
  ]
}

const sent: unknown[] = []

const stubServer = () => {
  sent.length = 0
  vi.stubGlobal('fetch', async (_url: string | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      sent.push(JSON.parse(String(init.body)))
      return Response.json({
        deleted: { count: 1, bytes: 1_000_000, bins: ['/workspace/.trash/camera-OsmoNano-x'] },
        cameras: [{ ...listing.cameras[0], files: [onCard('DJI_0002.MP4', 'copied'), onCard('DJI_0003.MP4', 'missing')] }]
      })
    }
    return Response.json(listing)
  })
}

const realFetch = globalThis.fetch

afterEach(() => {
  vi.stubGlobal('fetch', realFetch)
})

describe('a camera plugged in', () => {
  test('says which files are on the storage, and only those can be picked', async () => {
    stubServer()
    await render(createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote: () => {} }))

    await expect.element(page.getByText('DJI_0001.MP4')).toBeVisible()
    await expect.element(page.getByText('on the storage', { exact: true })).toBeVisible()
    await expect.element(page.getByText('copied, not uploaded', { exact: true })).toBeVisible()
    await expect.element(page.getByText('not copied yet', { exact: true })).toBeVisible()
    await expect.element(page.getByRole('checkbox', { name: 'Pick DJI_0001.MP4' })).toBeVisible()
    for (const name of ['DJI_0002.MP4', 'DJI_0003.MP4'])
      await expect
        .element(page.getByRole('checkbox', { name: `Pick ${name}` }))
        .not.toBeInTheDocument()
  })

  test('deletes a picked file from the camera only once it is confirmed', async () => {
    stubServer()
    const onNote = vi.fn()
    await render(createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote }))

    await userEvent.click(page.getByRole('checkbox', { name: 'Pick DJI_0001.MP4' }))
    await userEvent.click(page.getByRole('button', { name: 'Delete 1 file from the camera…' }))
    await expect.element(page.getByRole('dialog', { name: 'Delete from the camera' })).toBeVisible()
    expect(sent).toEqual([])

    await userEvent.click(page.getByRole('button', { name: /Check and delete 1 file/ }))

    await expect.poll(() => sent).toEqual([{ paths: [`${MOUNT}/DCIM/DJI_0001.MP4`] }])
    await expect.poll(() => onNote.mock.calls.length).toBe(1)
    await expect.element(page.getByText('DJI_0001.MP4')).not.toBeInTheDocument()
  })
})
