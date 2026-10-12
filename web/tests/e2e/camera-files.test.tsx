import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { CameraFiles } from '../../app/components/camera-files'
import { forgetJobsOf, liveJobs } from '../../app/hooks/liveStore'


const MOUNT = '/mnt/osmo/capo/OsmoNano'

const deleting = (
  rows: Array<{ file: string; at: 'now' | 'done'; part?: number; phase: string }>
) =>
  liveJobs.update(() => ({
    delete: {
      id: 'delete',
      type: 'camera-delete' as const,
      label: 'camera',
      stage: 'working' as const,
      done: 0,
      total: rows.length,
      rows: rows.map(({ file, ...row }) => ({
        key: `${MOUNT}/DCIM/${file}`,
        name: file,
        size: 0,
        ...row
      }))
    }
  }))

const onCard = (name: string, state: 'stored' | 'copied' | 'binned' | 'missing') => ({
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
      over: 'drive',
      deletable: true,
      looking: false,
      files: [
        onCard('DJI_0001.MP4', 'stored'),
        onCard('DJI_0002.MP4', 'copied'),
        onCard('DJI_0003.MP4', 'missing'),
        onCard('DJI_0004.MP4', 'binned')
      ]
    }
  ]
}

const sent: unknown[] = []

const stubServer = (shown = listing) => {
  sent.length = 0
  vi.stubGlobal('fetch', async (_url: string | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      sent.push(JSON.parse(String(init.body)))
      return Response.json({
        deleted: { count: 1, bytes: 1_000_000, bins: ['/workspace/.trash/camera-OsmoNano-x'] },
        cameras: [{ ...listing.cameras[0], files: [onCard('DJI_0002.MP4', 'copied'), onCard('DJI_0003.MP4', 'missing')] }]
      })
    }
    return Response.json(shown)
  })
}

const realFetch = globalThis.fetch

afterEach(() => {
  vi.stubGlobal('fetch', realFetch)
})

describe('a camera plugged in', () => {
  test('says how far each file has got; a file not copied yet, or one copied, on the storage or in the bin, can be picked', async () => {
    stubServer()
    await render(createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote: () => {}, onCopyBack: () => {} }))

    await expect.element(page.getByText('DJI_0001.MP4')).toBeVisible()
    await expect.element(page.getByText('on the storage', { exact: true })).toBeVisible()
    await expect.element(page.getByText('copied, not uploaded', { exact: true })).toBeVisible()
    await expect.element(page.getByText('not copied yet', { exact: true })).toBeVisible()
    await expect.element(page.getByText('in the bin', { exact: true })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Pick DJI_0001.MP4' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Pick DJI_0004.MP4' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Pick DJI_0003.MP4' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Pick DJI_0002.MP4' })).toBeVisible()
  })

  test('copies just the files picked that are not copied yet, and posts them as picked', async () => {
    stubServer()
    const onNote = vi.fn()
    await render(createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote, onCopyBack: () => {} }))

    await expect
      .element(page.getByRole('button', { name: /files? selected/ }))
      .not.toBeInTheDocument()
    await userEvent.click(page.getByRole('button', { name: 'Pick DJI_0003.MP4' }))
    await userEvent.click(page.getByRole('button', { name: 'Copy 1 file selected' }))

    await expect
      .poll(() => sent)
      .toEqual([{ copyFiles: { mount: MOUNT, paths: [`${MOUNT}/DCIM/DJI_0003.MP4`] } }])
    await expect.poll(() => onNote.mock.calls.length).toBe(1)
    await expect
      .element(page.getByRole('button', { name: /files? selected/ }))
      .not.toBeInTheDocument()
  })

  test('picks every file not copied yet at once, and clears them when pressed again', async () => {
    const twoNew = {
      cameras: [
        {
          ...listing.cameras[0],
          files: [
            onCard('DJI_0001.MP4', 'stored'),
            onCard('DJI_0003.MP4', 'missing'),
            onCard('DJI_0005.MP4', 'missing')
          ]
        }
      ]
    }
    stubServer(twoNew)
    await render(
      createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote: () => {}, onCopyBack: () => {} })
    )

    await userEvent.click(page.getByRole('button', { name: 'Pick every new file' }))
    await expect.element(page.getByRole('button', { name: 'Pick no new file' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Copy 2 files selected' })).toBeVisible()

    await userEvent.click(page.getByRole('button', { name: 'Pick no new file' }))
    await expect
      .element(page.getByRole('button', { name: /files? selected/ }))
      .not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'Pick every new file' })).toBeVisible()

    await userEvent.click(page.getByRole('button', { name: 'Pick every new file' }))
    await userEvent.click(page.getByRole('button', { name: 'Copy 2 files selected' }))

    await expect
      .poll(() => sent)
      .toEqual([
        {
          copyFiles: {
            mount: MOUNT,
            paths: [`${MOUNT}/DCIM/DJI_0003.MP4`, `${MOUNT}/DCIM/DJI_0005.MP4`]
          }
        }
      ])
  })

  test('offers to delete only the stored or binned files picked, even beside a file to copy', async () => {
    stubServer()
    await render(
      createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote: () => {}, onCopyBack: () => {} })
    )

    await userEvent.click(page.getByRole('button', { name: 'Pick DJI_0003.MP4' }))
    await expect
      .element(page.getByRole('button', { name: /Delete \d+ files? from the camera/ }))
      .not.toBeInTheDocument()
    await userEvent.click(page.getByRole('button', { name: 'Pick DJI_0001.MP4' }))
    await userEvent.click(page.getByRole('button', { name: 'Delete 1 file from the camera…' }))
    await userEvent.click(page.getByRole('button', { name: /Check and delete 1 file/ }))

    await expect.poll(() => sent).toEqual([{ paths: [`${MOUNT}/DCIM/DJI_0001.MP4`] }])
  })

  test('copies a picked file back onto this machine when it is asked for', async () => {
    stubServer()
    const onCopyBack = vi.fn()
    await render(
      createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote: () => {}, onCopyBack })
    )

    await userEvent.click(page.getByRole('button', { name: 'Pick DJI_0001.MP4' }))
    await userEvent.click(page.getByRole('button', { name: 'Copy 1 file back here' }))

    expect(onCopyBack).toHaveBeenCalledWith([`${MOUNT}/DCIM/DJI_0001.MP4`])
    expect(sent).toEqual([])
  })

  test('deletes a file whose copy was put in the bin, with nothing to copy back', async () => {
    stubServer()
    await render(
      createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote: () => {}, onCopyBack: () => {} })
    )

    await userEvent.click(page.getByRole('button', { name: 'Pick DJI_0004.MP4' }))
    await expect.element(page.getByRole('button', { name: /back here/ })).not.toBeInTheDocument()
    await userEvent.click(page.getByRole('button', { name: 'Delete 1 file from the camera…' }))
    await userEvent.click(page.getByRole('button', { name: /Check and delete 1 file/ }))

    await expect.poll(() => sent).toEqual([{ paths: [`${MOUNT}/DCIM/DJI_0004.MP4`] }])
  })

  test('shows a bar on each file being deleted, until the answer comes', async () => {
    let answer: (value: Response) => void = () => {}
    vi.stubGlobal('fetch', (_url: string | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Promise<Response>((resolve) => (answer = resolve))
        : Promise.resolve(Response.json(listing))
    )
    await render(
      createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote: () => {}, onCopyBack: () => {} })
    )
    await userEvent.click(page.getByRole('button', { name: 'Pick DJI_0004.MP4' }))
    await userEvent.click(page.getByRole('button', { name: 'Delete 1 file from the camera…' }))
    await userEvent.click(page.getByRole('button', { name: /Check and delete 1 file/ }))

    deleting([{ file: 'DJI_0004.MP4', at: 'now', part: 0.75, phase: 'moving' }])

    const bar = page.getByRole('progressbar', { name: /DJI_0004\.MP4/ })
    await expect.element(bar).toHaveAttribute('aria-valuenow', '75')
    await expect.element(page.getByText('Moving to the bin')).toBeVisible()
    await expect.element(page.getByRole('progressbar', { name: /DJI_0001/ })).not.toBeInTheDocument()

    answer(Response.json({ deleted: { count: 1, bytes: 1, bins: [] }, cameras: listing.cameras }))
    await expect.element(bar).not.toBeInTheDocument()
    forgetJobsOf('camera-delete')
  })

  test('takes a file off the list as soon as it is deleted, while the others are still going', async () => {
    vi.stubGlobal('fetch', (_url: string | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Promise<Response>(() => {})
        : Promise.resolve(Response.json(listing))
    )
    await render(
      createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote: () => {}, onCopyBack: () => {} })
    )
    await userEvent.click(page.getByRole('button', { name: 'Pick DJI_0001.MP4' }))
    await userEvent.click(page.getByRole('button', { name: 'Pick DJI_0004.MP4' }))
    await userEvent.click(page.getByRole('button', { name: 'Delete 2 files from the camera…' }))
    await userEvent.click(page.getByRole('button', { name: /Check and delete 2 files/ }))

    deleting([
      { file: 'DJI_0004.MP4', at: 'done', phase: 'done' },
      { file: 'DJI_0001.MP4', at: 'now', part: 0.7, phase: 'moving' }
    ])

    await expect.element(page.getByText('DJI_0004.MP4')).not.toBeInTheDocument()
    await expect.element(page.getByText('DJI_0001.MP4')).toBeVisible()
    forgetJobsOf('camera-delete')
  })

  test('copies what is not here yet when asked, without unplugging the camera', async () => {
    stubServer()
    const onNote = vi.fn()
    await render(createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote, onCopyBack: () => {} }))

    await userEvent.click(page.getByRole('button', { name: 'Copy 1 file here' }))

    await expect.poll(() => sent).toEqual([{ copy: MOUNT }])
    await expect.poll(() => onNote.mock.calls.length).toBe(1)
  })

  test('deletes a picked file from the camera only once it is confirmed', async () => {
    stubServer()
    const onNote = vi.fn()
    await render(createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote, onCopyBack: () => {} }))

    await userEvent.click(page.getByRole('button', { name: 'Pick DJI_0001.MP4' }))
    await userEvent.click(page.getByRole('button', { name: 'Delete 1 file from the camera…' }))
    await expect.element(page.getByRole('dialog', { name: 'Delete from the camera' })).toBeVisible()
    expect(sent).toEqual([])

    await userEvent.click(page.getByRole('button', { name: /Check and delete 1 file/ }))

    await expect.poll(() => sent).toEqual([{ paths: [`${MOUNT}/DCIM/DJI_0001.MP4`] }])
    await expect.poll(() => onNote.mock.calls.length).toBe(1)
    await expect.element(page.getByText('DJI_0001.MP4')).not.toBeInTheDocument()
  })
})

describe('a camera that hands its files over', () => {
  test('says so, and why it is slower', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({
        cameras: [
          {
            camera: 'GoPro MTP Client Disk Volume',
            mount: MOUNT,
            over: 'mtp',
            deletable: true,
      looking: false,
            files: [onCard('GX010001.MP4', 'missing')]
          }
        ]
      })
    )
    await render(
      createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote: () => {}, onCopyBack: () => {} })
    )

    await expect.element(page.getByText(/slower than a card reader/)).toBeVisible()
    await expect.element(page.getByText('GX010001.MP4')).toBeVisible()
  })

  test('says nothing of the sort for a card in a reader', async () => {
    stubServer()
    await render(
      createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote: () => {}, onCopyBack: () => {} })
    )

    await expect.element(page.getByText('DJI_0001.MP4')).toBeVisible()
    await expect.element(page.getByText(/slower than a card reader/)).not.toBeInTheDocument()
  })
})

describe('a camera read through KDE', () => {
  const KDE = 'mtp:/HERO5 Black/GoPro MTP Client Disk Volume'

  test('is listed, and says it is deleted from on the camera itself', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({
        cameras: [
          {
            camera: 'HERO5 Black',
            mount: KDE,
            over: 'mtp',
            deletable: false,
            looking: false,
            files: [onCard('GOPR0001.MP4', 'stored'), onCard('GOPR0002.MP4', 'missing')]
          }
        ]
      })
    )
    await render(
      createElement(CameraFiles, { mount: KDE, stamp: 1, onNote: () => {}, onCopyBack: () => {} })
    )

    await expect.element(page.getByText('GOPR0001.MP4')).toBeVisible()
    await expect.element(page.getByText(/delete on the camera itself/)).toBeVisible()
    await expect
      .element(page.getByRole('button', { name: 'Pick GOPR0001.MP4' }))
      .not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'Pick GOPR0002.MP4' })).toBeVisible()
    await expect
      .element(page.getByRole('button', { name: /Delete .*from the camera/ }))
      .not.toBeInTheDocument()
  })
})

describe('a camera still being gone over', () => {
  const KDE = 'mtp:/HERO5 Black/GoPro MTP Client Disk Volume'

  test('lists what has been reached so far, and says the rest are coming', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({
        cameras: [
          {
            camera: 'HERO5 Black',
            mount: KDE,
            over: 'mtp',
            deletable: false,
            looking: true,
            files: [onCard('GOPR0001.MP4', 'copied')]
          }
        ]
      })
    )
    await render(
      createElement(CameraFiles, { mount: KDE, stamp: 1, onNote: () => {}, onCopyBack: () => {} })
    )

    await expect.element(page.getByText('GOPR0001.MP4')).toBeVisible()
    await expect.element(page.getByText(/still going over the camera — 1 file so far/)).toBeVisible()
  })
})

describe('looking at a file from the camera', () => {
  const show = () =>
    render(
      createElement(CameraFiles, { mount: MOUNT, stamp: 1, onNote: () => {}, onCopyBack: () => {} })
    )
  const hush = (e: Event) => {
    if (!letFail) e.stopImmediatePropagation()
  }
  let letFail = false
  beforeEach(() => {
    letFail = false
    document.addEventListener('error', hush, true)
  })
  afterEach(() => document.removeEventListener('error', hush, true))
  const playing = () => document.querySelector('video')?.getAttribute('src') ?? ''
  const urlOf = (name: string) => `/api/camera-file?path=${encodeURIComponent(`${MOUNT}/DCIM/${name}`)}`

  test('opens a player on the card file itself', async () => {
    stubServer()
    await show()

    await userEvent.click(page.getByRole('button', { name: 'Preview DJI_0001.MP4' }))
    await expect.element(page.getByRole('dialog', { name: 'Preview from the camera' })).toBeVisible()
    await expect.poll(playing).toBe(urlOf('DJI_0001.MP4'))
  })

  test('does not tick the row it was pressed on', async () => {
    stubServer()
    await show()

    await userEvent.click(page.getByRole('button', { name: 'Preview DJI_0001.MP4' }))
    await expect.poll(playing).not.toBe('')
    await expect
      .element(page.getByRole('button', { name: 'Pick DJI_0001.MP4' }))
      .toHaveAttribute('aria-pressed', 'false')
  })

  test('steps to the next and previous file with the buttons and the arrow keys', async () => {
    stubServer()
    await show()

    await userEvent.click(page.getByRole('button', { name: 'Preview DJI_0001.MP4' }))
    await userEvent.click(page.getByRole('button', { name: 'Next' }))
    await expect.poll(playing).toBe(urlOf('DJI_0002.MP4'))
    await userEvent.click(page.getByRole('button', { name: 'Previous' }))
    await expect.poll(playing).toBe(urlOf('DJI_0001.MP4'))

    ;(document.querySelector('[role="group"][tabindex="0"]') as HTMLElement).focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect.poll(playing).toBe(urlOf('DJI_0002.MP4'))
    await userEvent.keyboard('{ArrowLeft}')
    await expect.poll(playing).toBe(urlOf('DJI_0001.MP4'))
  })

  test('copies just the file shown, only while it is not copied yet, and closes', async () => {
    stubServer()
    await show()

    await userEvent.click(page.getByRole('button', { name: 'Preview DJI_0001.MP4' }))
    await expect.poll(playing).not.toBe('')
    await expect
      .element(page.getByRole('button', { name: 'Copy this file' }))
      .not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('dialog', { name: 'Preview from the camera' })).not.toBeInTheDocument()

    await userEvent.click(page.getByRole('button', { name: 'Preview DJI_0003.MP4' }))
    await userEvent.click(page.getByRole('button', { name: 'Copy this file' }))
    await expect
      .poll(() => sent)
      .toEqual([{ copyFiles: { mount: MOUNT, paths: [`${MOUNT}/DCIM/DJI_0003.MP4`] } }])
    await expect.element(page.getByRole('dialog', { name: 'Preview from the camera' })).not.toBeInTheDocument()
  })

  test('says when a file cannot be played here', async () => {
    stubServer()
    await show()

    await userEvent.click(page.getByRole('button', { name: 'Preview DJI_0001.MP4' }))
    await expect.poll(playing).not.toBe('')
    letFail = true
    document.querySelector('video')?.dispatchEvent(new Event('error'))
    await expect.element(page.getByText(/This file cannot be played here/)).toBeVisible()
  })

  test('offers no preview over a camera read through KDE', async () => {
    const KDE = 'mtp:/HERO5 Black/GoPro MTP Client Disk Volume'
    vi.stubGlobal('fetch', async () =>
      Response.json({
        cameras: [
          {
            camera: 'HERO5 Black',
            mount: KDE,
            over: 'mtp',
            deletable: false,
            looking: false,
            files: [onCard('GOPR0001.MP4', 'copied')]
          }
        ]
      })
    )
    await render(
      createElement(CameraFiles, { mount: KDE, stamp: 1, onNote: () => {}, onCopyBack: () => {} })
    )

    await expect.element(page.getByText('GOPR0001.MP4')).toBeVisible()
    await expect
      .element(page.getByRole('button', { name: 'Preview GOPR0001.MP4' }))
      .not.toBeInTheDocument()
  })
})
