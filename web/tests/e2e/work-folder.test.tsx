import { createElement } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { WorkFolderDialog } from '../../app/components/work-folder-dialog'


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

  test('says what is being written into it, and asks first rather than refusing', async () => {
    const choose = inTheWindow({ chosen: null })
    await shown('An upload is running')

    await expect
      .element(
        page.getByText('An upload is running — choosing another folder now stops it, so SkyDock asks first.')
      )
      .toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Choose another folder…' }))
    expect(choose).toHaveBeenCalled()
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
