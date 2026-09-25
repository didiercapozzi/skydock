import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { BoardHeader } from '../../app/components/board-header'
import { DisconnectDialog } from '../../app/components/disconnect-dialog'

/* The top of the board says who the storage is connected as and where, and offers what applies to
   the whole board: scanning, the templates, the connection, how files are drawn and how the app is
   lit (RULES, The board). It is read at a glance and acted on rarely, so the settings are marks
   with names on them rather than eight words spelled out across the screen. */

const links = [
  { label: 'Check the storage again', mark: '⟳', title: 'Ask the NAS what it holds now', onClick: () => {} },
  { label: 'Disconnect the storage', mark: '⏻', onClick: () => {} }
]

const header = (over: Partial<Parameters<typeof BoardHeader>[0]> = {}) =>
  render(
    createElement(BoardHeader, {
      scanning: false,
      onScan: () => {},
      onTemplates: () => {},
      onWorkFolder: () => {},
      proxies: { ready: 48, waiting: 2, total: 50 },
      camera: null,
      disk: null,
      nas: {
        connected: true,
        host: 'https://didiercapozzi.synology.me:9500/',
        user: 'didier',
        links
      },
      ...over
    })
  )

describe('the top of the board', () => {
  test('says who the storage is connected as, and where', async () => {
    await header()

    await expect.element(page.getByText('didier')).toBeVisible()
    await expect.element(page.getByText('didiercapozzi.synology.me')).toBeVisible()
    /* how a machine reaches it is not something to read across the top */
    await expect.element(page.getByText('9500')).not.toBeInTheDocument()
  })

  test('says nobody when the storage is not connected', async () => {
    await header({
      nas: {
        connected: false,
        host: null,
        user: null,
        links: [{ label: 'Connect the NAS', onClick: () => {} }]
      }
    })

    await expect.element(page.getByRole('button', { name: 'Connect the NAS' })).toBeVisible()
    await expect.element(page.getByText('didier')).not.toBeInTheDocument()
  })

  /* the marks are shorthand, not a loss: everything still answers to its own name */
  test('keeps every setting, each answering to its name', async () => {
    await header()

    for (const name of ['Rows', 'Thumbnails', 'Auto', 'Light', 'Dark'])
      await expect.element(page.getByRole('button', { name })).toBeVisible()
    for (const name of ['Check the storage again', 'Disconnect the storage'])
      await expect.element(page.getByRole('button', { name })).toBeVisible()
    for (const name of ['Rescan cameras', 'Templates…'])
      await expect.element(page.getByRole('button', { name })).toBeVisible()
    await expect.element(page.getByText(/proxies\s*48\s*\/\s*50/)).toBeVisible()

    await page.screenshot({ path: './playwright-screenshots/board-header.png' })
  })

  test('says which way files are drawn, and how the app is lit', async () => {
    await header()

    await expect
      .element(page.getByRole('button', { name: 'Rows' }))
      .toHaveAttribute('aria-pressed', 'true')
    await expect
      .element(page.getByRole('button', { name: 'Thumbnails' }))
      .toHaveAttribute('aria-pressed', 'false')
  })
})

/* A camera plugged in again is looked over file by file, and a file already here costs a look and
   not a copy — said as it goes, so looking over a card is never taken for copying all of it again
   (RULES, Copying a camera off). */
describe('a camera being looked over', () => {
  test('says how many are here already, and how many are new', async () => {
    await header({
      camera: { camera: 'HERO5 Black', done: 120, total: 300, copied: 2, skipped: 118 }
    })

    await expect.element(page.getByText('2 new · 118 here already')).toBeVisible()
  })

  test('says nothing of the sort while everything is new', async () => {
    await header({
      camera: { camera: 'HERO5 Black', done: 3, total: 300, copied: 3, skipped: 0 }
    })

    await expect.element(page.getByText(/here already/)).not.toBeInTheDocument()
  })
})

/* Letting the storage go is a mark the size of a full stop, and the way back in wants a password
   and a code off somebody's phone, so it is asked first (RULES, The board). */
describe('letting the storage go', () => {
  test('asks first, and does nothing until it is answered', async () => {
    const onConfirm = vi.fn()
    await render(
      createElement(DisconnectDialog, {
        host: 'didiercapozzi.synology.me',
        user: 'didier',
        onClose: () => {},
        onConfirm
      })
    )

    const dialog = page.getByRole('dialog', { name: 'Disconnect the storage' })
    await expect.element(dialog).toBeVisible()
    await expect.poll(() => dialog.element().textContent).toContain('didier on')
    await expect
      .poll(() => dialog.element().textContent)
      .toContain('everything on the storage stays exactly as it is')
    await expect
      .poll(() => dialog.element().textContent)
      .toContain('asks for the password')
    expect(onConfirm).not.toHaveBeenCalled()

    await userEvent.click(page.getByRole('button', { name: 'Disconnect' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test('is not done by the header itself, only asked for', async () => {
    const asked: string[] = []
    await header({
      nas: {
        connected: true,
        host: 'https://didiercapozzi.synology.me:9500/',
        user: 'didier',
        links: [
          {
            label: 'Disconnect the storage',
            mark: '⏻',
            onClick: () => asked.push('asked')
          }
        ]
      }
    })

    await userEvent.click(page.getByRole('button', { name: 'Disconnect the storage' }))
    expect(asked).toEqual(['asked'])
  })
})
