import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import Board from '../../app/routes/board'

/* Delivering is the one step that hands things to someone, so it shows what it is about to do
   before it does it: two parcels, both folders, and how the originals are kept. Nothing is sent
   until the dialog's own button is pressed. */

const GB = 1024 ** 3

const file = (id: string, name: string, size: number) => ({
  id,
  path: `/workspace/output/original_files/2026-08-01/${name}`,
  filename: name,
  size,
  mtime: 1_785_000_000,
  processed: {
    path: `/workspace/output/processed/Tandems/Luc Favre/x/${name}`,
    size,
    at: 1,
    source: { id, size, mtime: 1_785_000_000 }
  }
})

const files = [
  file('v1', 'GX010001.MP4', 8 * GB),
  file('v2', 'GX010002.MP4', 8 * GB),
  file('p1', 'G0010003.JPG', 5 * 1024 ** 2)
]

const board = {
  groups: [
    {
      id: 'g1',
      label: 'jump',
      day: '01.08.2026',
      destination: 'Tandems',
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      processed: true,
      files
    }
  ],
  looseFiles: [],
  destinations: [{ name: 'Tandems' }],
  outputs: Object.fromEntries(files.map((f) => [f.path, { exists: true, size: f.size }])),
  proxies: {},
  tandems: {
    g1: {
      project: true,
      projectPath: '/output/processed/Tandems/Luc Favre/luc_favre_20260801.kdenlive',
      film: {
        size: 3 * GB,
        mtime: 1_785_003_600,
        seconds: 312,
        path: '/workspace/output/processed/Tandems/Luc Favre/luc_favre_20260801.mp4'
      },
      baseName: 'luc_favre_20260801'
    }
  },
  remote: null,
  hasManifest: true,
  processing: null,
  nas: {
    connected: true,
    hostname: 'nas.local',
    defaultFolder: '/SkyDock',
    backupFolder: '/Backup'
  }
}

const delivered: unknown[] = []

const renderBoard = async (data: typeof board | Record<string, unknown> = board, open = true) => {
  const Stub = createRoutesStub([
    { path: '/', Component: Board, loader: () => data },
    {
      path: '/api/manifest',
      action: async ({ request }) => {
        delivered.push(await request.json())
        return { ok: true }
      }
    },
    { path: '/api/nas', action: async () => ({ ok: true }) },
    { path: '/api/upload-progress', loader: () => null },
    { path: '/api/remote-files', loader: () => ({ ok: false, reason: 'test' }) }
  ])
  const screen = await render(createElement(Stub, { initialEntries: ['/'] }))
  await userEvent.click(page.getByRole('button', { name: /Luc Favre/ }).first())
  if (open) await userEvent.click(page.getByRole('button', { name: 'Upload…', exact: true }))
  return screen
}

describe('the delivery dialog', () => {
  test('lays out both parcels and both folders before anything is sent', async () => {
    delivered.length = 0
    await renderBoard()
    const dialog = page.getByRole('dialog', { name: 'Upload' })
    await expect.element(dialog).toBeInTheDocument()
    await expect.element(dialog.getByText('luc_favre_20260801.rushes.zip')).toBeInTheDocument()
    await expect.element(dialog.getByText('luc_favre_20260801.mp4')).toBeInTheDocument()
    await expect.element(dialog.getByText('luc_favre_20260801.photos.zip')).toBeInTheDocument()
    await expect.element(dialog.getByRole('button', { name: '/Backup' })).toBeInTheDocument()
    await expect
      .element(dialog.getByRole('button', { name: '/SkyDock/Tandems/Luc Favre' }))
      .toBeInTheDocument()
    await expect.element(dialog.getByText('16.0 GB to the backup · 3.0 GB to Luc Favre')).toBeInTheDocument()
    await page.screenshot({ path: './playwright-screenshots/deliver-dialog.png' })
    expect(delivered).toEqual([])
  })

  test('adds the film to the backup, and says so, when it is ticked', async () => {
    await renderBoard()
    const dialog = page.getByRole('dialog', { name: 'Upload' })
    await userEvent.click(dialog.getByRole('checkbox'))
    await expect.element(dialog.getByText('2 original videos + the film')).toBeInTheDocument()
    await expect.element(dialog.getByText('19.0 GB to the backup · 3.0 GB to Luc Favre')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('checkbox'))
  })

  test('keeps the originals as plain files when asked, in a folder of their own', async () => {
    await renderBoard()
    const dialog = page.getByRole('dialog', { name: 'Upload' })
    await userEvent.click(dialog.getByRole('button', { name: 'Plain files' }))
    await expect.element(dialog.getByText('luc_favre_20260801/')).toBeInTheDocument()
    await expect.element(dialog.getByText('2 original videos, as files')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'One zip' }))
  })

  test('sends the delivery, with the choice, only from its own button', async () => {
    delivered.length = 0
    await renderBoard()
    const dialog = page.getByRole('dialog', { name: 'Upload' })
    await userEvent.click(dialog.getByRole('button', { name: 'Upload', exact: true }))
    await vi.waitFor(() =>
      expect(delivered).toContainEqual({
        intent: 'deliver',
        groupId: 'g1',
        backup: { backupAs: 'zip', filmToBackup: false }
      })
    )
  })
})

/* Uploaded is what the storage holds, not what was once recorded: delete the files over there and
   the tandem reads as not uploaded again, and says what went missing. */
describe('an uploaded tandem, checked against the storage', () => {
  const dir = '/SkyDock/Tandems/Luc Favre'
  const record = (remotePath: string, size: number) => ({
    remotePath,
    md5: 'x',
    size,
    localPath: '/local',
    at: 1_785_010_000
  })
  const uploaded = (sizes: Record<string, number | null>) => ({
    ...board,
    groups: [
      {
        ...board.groups[0],
        delivered: {
          at: 1_785_010_000,
          film: record(`${dir}/luc_favre_20260801.mp4`, 3 * GB),
          photos: record(`${dir}/luc_favre_20260801.photos.zip`, 5 * 1024 ** 2)
        }
      }
    ],
    remote: { dirs: [dir], sizes, at: 1_785_020_000 }
  })

  test('stays uploaded while the storage still has it', async () => {
    await renderBoard(
      uploaded({
        [`${dir}/luc_favre_20260801.mp4`]: 3 * GB,
        [`${dir}/luc_favre_20260801.photos.zip`]: 5 * 1024 ** 2
      }),
      false
    )
    await expect
      .element(page.getByRole('button', { name: 'Upload again…', exact: true }))
      .toBeInTheDocument()
    await expect.element(page.getByText(/no longer on the storage/)).not.toBeInTheDocument()
  })

  test('reads as not uploaded once the files are gone, and names them', async () => {
    await renderBoard(uploaded({ [`${dir}/luc_favre_20260801.photos.zip`]: 5 * 1024 ** 2 }), false)
    await expect
      .element(page.getByRole('button', { name: 'Upload…', exact: true }))
      .toBeInTheDocument()
    await expect.element(page.getByText(/no longer on the storage/)).toBeInTheDocument()
    await expect.element(page.getByText('luc_favre_20260801.mp4').first()).toBeInTheDocument()
  })
})

/* Freeing an uploaded tandem: offered only once it is up there, never without asking, and what is
   left afterwards says it lives on the storage only. */
describe('freeing an uploaded tandem', () => {
  const dir = '/SkyDock/Tandems/Luc Favre'
  const sent = (remotePath: string, size: number) => ({
    remotePath,
    md5: 'x',
    size,
    localPath: '/local',
    at: 1_785_010_000
  })
  const uploaded = {
    ...board,
    groups: [
      {
        ...board.groups[0],
        delivered: {
          at: 1_785_010_000,
          film: sent(`${dir}/luc_favre_20260801.mp4`, 3 * GB),
          photos: sent(`${dir}/luc_favre_20260801.photos.zip`, 5 * 1024 ** 2)
        }
      }
    ],
    remote: {
      dirs: [dir],
      sizes: {
        [`${dir}/luc_favre_20260801.mp4`]: 3 * GB,
        [`${dir}/luc_favre_20260801.photos.zip`]: 5 * 1024 ** 2
      },
      at: 1_785_020_000
    }
  }

  test('asks first, saying what is proved and what is deleted, then sends it', async () => {
    delivered.length = 0
    await renderBoard(uploaded, false)
    await userEvent.click(page.getByRole('button', { name: 'Free up space…' }))
    const dialog = page.getByRole('dialog', { name: 'Free up space' })
    await expect.element(dialog.getByText(/hashed here and by the storage/)).toBeInTheDocument()
    await expect.element(dialog.getByText(/the 3 originals/)).toBeInTheDocument()
    expect(delivered).toEqual([])
    await userEvent.click(dialog.getByRole('button', { name: /Check and free/ }))
    await vi.waitFor(() =>
      expect(delivered).toContainEqual({ intent: 'free-tandem', groupId: 'g1' })
    )
  })

  test('is not offered before the tandem is uploaded', async () => {
    await renderBoard(board, false)
    await expect.element(page.getByRole('button', { name: 'Free up space…' })).not.toBeInTheDocument()
  })

  test('once freed, says it lives on the storage only, and offers nothing that would change it', async () => {
    const files = uploaded.groups[0]!.files.map((f) => ({ ...f, freed: true }))
    await renderBoard(
      {
        ...uploaded,
        groups: [{ ...uploaded.groups[0]!, files, freed: { at: 1_785_030_000, bytes: 19 * GB } }]
      },
      false
    )
    /* what freeing gave back is said once, when it happens — not on every visit */
    await expect.element(page.getByText(/given back/)).not.toBeInTheDocument()
    for (const name of ['Reset…', 'Delete…', 'Free up space…', 'Upload again…'])
      await expect.element(page.getByRole('button', { name })).not.toBeInTheDocument()
  })
})

/* Telling the passenger: the email is written and laid out already, shown as it will arrive, and
   copied into a new Gmail message that is already addressed and titled. */
describe('emailing the passenger their link', () => {
  const LINK = 'https://nas.local/sharing/AbC123'
  const linked = {
    ...board,
    groups: [{ ...board.groups[0], delivered: { at: 1_785_010_000, shareUrl: LINK } }]
  }

  const openEmail = async () => {
    await userEvent.click(page.getByRole('button', { name: 'Email Luc…' }))
    return page.getByRole('dialog', { name: 'Email the passenger' })
  }

  test('shows the email as it will arrive, with the link, already written in French', async () => {
    await renderBoard(linked, false)
    const dialog = await openEmail()
    await expect
      .element(dialog.getByLabelText('Subject'))
      .toHaveValue('Ta vidéo et tes photos de ton saut en tandem')
    const preview = dialog.getByTitle('Email preview').element() as HTMLIFrameElement
    expect(preview.srcdoc).toContain('Bonjour Luc,')
    expect(preview.srcdoc).toContain(LINK)
    await page.screenshot({ path: './playwright-screenshots/email-dialog.png' })
  })

  test('opens a new Gmail message, addressed and titled, with nothing to connect', async () => {
    delivered.length = 0
    const opened: string[] = []
    const open = window.open
    window.open = ((url?: string | URL) => {
      opened.push(String(url))
      return null
    }) as typeof window.open
    try {
      await renderBoard(linked, false)
      const dialog = await openEmail()
      await userEvent.fill(dialog.getByLabelText('To'), 'luc@example.com')
      await userEvent.click(dialog.getByRole('button', { name: 'Copy & open Gmail' }))
      /* the email is copied first, and Gmail opened once it is */
      await vi.waitFor(() => expect(opened).toHaveLength(1))
      const url = new URL(opened[0]!)
      expect(url.host).toBe('mail.google.com')
      expect(url.searchParams.get('to')).toBe('luc@example.com')
      expect(url.searchParams.get('su')).toBe('Ta vidéo et tes photos de ton saut en tandem')
    } finally {
      window.open = open
    }
    /* nothing is sent from here */
    expect(delivered).toEqual([])
  })

  test('offers the computer\'s own mail program too, for anyone not on Gmail', async () => {
    await renderBoard(linked, false)
    const dialog = await openEmail()
    await expect
      .element(dialog.getByRole('button', { name: 'Copy & open my mail app' }))
      .toBeInTheDocument()
  })

  test('is not offered before there is a link to send', async () => {
    await renderBoard(board, false)
    await expect.element(page.getByRole('button', { name: 'Email Luc…' })).not.toBeInTheDocument()
  })
})
