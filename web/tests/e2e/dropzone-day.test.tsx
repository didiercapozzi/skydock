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

/* A dropzone's day is one unit of work (RULES, Workflow): its files are processed together, then
   uploaded together, and the board offers the one step the day is at — never an upload while a
   file in it still needs processing. */

const DAY = 1_785_000_000

const shot = (id: string, name: string, processed: boolean) => ({
  id,
  path: `/workspace/output/original_files/2026-08-01/${name}`,
  filename: name,
  size: 100,
  mtime: DAY,
  destination: 'Yverdon',
  ...(processed
    ? {
        processed: {
          path: `/workspace/output/processed/Yverdon/yverdon_20260801_${id}.mp4`,
          size: 100,
          at: DAY + 60,
          source: { id, size: 100, mtime: DAY }
        }
      }
    : {})
})

const boardWith = (files: ReturnType<typeof shot>[]) => ({
  groups: [],
  looseFiles: files,
  destinations: [{ name: 'Yverdon', path: '/SkyDock/Yverdon' }],
  outputs: Object.fromEntries(
    files.flatMap((f) => (f.processed ? [[f.path, { exists: true, size: f.size }]] : []))
  ),
  proxies: {},
  montages: {},
  remote: null,
  storage: null,
  hasManifest: true,
  processing: null,
  nas: { connected: true, hostname: 'nas.local', backupFolder: '/Backup' }
})

const requests: unknown[] = []

const openYverdon = async (data: ReturnType<typeof boardWith>) => {
  requests.length = 0
  const Stub = createRoutesStub([
    boardRoute(() => data),
    {
      path: '/api/manifest',
      action: async ({ request }) => {
        requests.push(await request.json())
        return { ok: true }
      }
    },
    { path: '/api/nas', action: async () => ({ ok: true }) },
    { path: '/api/upload-progress', loader: () => null },
    { path: '/api/remote-files', loader: () => ({ ok: false, reason: 'test' }) }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
  await userEvent.click(page.getByRole('link', { name: /Yverdon/ }).first())
}

describe('a dropzone day, from the board', () => {
  test('is processed as one', async () => {
    await openYverdon(boardWith([shot('a', 'GX01.MP4', false), shot('b', 'GX02.MP4', false)]))

    await userEvent.click(page.getByRole('button', { name: 'Process 2 files', exact: true }))

    /* asked for by the files that need it, so what is up there already is not prepared again */
    await expect
      .poll(() => requests)
      .toContainEqual({ intent: 'process', destination: 'Yverdon', fileIds: ['a', 'b'] })
  })

  test('prepares only the file that needs it when another is up there already', async () => {
    await openYverdon(boardWith([shot('a', 'GX01.MP4', true), shot('b', 'GX02.MP4', false)]))

    await userEvent.click(page.getByRole('button', { name: 'Process 1 file', exact: true }))

    await expect
      .poll(() => requests)
      .toContainEqual({ intent: 'process', destination: 'Yverdon', fileIds: ['b'] })
  })

  test('is uploaded as one, once every file in it is processed', async () => {
    await openYverdon(boardWith([shot('a', 'GX01.MP4', true), shot('b', 'GX02.MP4', true)]))

    await expect
      .element(page.getByRole('button', { name: /^Process/ }))
      .not.toBeInTheDocument()
    await userEvent.click(page.getByRole('button', { name: 'Upload 2 files', exact: true }))

    await expect
      .poll(() => requests)
      .toContainEqual({ intent: 'upload-group', destination: 'Yverdon' })
  })

  /* The step stands beside the counts of what the folder still owes, not up among the ways of
     looking at it: what it acts on is everything here that needs it, never what a search or a
     filter happens to be showing. */
  test('offers its step beside what the folder still owes', async () => {
    await openYverdon(boardWith([shot('a', 'GX01.MP4', false), shot('b', 'GX02.MP4', false)]))
    await expect.element(page.getByRole('region', { name: /Yverdon/ })).toBeInTheDocument()

    /* the step and the count of what it deals with are in one row, so what it acts on is plain */
    const row = page.getByRole('button', { name: 'Process 2 files' }).element().parentElement!
      .parentElement!
    expect(row.textContent).toContain('2 to process')
    /* and not up among the ways of looking at the folder */
    expect(row.textContent).not.toContain('Find a file')

    await page.screenshot({ path: './playwright-screenshots/dropzone-step.png' })
  })

  test('cannot be uploaded while one of its files still needs processing', async () => {
    await openYverdon(boardWith([shot('a', 'GX01.MP4', true), shot('b', 'GX02.MP4', false)]))

    await expect.element(page.getByRole('button', { name: /^Upload/ })).not.toBeInTheDocument()
    /* and it names the one file that needs it, not the two the folder holds */
    await expect
      .element(page.getByRole('button', { name: 'Process 1 file', exact: true }))
      .toBeInTheDocument()
    expect(requests).toEqual([])
  })
})
