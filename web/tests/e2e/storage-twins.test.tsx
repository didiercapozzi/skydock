import { createElement } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'

import { FileList } from '../../app/components/file-list'
import { StorageTwinPart } from '../../app/components/inspector'
import { StorageFolder } from '../../app/components/storage-folder'
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

describe('the list under the files', () => {
  const listing = {
    ok: true as const,
    dir: DIR,
    files: [there('yverdon_20260927_120500.mp4'), there('only_there.mp4')]
  }

  test('holds only what is not on this machine', async () => {
    await render(
      createElement(StorageFolder, {
        where: { destination: 'Yverdon' },
        listing,
        hereToo: new Set(['yverdon_20260927_120500.mp4']),
        onlyThere: true
      })
    )

    const region = page.getByRole('region', { name: 'On the storage' })
    await expect.element(region.getByText('only_there.mp4')).toBeVisible()
    await expect.element(region.getByText('yverdon_20260927_120500.mp4')).not.toBeInTheDocument()
  })

  test('is not there at all when everything up there is here too', async () => {
    await render(
      createElement(StorageFolder, {
        where: { destination: 'Yverdon' },
        listing: { ...listing, files: [listing.files[0]!] },
        hereToo: new Set(['yverdon_20260927_120500.mp4']),
        onlyThere: true
      })
    )

    await expect.element(page.getByRole('region', { name: 'On the storage' })).not.toBeInTheDocument()
  })
})
