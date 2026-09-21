import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { boardRoute } from './board-route'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

/* Every folder of the board has its own address, and so has a file opened in it, so the board can be
   reloaded, gone back through, kept or sent to somebody and comes back showing the same thing
   (RULES, The board). */

const OUTPUT = '/home/capo/Movies/SkyDock'
const AT = Math.floor(new Date(2026, 8, 20, 10, 0, 0).getTime() / 1000)

const clip = (name: string, over: Record<string, unknown> = {}) => ({
  id: name,
  path: `${OUTPUT}/original_files/2026-09-20/${name}.MP4`,
  filename: `${name}.MP4`,
  size: 1_000_000,
  mtime: AT,
  destination: 'yverdon',
  ...over
})

const photo = {
  id: 'snap',
  path: `${OUTPUT}/original_files/2026-09-20/snap.JPG`,
  filename: 'snap.JPG',
  size: 500,
  mtime: AT,
  destination: 'yverdon'
}

const board = {
  groups: [],
  looseFiles: [clip('in_yverdon'), photo, clip('in_epagny', { destination: 'epagny' })],
  destinations: [{ name: 'yverdon' }, { name: 'epagny' }],
  outputs: {},
  proxies: {},
  tandems: {},
  remote: null,
  storage: null,
  hasManifest: true,
  processing: null,
  nas: { connected: false, hostname: null, defaultFolder: null, backupFolder: null },
  outputDir: OUTPUT
}

const at = async (address: string) => {
  const Stub = createRoutesStub([boardRoute(() => board)])
  return await render(createElement(Stub, { initialEntries: [address] }))
}

describe('the folder an address names', () => {
  test('is the one whose files fill the pane, and the one marked in the menu', async () => {
    await at('/dropzone/yverdon')

    await expect.element(page.getByText('in_yverdon.MP4').first()).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('in_epagny.MP4')
    await expect
      .element(page.getByRole('link', { name: /yverdon/ }).first())
      .toHaveAttribute('aria-current', 'page')
  })

  test('is the fresh files at the front page', async () => {
    await at('/')

    await expect.element(page.getByText('Fresh files').first()).toBeInTheDocument()
  })

  /* a board that has been rearranged since, or an address typed by hand, still opens */
  test('is the fresh files for an address nobody recognises', async () => {
    await at('/nowhere/at-all')

    await expect.element(page.getByText('Fresh files').first()).toBeInTheDocument()
  })

  test('is left for another one by picking it in the menu', async () => {
    await at('/dropzone/yverdon')
    await expect.element(page.getByText('in_yverdon.MP4').first()).toBeInTheDocument()

    await userEvent.click(page.getByRole('link', { name: /epagny/ }).first())

    await expect.element(page.getByText('in_epagny.MP4').first()).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('in_yverdon.MP4')
  })
})

describe('a file an address names', () => {
  test('is open in its folder, on that file, from the address alone', async () => {
    await at('/dropzone/yverdon/file/in_yverdon')

    const drawer = page.getByRole('dialog', { name: 'Preview' })
    await expect.element(drawer).toBeInTheDocument()
    await expect.poll(() => drawer.element().textContent).toContain('in_yverdon.MP4')
  })

  test('is closed again by closing the preview, leaving the folder open', async () => {
    await at('/dropzone/yverdon/file/in_yverdon')
    await expect.element(page.getByRole('dialog', { name: 'Preview' })).toBeInTheDocument()

    await userEvent.click(page.getByRole('button', { name: 'Close' }))

    await expect.element(page.getByRole('dialog', { name: 'Preview' })).not.toBeInTheDocument()
    await expect.element(page.getByText('in_yverdon.MP4').first()).toBeInTheDocument()
  })
})

/* How a folder is being looked at is part of its address, so it comes back with it */
describe('how a folder is being looked at', () => {
  test('is read from the address: photos alone, when that is what it says', async () => {
    await at('/dropzone/yverdon?q=%7B%22kind%22%3A%22photo%22%7D')

    await expect.element(page.getByText('snap.JPG').first()).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('in_yverdon.MP4')
  })

  /* which kind of file is shown is the whole board's choice, not one folder's, so it follows */
  test('keeps to videos or photos on the way to the next folder', async () => {
    await at('/dropzone/yverdon?q=%7B%22kind%22%3A%22photo%22%7D')
    await expect.element(page.getByText('snap.JPG').first()).toBeInTheDocument()

    await userEvent.click(page.getByRole('link', { name: /epagny/ }).first())

    await expect
      .poll(() => page.getByRole('button', { name: /^Photos/ }).element().textContent)
      .toContain('Photos')
    expect(document.body.textContent).not.toContain('in_epagny.MP4')
  })
})
