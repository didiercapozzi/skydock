import { createElement } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { WorkFolderDialog } from '../../app/components/work-folder-dialog'

/* SkyDock works in one folder — the originals, what is handed over, the proxies, the bin and the
   board's record — and can be moved to work in another. Nothing is copied or moved: the board opens
   on what the other folder holds, and the one left behind stays as it is (RULES, What lands on disk).
   The machine's own folder picker is the window's, stood in for here. */

const FOLDER = '/home/didier/Videos/SkyDock'

const shown = (working: string | null = null) =>
  render(createElement(WorkFolderDialog, { folder: FOLDER, working, onClose: () => {} }))

const inTheWindow = (answer: unknown) => {
  const chooseWorkFolder = vi.fn(async () => answer)
  window.skydock = { pathOf: () => null, chooseWorkFolder }
  return chooseWorkFolder
}

afterEach(() => {
  delete window.skydock
})

describe('the work folder', () => {
  test('says where SkyDock works, and that nothing is copied or moved', async () => {
    inTheWindow({ chosen: null })
    await shown()

    await expect.element(page.getByText(FOLDER)).toBeVisible()
    await expect.element(page.getByText(/nothing is copied or moved/)).toBeVisible()
  })

  test('works in the folder chosen, the window opening the board it holds', async () => {
    const choose = inTheWindow({ chosen: '/media/season-2027/SkyDock' })
    await shown()

    await userEvent.click(page.getByRole('button', { name: 'Choose another folder…' }))

    expect(choose).toHaveBeenCalled()
    await expect.element(page.getByText('Opening /media/season-2027/SkyDock…')).toBeVisible()
  })

  test('is not left while something is being written into it', async () => {
    const choose = inTheWindow({ chosen: '/media/season-2027/SkyDock' })
    await shown('An upload is running')

    await expect.element(page.getByRole('button', { name: 'Choose another folder…' })).toBeDisabled()
    await expect.element(page.getByText('An upload is running — wait until it is done.')).toBeVisible()
    expect(choose).not.toHaveBeenCalled()
  })

  test('says why, when the window will not change it', async () => {
    inTheWindow({ refused: 'This window shows a development server, which keeps its own folder.' })
    await shown()

    await userEvent.click(page.getByRole('button', { name: 'Choose another folder…' }))

    await expect.element(page.getByText(/development server, which keeps its own folder/)).toBeVisible()
  })

  test('is changed only from SkyDock’s own window', async () => {
    await shown()

    await expect.element(page.getByRole('button', { name: 'Choose another folder…' })).not.toBeInTheDocument()
    await expect.element(page.getByText(/changed from SkyDock’s own window/)).toBeVisible()
  })
})
