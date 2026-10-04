import { createElement } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { BoardHeader, StatusBar } from '../../app/components/board-header'
import { DisconnectDialog } from '../../app/components/disconnect-dialog'
import { speak } from '../../app/i18n'


const links = [
  { label: 'Check the storage again', mark: '⟳', title: 'Ask the NAS what it holds now', onClick: () => {} },
  { label: 'Disconnect the storage', mark: '⏻', onClick: () => {} }
]

type Frame = Parameters<typeof BoardHeader>[0] & Parameters<typeof StatusBar>[0]

const header = (over: Partial<Frame> = {}) => {
  const all: Frame = {
    scanning: false,
    onScan: () => {},
    onTemplates: () => {},
    onWorkFolder: () => {},
    onHistory: () => {},
    onShortcuts: () => {},
    find: () => [],
    proxies: { ready: 48, waiting: 2, total: 50 },
    jumps: { read: 50, total: 50 },
    disk: null,
    nas: {
      connected: true,
      host: 'https://didiercapozzi.synology.me:9500/',
      user: 'didier',
      links
    },
    uploading: null,
    transfers: { open: false, onToggle: () => {} },
    ...over
  }
  return render(
    createElement('div', null, createElement(BoardHeader, all), createElement(StatusBar, all))
  )
}

describe('the top of the board', () => {
  test('says who the storage is connected as, and where', async () => {
    await header()

    await expect.element(page.getByText('didier @ didiercapozzi.synology.me')).toBeVisible()
    await expect.element(page.getByText('9500')).not.toBeInTheDocument()
  })

  test('says nobody when the storage is not connected', async () => {
    await header({
      nas: {
        connected: false,
        host: null,
        user: null,
        links: [{ label: 'Connect the storage', onClick: () => {} }]
      }
    })

    await expect.element(page.getByRole('button', { name: 'Connect the storage' })).toBeVisible()
    await expect.element(page.getByText('didier')).not.toBeInTheDocument()
  })

  test('has the window’s own buttons at its end, in the desktop app', async () => {
    const asked = {
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      close: vi.fn(),
      isMaximized: vi.fn(() => Promise.resolve(false)),
      onMaximized: vi.fn(() => () => {})
    }
    window.skydock = { pathOf: () => null, frame: asked }
    await header()

    await userEvent.click(page.getByRole('button', { name: 'Maximise' }))

    expect(asked.toggleMaximize).toHaveBeenCalledTimes(1)
    const bar = document.querySelector('header')!
    expect(bar.contains(page.getByRole('button', { name: 'Close' }).element())).toBe(true)
    delete window.skydock
  })

  test('has the transfers to open whenever, and says when they are open', async () => {
    const onToggle = vi.fn()
    await header({ transfers: { open: false, onToggle } })

    await expect
      .element(page.getByRole('button', { name: 'Transfers' }))
      .toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(page.getByRole('button', { name: 'Transfers' }))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  test('says how many clips have been read for their jump while some are still to be', async () => {
    await header({ jumps: { read: 12, total: 40 } })

    await expect.element(page.getByText(/Marks found\s*12\s*\/\s*40/)).toBeVisible()
  })

  test('keeps what is used every day on the bar, and the rest behind Settings', async () => {
    await header()

    for (const name of ['Rows', 'Thumbnails', 'Rescan cameras', 'Keyboard shortcuts'])
      await expect.element(page.getByRole('button', { name })).toBeVisible()
    for (const name of ['Check the storage again', 'Disconnect the storage'])
      await expect.element(page.getByRole('button', { name })).toBeVisible()
    await expect.element(page.getByText(/Proxies ready\s*48\s*\/\s*50/)).toBeVisible()
    await expect.element(page.getByText(/Marks found/)).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'Templates…' })).not.toBeInTheDocument()
    await page.screenshot({ path: './playwright-screenshots/board-header.png' })

    await userEvent.click(page.getByRole('button', { name: 'Settings' }))

    for (const name of ['Auto', 'Light', 'Dark', 'English', 'Templates…', 'Work folder…', 'History…'])
      await expect.element(page.getByRole('button', { name })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('group', { name: 'Settings' })).not.toBeInTheDocument()
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

describe('the language of the board', () => {
  test('offers the three languages, each named in itself, and marks the one spoken', async () => {
    await header()
    await userEvent.click(page.getByRole('button', { name: 'Settings' }))

    await expect.element(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
    await expect.element(page.getByRole('button', { name: 'Français' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Deutsch' })).toBeVisible()
  })

  test('is drawn in French when French is spoken, and in German when German is', async () => {
    try {
      speak('fr')
      const french = await header()
      await expect.element(page.getByRole('button', { name: 'Relire les caméras' })).toBeVisible()
      await userEvent.click(page.getByRole('button', { name: 'Réglages' }))
      await expect.element(page.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'true')
      await french.unmount()

      speak('de')
      await header()
      await expect.element(page.getByRole('button', { name: 'Kameras neu einlesen' })).toBeVisible()
    } finally {
      speak('en')
    }
  })
})

describe('the size of the board', () => {
  afterEach(() => {
    delete window.skydock
  })

  test('is shown and changed in the window, a tenth at a time', async () => {
    let now = 1
    const set = vi.fn(async (factor: number) => {
      now = Math.round(factor * 10) / 10
      return now
    })
    window.skydock = {
      pathOf: () => null,
      zoom: { get: async () => now, set, onChange: () => () => {} }
    }
    await header()
    const size = page.getByRole('group', { name: 'Size of the board' })

    await expect.element(size.getByRole('button', { name: 'As drawn' })).toHaveTextContent('100%')
    await userEvent.click(size.getByRole('button', { name: 'Bigger' }))

    expect(set).toHaveBeenCalledWith(1.1)
    await expect.element(size.getByRole('button', { name: 'As drawn' })).toHaveTextContent('110%')
  })

  test('is not offered in a browser tab, which zooms with its own keys', async () => {
    await header()

    await expect.element(page.getByRole('group', { name: 'Size of the board' })).not.toBeInTheDocument()
  })
})

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
