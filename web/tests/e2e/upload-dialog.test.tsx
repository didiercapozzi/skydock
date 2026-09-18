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
import { setBackupChoice } from '../../app/hooks/useBackupChoice'

/* Uploading a tandem is the one step that hands things to someone, so it shows what it is about to do
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

const requests: unknown[] = []

const renderBoard = async (data: typeof board | Record<string, unknown> = board, open = true) => {
  const Stub = createRoutesStub([
    { path: '/', Component: Board, loader: () => data },
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
  const screen = await render(createElement(Stub, { initialEntries: ['/'] }))
  await userEvent.click(page.getByRole('button', { name: /Luc Favre/ }).first())
  if (open) await userEvent.click(page.getByRole('button', { name: 'Upload…', exact: true }))
  return screen
}

describe('uploading a tandem — the dialog first', () => {
  test('lays out both parcels and both folders before anything is sent', async () => {
    requests.length = 0
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
    await page.screenshot({ path: './playwright-screenshots/upload-dialog.png' })
    expect(requests).toEqual([])
  })

  test('adds the film to the backup, and says so, when it is ticked', async () => {
    await renderBoard()
    const dialog = page.getByRole('dialog', { name: 'Upload' })
    const film = dialog.getByRole('checkbox', { name: /a copy of the film/ })
    await userEvent.click(film)
    await expect.element(dialog.getByText('2 original videos + the film')).toBeInTheDocument()
    await expect.element(dialog.getByText('19.0 GB to the backup · 3.0 GB to Luc Favre')).toBeInTheDocument()
    await userEvent.click(film)
  })

  test('keeps the originals as plain files when asked, in a folder of their own', async () => {
    await renderBoard()
    const dialog = page.getByRole('dialog', { name: 'Upload' })
    await userEvent.click(dialog.getByRole('button', { name: 'Plain files' }))
    await expect.element(dialog.getByText('luc_favre_20260801/')).toBeInTheDocument()
    await expect.element(dialog.getByText('2 original videos, as files')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'One zip' }))
  })

  test('sends the upload, with the choice, only from its own button', async () => {
    requests.length = 0
    await renderBoard()
    const dialog = page.getByRole('dialog', { name: 'Upload' })
    await userEvent.click(dialog.getByRole('button', { name: 'Upload', exact: true }))
    await vi.waitFor(() =>
      expect(requests).toContainEqual({
        intent: 'upload-tandem',
        groupId: 'g1',
        backup: { backupAs: 'zip', filmToBackup: false, projectToBackup: false }
      })
    )
  })

  /* the edit exists nowhere else, so it can be kept with the originals — off until chosen */
  test('keeps the editing project with the backup when it is ticked', async () => {
    requests.length = 0
    await renderBoard()
    const dialog = page.getByRole('dialog', { name: 'Upload' })
    const project = dialog.getByRole('checkbox', { name: /the kdenlive project/ })
    await expect.element(project).not.toBeChecked()

    await userEvent.click(project)

    await expect.element(dialog.getByText('2 original videos + the project')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Upload', exact: true }))
    await vi.waitFor(() =>
      expect(requests).toContainEqual({
        intent: 'upload-tandem',
        groupId: 'g1',
        backup: { backupAs: 'zip', filmToBackup: false, projectToBackup: true }
      })
    )
    /* the choice is remembered for the club, so it is put back for the tests that follow */
    setBackupChoice({ backupAs: 'zip', filmToBackup: false, projectToBackup: false })
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
        uploaded: {
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
        uploaded: {
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
    requests.length = 0
    await renderBoard(uploaded, false)
    await userEvent.click(page.getByRole('button', { name: 'Free up space…' }))
    const dialog = page.getByRole('dialog', { name: 'Free up space' })
    await expect.element(dialog.getByText(/hashed here and by the storage/)).toBeInTheDocument()
    await expect.element(dialog.getByText(/the 3 originals/)).toBeInTheDocument()
    expect(requests).toEqual([])
    await userEvent.click(dialog.getByRole('button', { name: /Check and free/ }))
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ intent: 'free-tandem', groupId: 'g1' })
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
    groups: [{ ...board.groups[0], uploaded: { at: 1_785_010_000, shareUrl: LINK } }]
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
    requests.length = 0
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
    expect(requests).toEqual([])
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

/* The storage's own list of tandems, under On the storage: every tandem up there — this machine's
   and the ones it no longer has — with whether the passenger was emailed, and a way to say so. */
describe('the tandems on the storage', () => {
  const DIR = '/SkyDock/Tandems'
  const listed = {
    ...board,
    storage: {
      dir: DIR,
      problem: null,
      tandems: [
        {
          folder: `${DIR}/Ana Roth`,
          firstname: 'Ana',
          lastname: 'Roth',
          day: '28.07.2026',
          videos: 12,
          photos: 40,
          uploadedAt: 1_785_000_000,
          shareUrl: 'https://nas.local/sharing/Ana',
          backup: '/Backup/ana_roth_20260728.rushes.zip',
          freedAt: 1_785_100_000
        }
      ]
    }
  }

  test('lists a tandem this machine no longer has, and whether its passenger was emailed', async () => {
    await renderBoard(listed, false)
    await userEvent.click(
      page.getByRole('navigation', { name: 'Folders' }).getByRole('button', { name: /On the storage/ })
    )
    await expect.element(page.getByRole('region', { name: 'On the storage' })).toBeInTheDocument()
    await expect.element(page.getByText('Ana Roth')).toBeInTheDocument()
    await expect.element(page.getByText('not emailed', { exact: true })).toBeInTheDocument()
    await expect.element(page.getByText('🔒 storage only')).toBeInTheDocument()
  })

  test('emails it from its entry, and says on the list that it was sent', async () => {
    requests.length = 0
    await renderBoard(listed, false)
    await userEvent.click(
      page.getByRole('navigation', { name: 'Folders' }).getByRole('button', { name: /On the storage/ })
    )
    await userEvent.click(page.getByRole('button', { name: 'Email…' }))
    const dialog = page.getByRole('dialog', { name: 'Email the passenger' })
    const preview = dialog.getByTitle('Email preview').element() as HTMLIFrameElement
    expect(preview.srcdoc).toContain('Bonjour Ana,')
    await userEvent.fill(dialog.getByLabelText('To'), 'ana@example.com')
    await userEvent.click(dialog.getByRole('button', { name: 'Mark as sent' }))
    await vi.waitFor(() =>
      expect(requests).toContainEqual({
        intent: 'mark-emailed',
        emailed: { folder: `${DIR}/Ana Roth`, sent: true, to: 'ana@example.com' }
      })
    )
  })
})

/* Every passenger walks the same six steps, and the board says where each one is: on their entry in
   the menu, on their tandem's card, and the whole way in the panel. Luc Favre here is processed,
   edited and rendered — so the next thing is the upload. */
describe('where every passenger has got to', () => {
  test('says on the passenger’s entry in the menu which step is next', async () => {
    await renderBoard(board, false)

    const entry = page.getByRole('navigation', { name: 'Folders' }).getByRole('button', {
      name: /Luc Favre/
    })
    await expect.poll(() => entry.element().textContent).toContain('to upload')
    await expect
      .element(entry.getByRole('img', { name: /Next: Upload it — 4 of 6 steps done/ }))
      .toBeInTheDocument()
  })

  test('shows the whole way in the panel, with what to do next at the step it is at', async () => {
    await renderBoard(board, false)

    const trail = page.getByRole('list', { name: 'Where this tandem has got to' }).first()
    await expect.element(trail).toBeInTheDocument()
    await expect
      .poll(() => trail.element().querySelector('[aria-current="step"]')?.textContent)
      .toMatch(/Uploaded\s*Next: Upload it$/)
    await expect.element(trail.getByText('Rendered — done')).toBeInTheDocument()
  })

  /* a passenger with two jumps has a card for each, and each says its own step */
  test('marks each of a passenger’s tandem cards with its step', async () => {
    const second = {
      ...board.groups[0],
      id: 'g2',
      processed: false,
      files: [{ ...files[0], id: 'v9', path: '/workspace/output/original_files/x/GX019999.MP4' }]
    }
    await renderBoard({ ...board, groups: [...board.groups, second] }, false)

    const cards = page.getByRole('button', { name: /^Luc Favre, / })
    await expect.poll(() => cards.elements().map((c) => c.textContent)).toEqual([
      expect.stringContaining('to upload'),
      expect.stringContaining('to process')
    ])
  })

  /* a passenger with one tandem is that tandem: no card repeats what the panel says */
  test('draws no card for a passenger’s only tandem, whose panel is already open', async () => {
    await renderBoard(board, false)

    await expect.element(page.getByRole('button', { name: /^Luc Favre, / })).not.toBeInTheDocument()
    await expect
      .element(page.getByRole('list', { name: 'Where this tandem has got to' }))
      .toBeInTheDocument()
    /* the panel's own way of acting on it is there without selecting anything */
    await expect.element(page.getByRole('button', { name: /Select its 3 files/ })).toBeInTheDocument()
  })
})

/* A tandem freed and walked to its last step — emailed, as the storage's list says — has nothing
   left to do here. It leaves the tandems, and is found in the storage's own list. */
describe('a tandem with nothing left to do', () => {
  const DIR = '/SkyDock/Tandems'
  const sent = (name: string) => ({
    remotePath: `${DIR}/Luc Favre/${name}`,
    md5: 'x',
    size: 1,
    localPath: '/local',
    at: 1_785_010_000
  })
  const entry = (emailed: boolean) => ({
    folder: `${DIR}/Luc Favre`,
    firstname: 'Luc',
    lastname: 'Favre',
    day: '01.08.2026',
    videos: 2,
    photos: 1,
    uploadedAt: 1_785_010_000,
    shareUrl: 'https://nas.local/sharing/Luc',
    ...(emailed ? { emailed: { at: 1_785_020_000 } } : {})
  })
  const freed = (emailed: boolean) => ({
    ...board,
    groups: [
      {
        ...board.groups[0],
        freed: { at: 1_785_015_000, bytes: 16 * GB },
        uploaded: { at: 1_785_010_000, film: sent('luc.mp4'), photos: sent('luc.photos.zip') }
      }
    ],
    storage: { dir: DIR, problem: null, tandems: [entry(emailed)] }
  })
  const menu = () => page.getByRole('navigation', { name: 'Folders' })

  test('leaves the tandems once it is freed and the passenger was emailed', async () => {
    const Stub = createRoutesStub([{ path: '/', Component: Board, loader: () => freed(true) }])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await expect.element(menu().getByRole('heading', { name: /Tandems/ })).toBeInTheDocument()
    await expect.element(menu().getByRole('button', { name: /Luc Favre/ })).not.toBeInTheDocument()
    /* still there, where every tandem on the storage is */
    await expect.poll(() => menu().element().textContent).toContain('On the storage')
  })

  /* freed alone is not done: the passenger still has to hear about it */
  test('stays, saying what is left, while the passenger has not been emailed', async () => {
    const Stub = createRoutesStub([{ path: '/', Component: Board, loader: () => freed(false) }])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    const luc = menu().getByRole('button', { name: /Luc Favre/ })
    await expect.poll(() => luc.element().textContent).toContain('to email')
  })
})

/* There is no page of every tandem: a tandem is worked on one passenger at a time. The Tandems
   heading is where a jump is dropped to become one, and a click on it goes nowhere. */
describe('the tandems in the menu', () => {
  test('offers no overall view, only the passengers', async () => {
    await renderBoard(board, false)
    const menu = page.getByRole('navigation', { name: 'Folders' })

    await expect.element(menu.getByRole('heading', { name: /Tandems/ })).toBeInTheDocument()
    await expect.element(menu.getByRole('button', { name: /In progress/ })).not.toBeInTheDocument()
    await expect.element(menu.getByRole('button', { name: /Luc Favre/ })).toBeInTheDocument()
  })
})

/* The film is rendered in the editor, and the board hears of it by itself: the Rendered step ticks
   and the board says so, with nothing pressed and nothing reloaded. */
describe('a film the editor has just rendered', () => {
  test('ticks the Rendered step by itself, and says the film is ready', async () => {
    let stream: { onmessage: ((message: { data: string }) => void) | null } | null = null
    const silent = globalThis.EventSource
    vi.stubGlobal(
      'EventSource',
      class {
        onmessage: ((message: { data: string }) => void) | null = null
        close = () => {}
        constructor() {
          stream = this
        }
      }
    )
    const waiting = { ...board, tandems: { g1: { ...board.tandems.g1, film: null } } }
    await renderBoard(waiting, false)
    const trail = page.getByRole('list', { name: 'Where this tandem has got to' })
    await expect
      .poll(() => trail.element().querySelector('[aria-current="step"]')?.textContent)
      .toContain('Rendered')

    stream!.onmessage?.({
      data: JSON.stringify({
        kind: 'tandem',
        groupId: 'g1',
        who: 'Luc Favre',
        fact: board.tandems.g1,
        rendered: true
      })
    })

    await expect
      .poll(() => trail.element().querySelector('[aria-current="step"]')?.textContent)
      .toContain('Uploaded')
    await expect
      .element(page.getByText('Luc Favre’s film is rendered — ready to upload'))
      .toBeInTheDocument()
    /* the stream goes back to the silent one every other test here is drawn with */
    vi.stubGlobal('EventSource', silent)
  })
})

/* A tandem can be deleted at whatever step it has reached — this one has an edit and a film — and
   deleting asks first, saying what goes with it and that its files come back loose. */
describe('deleting a tandem that is already edited and rendered', () => {
  test('is offered on its panel, and says what goes and where the files go', async () => {
    requests.length = 0
    await renderBoard(board, false)

    await userEvent.click(page.getByRole('button', { name: 'Delete tandem…' }))

    const dialog = page.getByRole('dialog', { name: 'Delete tandem' })
    await expect.element(dialog.getByText('Back to Fresh files, loose')).toBeInTheDocument()
    await expect.element(dialog.getByText(/the kdenlive project — the edit itself/)).toBeInTheDocument()
    await expect.element(dialog.getByText('3 files, loose, to be sorted again')).toBeInTheDocument()

    await userEvent.click(dialog.getByRole('button', { name: 'Delete', exact: true }))
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ intent: 'delete-tandem', groupId: 'g1' })
    )
  })
})

/* A board scanned again from nothing has forgotten its tandems, and the storage's list has not: a
   tandem whose files are here, waiting to be sorted, is offered back where the list names it. */
describe('a tandem this board has forgotten', () => {
  const DIR = '/SkyDock/Tandems'
  const entry = (who: [string, string], ids: string[]) => ({
    folder: `${DIR}/${who.join(' ')}`,
    firstname: who[0],
    lastname: who[1],
    day: '25.07.2026',
    videos: ids.length,
    photos: 0,
    uploadedAt: 1_785_010_000,
    files: ids.map((id) => ({ id, filename: `${id}.MP4`, mtime: 1_785_000_000 }))
  })
  /* Ana Roth's two clips sit in a jump nobody filed; Luc Favre is still on the board as he was */
  const forgot = {
    ...board,
    groups: [
      ...board.groups,
      {
        id: 'g9',
        label: 'g9',
        day: '25.07.2026',
        files: [file('a1', 'GX020001.MP4', GB), file('a2', 'GX020002.MP4', GB)]
      }
    ],
    storage: {
      dir: DIR,
      problem: null,
      tandems: [entry(['Ana', 'Roth'], ['a1', 'a2']), entry(['Luc', 'Favre'], ['v1', 'v2'])]
    }
  }

  test('is offered back from the storage’s list, and only the one that was forgotten', async () => {
    requests.length = 0
    await renderBoard(forgot, false)
    await userEvent.click(
      page.getByRole('navigation', { name: 'Folders' }).getByRole('button', { name: /On the storage/ })
    )

    const restore = page.getByRole('button', { name: /^Restore · 2 files$/ })
    await expect.element(restore).toBeInTheDocument()
    expect(page.getByRole('button', { name: /^Restore ·/ }).elements()).toHaveLength(1)

    await userEvent.click(restore)
    await vi.waitFor(() =>
      expect(requests).toContainEqual({
        intent: 'restore-tandems',
        folders: [`${DIR}/Ana Roth`]
      })
    )
  })
})
