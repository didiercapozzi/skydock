import { createElement } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { FileList } from '../../app/components/file-list'
import { StorageTwinPart } from '../../app/components/inspector'
import { FolderCard } from '../../app/components/storage-folder'
import type { ManifestFile } from '../../app/components/types'
import { StorageTwinsContext } from '../../app/hooks/storageTwins'

/* A file here that is up there too says so on its own row, with the way to it; and what the storage's
   list under the files holds is only what is not here (RULES, A place is connected to its folder). */

const DIR = '/SkyDock/Yverdon'
const clip: ManifestFile = {
  id: 'c1',
  path: '/o/DJI_0157.MP4',
  filename: 'DJI_0157.MP4',
  size: 2_200_000_000,
  mtime: 1_785_000_000
}
const there = (name: string, kind: 'video' | 'photo' = 'video') => ({
  name,
  path: `${DIR}/${name}`,
  size: 527_000_000,
  mtime: 1_785_000_000,
  kind,
  shot: null,
  shareUrl: null
})

const panel = (twins = true) =>
  render(
    createElement(
      StorageTwinsContext,
      {
        value: twins
          ? {
              byName: new Map([['yverdon_20260927_120500.mp4', there('yverdon_20260927_120500.mp4')]]),
              dsmHost: 'https://nas.local:5001'
            }
          : null
      },
      createElement(StorageTwinPart, { name: 'yverdon_20260927_120500.mp4' })
    )
  )

describe('a file that is up there too', () => {
  test('has Open in DSM in its panel, and nothing to watch: it is here', async () => {
    await panel()

    const open = page.getByRole('link', { name: 'Open in DSM' })
    await expect.element(open).toBeVisible()
    expect(open.element().getAttribute('target')).toBe('_blank')
    expect(
      decodeURIComponent(decodeURIComponent(open.element().getAttribute('href')?.split('launchParam=')[1] ?? ''))
    ).toBe(`openfile=${DIR}/yverdon_20260927_120500.mp4`)
    await expect.element(page.getByRole('button', { name: 'Watch' })).not.toBeInTheDocument()
  })

  test('has nothing said where the page has no folder up there to compare', async () => {
    await panel(false)

    await expect.element(page.getByRole('link', { name: 'Open in DSM' })).not.toBeInTheDocument()
  })

  test('has nothing said on its row in the list: the state says it', async () => {
    await render(
      createElement(
        StorageTwinsContext,
        {
          value: {
            byName: new Map([['yverdon_20260927_120500.mp4', there('yverdon_20260927_120500.mp4')]]),
            dsmHost: 'https://nas.local:5001'
          }
        },
        createElement(FileList, {
          files: [clip],
          kind: 'all',
          shape: 'rows',
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
          deliveredName: () => 'yverdon_20260927_120500.mp4'
        })
      )
    )

    await expect.element(page.getByText('yverdon_20260927_120500.mp4').first()).toBeVisible()
    await expect.element(page.getByRole('link', { name: 'Open in DSM' })).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'Watch' })).not.toBeInTheDocument()
  })
})

describe('a destination’s storage tab', () => {
  const listing = {
    ok: true as const,
    dir: DIR,
    files: [there('yverdon_20260927_120500.mp4'), there('only_there.mp4')]
  }
  const card = () =>
    render(
      createElement(FolderCard, {
        listing,
        dsmHost: 'https://nas.local:5001',
        hereToo: new Set(['yverdon_20260927_120500.mp4']),
        onAgain: () => {}
      })
    )

  test('is the card a montage’s folder is: its path, its files, each saying whether it is here too', async () => {
    await card()

    const region = page.getByRole('region', { name: 'On the storage' })
    await expect.element(region.getByText(DIR)).toBeVisible()
    await expect.element(region.getByText('only_there.mp4')).toBeVisible()
    await expect.element(region.getByText('video · here too')).toBeVisible()
    await expect.element(region.getByText('video · only there')).toBeVisible()
  })

  /* the list is a row of names, with one button on a film's row — play — and everything else behind a ⋯ menu */
  test('keeps one play button on each film and the rest behind a ⋯ menu', async () => {
    await render(
      createElement(FolderCard, {
        listing,
        dsmHost: 'https://nas.local:5001',
        hereToo: new Set(['yverdon_20260927_120500.mp4']),
        onAgain: () => {},
        onBringBack: () => {}
      })
    )

    const region = page.getByRole('region', { name: 'On the storage' })
    await expect.element(region.getByRole('button', { name: 'Watch' }).first()).toBeVisible()
    expect(region.getByRole('button', { name: 'Watch' }).elements()).toHaveLength(2)
    expect(region.getByRole('button', { name: 'Bring back' }).elements()).toHaveLength(0)
    expect(region.getByRole('button', { name: 'Create a link' }).elements()).toHaveLength(0)

    await userEvent.click(region.getByRole('button', { name: 'More' }).nth(1))
    await expect.element(region.getByRole('button', { name: 'Bring back' })).toBeVisible()
    await expect.element(region.getByRole('button', { name: 'Create a link' })).toBeVisible()
  })

  /* a row with a link and a row without keep their words in the same columns */
  test('keeps the sizes in line whether or not a row has a link', async () => {
    await render(
      createElement(FolderCard, {
        listing: {
          ok: true as const,
          dir: DIR,
          files: [
            { ...there('with_a_link.mp4'), shareUrl: 'https://nas.local/sharing/abc' },
            there('without.mp4'),
            there('a_photo.jpg', 'photo')
          ]
        },
        dsmHost: 'https://nas.local:5001',
        onAgain: () => {}
      })
    )

    const sizes = page.getByRole('region', { name: 'On the storage' }).getByText('503 MB').elements()
    expect(sizes).toHaveLength(3)
    const edges = sizes.map((size) => size.getBoundingClientRect().right)
    for (const edge of edges) expect(edge).toBeCloseTo(edges[0]!, 0)
  })

  /* the menu of the last row opens over the foot of the card, and is whole there */
  test('opens the menu of the last row whole, not cut off by the card', async () => {
    await card()

    await userEvent.click(page.getByRole('button', { name: 'More' }).nth(1))
    const item = page.getByRole('button', { name: 'Create a link' }).element()
    const at = item.getBoundingClientRect()
    expect(document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2)).toBe(item)
  })

  test('can bring back only a file that is only up there', async () => {
    const asked: string[] = []
    await render(
      createElement(FolderCard, {
        listing,
        dsmHost: 'https://nas.local:5001',
        hereToo: new Set(['yverdon_20260927_120500.mp4']),
        onAgain: () => {},
        onBringBack: (file) => asked.push(file.name)
      })
    )

    /* the file that is here too has none in its menu */
    await userEvent.click(page.getByRole('button', { name: 'More' }).first())
    expect(page.getByRole('button', { name: 'Bring back' }).elements()).toHaveLength(0)
    await userEvent.keyboard('{Escape}')
    await userEvent.click(page.getByRole('button', { name: 'More' }).nth(1))
    await userEvent.click(page.getByRole('button', { name: 'Bring back' }))
    expect(asked).toEqual(['only_there.mp4'])
  })

  test('has no link of its own: that is made in the destination’s panel', async () => {
    await card()

    await expect.element(page.getByText(DIR)).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Create link' })).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'Remove link' })).not.toBeInTheDocument()
  })
})
