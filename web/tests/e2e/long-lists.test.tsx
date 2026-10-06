import { createElement } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { BoardHeader } from '../../app/components/board-header'
import { FileList } from '../../app/components/file-list'
import type { ManifestFile } from '../../app/components/types'
import { setFileView } from '../../app/hooks/useFileView'
import { setTileSize } from '../../app/hooks/useTileSize'

/* A long list is drawn a page at a time, the next as its end comes near; thumbnails can be drawn
   bigger or smaller, from the header or with Ctrl/⌘ and the wheel over them (RULES, The board). */

const clip = (n: number): ManifestFile => ({
  id: `c${n}`,
  path: `/o/GX${String(n).padStart(4, '0')}.MP4`,
  filename: `GX${String(n).padStart(4, '0')}.MP4`,
  size: 1,
  mtime: 1_785_000_000 + n
})

const list = (count: number, shape: 'rows' | 'grid') =>
  render(
    createElement(FileList, {
      files: Array.from({ length: count }, (_, i) => clip(i)),
      kind: 'all',
      shape,
      picked: [],
      statusContext: () => ({}),
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

describe('a long list', () => {
  /* a page at a time, the next one drawn as the end of the last comes near */
  test('draws the rest by itself as its end comes into view', async () => {
    await list(130, 'rows')
    await expect.element(page.getByText('GX0039.MP4')).toBeInTheDocument()

    /* scrolled down to the end of each page in turn, as a person reading down the list would */
    for (const [last, next] of [
      ['GX0039.MP4', 'GX0079.MP4'],
      ['GX0079.MP4', 'GX0119.MP4'],
      ['GX0119.MP4', 'GX0129.MP4']
    ] as const) {
      page.getByText(last).element().scrollIntoView()
      await expect.element(page.getByText(next)).toBeInTheDocument()
    }
  })
})

describe('the thumbnails', () => {
  /* the thumbnails' grid, and how many of them fit across it */
  const theGrid = () => document.querySelector<HTMLElement>('div.grid')!
  const columns = () => getComputedStyle(theGrid()).gridTemplateColumns.split(' ').length

  test('are drawn bigger with Ctrl and the wheel over them, and smaller again', async () => {
    setTileSize(84)
    await list(20, 'grid')
    await expect.poll(() => document.querySelector('div.grid')).not.toBeNull()
    const before = columns()
    const grid = theGrid()

    /* the wheel as a person turns it, with Ctrl held down */
    await userEvent.keyboard('{Control>}')
    await userEvent.wheel(grid, { direction: 'up', times: 10 })
    await expect.poll(columns).toBeLessThan(before)
    const zoomed = columns()

    await userEvent.wheel(grid, { direction: 'down', times: 10 })
    await userEvent.keyboard('{/Control}')
    await expect.poll(columns).toBeGreaterThan(zoomed)
  })

  test('have their size in the header while they are shown', async () => {
    setFileView('grid')
    await render(
      createElement(BoardHeader, {
        scanning: false,
        onScan: () => {},
        onTemplates: () => {},
        onWorkFolder: () => {},
        onShortcuts: () => {},
        find: () => []
      })
    )
    await expect.element(page.getByRole('slider', { name: 'Thumbnail size' })).toBeVisible()

    setFileView('rows')
    await expect.element(page.getByRole('slider', { name: 'Thumbnail size' })).not.toBeInTheDocument()
  })
})
