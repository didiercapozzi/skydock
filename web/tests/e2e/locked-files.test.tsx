import { createElement } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { FileList } from '../../app/components/file-list'
import type { ManifestFile } from '../../app/components/types'
import { useSelection } from '../../app/hooks/useSelection'


const clip = (id: string): ManifestFile => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime: 1_785_000_000
})

const FREE = clip('free')
const EDITED = clip('edited')

const renderList = (shape: 'rows' | 'grid') =>
  render(
    createElement(FileList, {
      files: [FREE, EDITED],
      kind: 'all',
      shape,
      picked: [],
      statusContext: (file: ManifestFile) => ({ inEdit: file.id === EDITED.id }),
      proxies: {},
      onFile: () => {},
      onPick: () => {},
      onOpen: () => {},
      previewed: null,
      offGap: new Set<string>(),
      onDragFile: () => {},
      sortKey: (file: ManifestFile) => file.filename,
      deliveredName: () => null
    })
  )

describe('a file in a montage with an edit', () => {
  test('has no tick to pick it by, on a row', async () => {
    await renderList('rows')

    await expect.element(page.getByRole('button', { name: 'Pick' })).toBeInTheDocument()
    expect(page.getByRole('button', { name: 'Pick' }).elements()).toHaveLength(1)
  })

  test('has no tick to pick it by, on a thumbnail', async () => {
    await renderList('grid')

    await expect.element(page.getByRole('button', { name: 'Pick' })).toBeInTheDocument()
    expect(page.getByRole('button', { name: 'Pick' }).elements()).toHaveLength(1)
  })
})

const Picks = ({ locked }: { locked: string[] }) => {
  const selection = useSelection({
    order: [FREE, EDITED],
    paused: false,
    pickable: (id) => !locked.includes(id),
    onOpen: () => {},
    onDelete: () => {}
  })
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => selection.selectFiles([FREE, EDITED]) },
      'Select its files'
    ),
    createElement('output', { 'data-testid': 'picked' }, selection.pickedFiles.join(','))
  )
}

const picked = () => page.getByTestId('picked').element().textContent

describe('picking files', () => {
  test('leaves out a file that cannot move', async () => {
    await render(createElement(Picks, { locked: [EDITED.id!] }))

    await userEvent.click(page.getByRole('button', { name: 'Select its files' }))

    await expect.poll(picked).toBe('free')
  })

  test('lets go of a file the moment it can no longer move', async () => {
    const screen = await render(createElement(Picks, { locked: [] }))
    await userEvent.click(page.getByRole('button', { name: 'Select its files' }))
    await expect.poll(picked).toBe('free,edited')

    await screen.rerender(createElement(Picks, { locked: [EDITED.id!] }))

    await expect.poll(picked).toBe('free')
  })
})
