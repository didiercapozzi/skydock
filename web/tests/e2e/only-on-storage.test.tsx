import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import { boardRoute } from './board-route'

/* A dropzone's page is what this machine holds. A file freed from it is on the storage and nowhere
   else, and the storage's own list of that folder — under the dropzone's files — is where it is
   listed and played from; listing it among the files up here as well says the same thing twice, in
   a row where nothing can be done (RULES, Freeing space). */

const OUTPUT = '/home/capo/Movies/SkyDock'
const AT = Math.floor(new Date(2026, 8, 20, 10, 0, 0).getTime() / 1000)

const file = (name: string, over: Record<string, unknown> = {}) => ({
  id: name,
  path: `${OUTPUT}/original_files/2026-09-20/${name}.MP4`,
  filename: `${name}.MP4`,
  size: 1_000_000,
  mtime: AT,
  destination: 'yverdon',
  ...over
})

/* freed: the original and the copy are deleted here once the storage was proved to hold them */
const freed = (name: string) =>
  file(name, {
    freed: true,
    processed: {
      path: `${OUTPUT}/processed/yverdon/${name}.mp4`,
      size: 900_000,
      at: AT,
      source: { id: name, size: 1_000_000, mtime: AT, cropStart: null, cropEnd: null }
    },
    uploaded: {
      remotePath: `/home/Photos/Skydive/Yverdon/${name}.mp4`,
      md5: 'abc',
      size: 900_000,
      localPath: `${OUTPUT}/processed/yverdon/${name}.mp4`,
      at: AT
    }
  })

const board = {
  groups: [
    {
      id: 'g1',
      label: 'g1',
      day: '20.09.2026',
      destination: 'yverdon',
      files: [freed('gone_with_its_jump')]
    }
  ],
  looseFiles: [file('here_now'), freed('up_there')],
  destinations: [{ name: 'yverdon', path: '/home/Photos/Skydive/Yverdon' }],
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

const openYverdon = async () => {
  const Stub = createRoutesStub([boardRoute(() => board)])
  await render(createElement(Stub, { initialEntries: ['/'] }))
  await userEvent.click(page.getByRole('link', { name: /yverdon/ }).first())
}

describe('a dropzone shows what this machine holds', () => {
  test('lists the file that is here and not the one that is only on the storage', async () => {
    await openYverdon()

    await expect.element(page.getByText('here_now.MP4').first()).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('up_there.MP4')
  })

  /* a jump with nothing left on this machine goes with its files */
  test('leaves out a jump that is only on the storage', async () => {
    await openYverdon()

    await expect.element(page.getByText('here_now.MP4').first()).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('gone_with_its_jump.MP4')
  })

  test('counts only what is here', async () => {
    await openYverdon()

    await expect.element(page.getByText(/^1 file · /).first()).toBeInTheDocument()
  })
})
