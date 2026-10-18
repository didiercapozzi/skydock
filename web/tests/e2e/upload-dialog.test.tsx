import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import Board from '../../app/routes/board'
import { DEFAULT_PLAN, stemOf } from '@skydock/scripts'
import { setSendPlan } from '../../app/hooks/useSendPlan'
import { boardRoute } from './board-route'

const GB = 1024 ** 3

const file = (id: string, name: string, size: number) => ({
  id,
  path: `/workspace/output/original_files/2026-08-01/${name}`,
  filename: name,
  size,
  mtime: 1_785_000_000,
  processed: {
    path: `/workspace/output/processed/Montages/Luc Favre/x/${name}`,
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
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      processed: true,
      files
    }
  ],
  looseFiles: [],
  destinations: [
    { name: 'Passengers', path: '/SkyDock/Passengers' },
    { name: 'Backup', path: '/Backup' },
    { name: 'Yverdon', path: '/SkyDock/Yverdon' }
  ],
  outputs: Object.fromEntries(files.map((f) => [f.path, { exists: true, size: f.size }])),
  proxies: {},
  montages: {
    g1: {
      project: true,
      projectPath: '/output/processed/Montages/Luc Favre/luc_favre_20260801.kdenlive',
      film: {
        size: 3 * GB,
        mtime: 1_785_003_600,
        seconds: 312,
        path: '/workspace/output/processed/Montages/Luc Favre/luc_favre_20260801.mp4'
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
    backupFolder: '/Backup'
  }
}

const requests: unknown[] = []

const renderBoard = async (data: typeof board | Record<string, unknown> = board, open = true) => {
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
    { path: '/api/remote-files', loader: () => ({ ok: false, reason: 'test' }) }
  ])
  const screen = await render(createElement(Stub, { initialEntries: ['/'] }))
  if ((data.groups as { freed?: unknown }[]).some((g) => g.freed)) {
    await userEvent.click(page.getByRole('link', { name: /Montages done/ }))
    await userEvent.click(page.getByRole('link', { name: 'Open' }))
  } else await userEvent.click(page.getByRole('link', { name: /Luc Favre/ }).first())
  if (open) await userEvent.click(page.getByRole('button', { name: 'Upload…', exact: true }))
  return screen
}

const STEM = stemOf({ id: 'g1', label: 'jump', day: '01.08.2026', montageJump: true, passenger: { firstname: 'Luc', lastname: 'Favre' }, files })

const stepper = () => document.querySelector('ol[aria-hidden="true"]')
const stepAt = () => stepper()?.querySelector('[aria-current="step"]')?.textContent
const dialog = () => page.getByRole('dialog', { name: 'Upload' })
const zip = (ending: string) => dialog().getByRole('region', { name: `${STEM}.${ending}.zip` })
const place = (name: string) => dialog().getByRole('region', { name })
const source = (item: string) =>
  item.endsWith('.zip')
    ? dialog().getByLabelText(`Send ${item}`, { exact: true })
    : dialog().getByLabelText(item === `${STEM}.mp4` ? 'The montage' : item, { exact: true })

const dropOn = async (name: string, destination: string) => {
  place(destination).element().scrollIntoView({ block: 'center' })
  await userEvent.dragAndDrop(source(name), place(destination))
}

describe('uploading a montage — the zips', () => {
  test('shows each zip with what is inside it, before anything is sent', async () => {
    setSendPlan(DEFAULT_PLAN)
    requests.length = 0
    await renderBoard()

    await expect.element(zip('full').getByText('videos/', { exact: true })).toBeInTheDocument()
    await expect.element(zip('full').getByTitle(/GX010001\.MP4/)).toBeInTheDocument()
    await expect.element(zip('full').getByText('photos/', { exact: true })).toBeInTheDocument()
    await expect.element(zip('full').getByText(`${STEM}.kdenlive`)).toBeInTheDocument()
    await page.screenshot({ path: './playwright-screenshots/upload-dialog.png' })
    expect(requests).toEqual([])
  })

  test('puts a part dragged onto the drop area into a new zip, the same part in two zips', async () => {
    setSendPlan(DEFAULT_PLAN)
    await renderBoard()

    await userEvent.dragAndDrop(
      dialog().getByLabelText('Original photos', { exact: true }),
      dialog().getByText('Drop here to make another zip')
    )

    await expect.element(zip('photos').getByText('photos/', { exact: true })).toBeInTheDocument()
    await expect.element(zip('full').getByText('photos/', { exact: true })).toBeInTheDocument()
    await expect
      .element(dialog().getByLabelText('Original photos', { exact: true }).getByText('in 2 zips'))
      .toBeInTheDocument()
  })

  test('puts a part that is pressed into a new zip', async () => {
    setSendPlan(DEFAULT_PLAN)
    await renderBoard()

    await userEvent.click(dialog().getByLabelText('Original photos', { exact: true }))

    await expect.element(zip('photos').getByText('photos/', { exact: true })).toBeInTheDocument()
  })

  test('names a zip by the ending typed for it', async () => {
    setSendPlan(DEFAULT_PLAN)
    await renderBoard()

    const ending = dialog().getByLabelText('Name ends with')
    await userEvent.clear(ending)
    await userEvent.type(ending, 'For Luc')

    await expect.element(zip('for-luc')).toBeInTheDocument()
    await expect.element(zip('for-luc').getByLabelText('Name ends with')).toHaveFocus()
  })

  test('names a zip given no ending after the montage alone', async () => {
    setSendPlan(DEFAULT_PLAN)
    await renderBoard()

    await userEvent.clear(zip('full').getByLabelText('Name ends with'))

    await expect
      .element(dialog().getByRole('region', { name: `${STEM}.zip` }))
      .toBeInTheDocument()
  })

  test('takes a part out of a zip, and a zip can be removed', async () => {
    setSendPlan(DEFAULT_PLAN)
    await renderBoard()

    await userEvent.click(
      dialog().getByRole('button', { name: `Take Original videos out of ${STEM}.full.zip` })
    )
    await expect.element(zip('full').getByText('videos/', { exact: true })).not.toBeInTheDocument()

    await userEvent.click(dialog().getByRole('button', { name: `Remove ${STEM}.full.zip` }))
    await expect.element(zip('full')).not.toBeInTheDocument()
  })
})

const PLACED = {
  ...DEFAULT_PLAN,
  placed: { 'zip:full': ['Backup'], film: ['Passengers'], photos: ['Passengers'] }
}

describe('uploading a montage — where it goes', () => {
  test('puts an item in a destination, the same one in two, and takes it out again', async () => {
    setSendPlan(PLACED)
    await renderBoard()

    await userEvent.selectOptions(dialog().getByLabelText('Add a destination', { exact: true }), 'Yverdon')
    await dropOn(`${STEM}.mp4`, 'Yverdon')
    await expect.element(place('Yverdon').getByText(`${STEM}.mp4`)).toBeInTheDocument()
    await expect.element(place('Passengers').getByText(`${STEM}.mp4`)).toBeInTheDocument()
    await expect.element(place('Yverdon').getByText('share link')).toBeInTheDocument()

    await userEvent.click(dialog().getByRole('button', { name: `Take ${STEM}.mp4 out of Yverdon` }))
    await expect.element(place('Yverdon').getByText(`${STEM}.mp4`)).not.toBeInTheDocument()
  })

  test('shows only the destinations in use, and adds another when asked', async () => {
    setSendPlan(PLACED)
    await renderBoard()

    await expect.element(place('Passengers')).toBeInTheDocument()
    await expect.element(place('Yverdon')).not.toBeInTheDocument()
    await userEvent.selectOptions(dialog().getByLabelText('Add a destination', { exact: true }), 'Yverdon')
    await expect.element(place('Yverdon').getByText('drop here')).toBeInTheDocument()

    await userEvent.click(dialog().getByRole('button', { name: 'Leave Passengers out of this upload' }))
    await expect.element(place('Passengers')).not.toBeInTheDocument()
  })

  test('takes an item dragged onto a destination', async () => {
    setSendPlan(PLACED)
    await renderBoard()

    await userEvent.selectOptions(dialog().getByLabelText('Add a destination', { exact: true }), 'Yverdon')
    await dropOn(`${STEM}.full.zip`, 'Yverdon')

    await expect.element(place('Yverdon').getByText(`${STEM}.full.zip`)).toBeInTheDocument()
    await expect
      .element(
        place('Yverdon').getByLabelText(`Inside ${STEM}.full.zip`).getByText('videos/', { exact: true })
      )
      .toBeInTheDocument()
  })

  test('puts the items in the project folder, or straight into the destination’s folder', async () => {
    setSendPlan(PLACED)
    await renderBoard()

    await expect.element(place('Passengers').getByText('luc-favre/', { exact: true })).toBeInTheDocument()
    await page.screenshot({ path: './playwright-screenshots/upload-dialog-where.png' })
    await userEvent.click(
      dialog()
        .getByRole('group', { name: 'Where in Passengers' })
        .getByRole('button', { name: 'Straight in' })
    )
    await expect
      .element(place('Passengers').getByText('luc-favre/', { exact: true }))
      .not.toBeInTheDocument()
  })

  test('leaves out a remembered destination that no longer exists', async () => {
    setSendPlan({ ...DEFAULT_PLAN, placed: { film: ['Passengers', 'Gone'], 'zip:full': ['Gone'] } })
    requests.length = 0
    await renderBoard()

    await expect.element(dialog().getByRole('button', { name: 'Upload', exact: true })).toBeEnabled()
    await userEvent.click(dialog().getByRole('button', { name: 'Upload', exact: true }))
    await vi.waitFor(() =>
      expect(requests).toContainEqual(
        expect.objectContaining({
          intent: 'upload-montage',
          plan: expect.objectContaining({
            placed: expect.objectContaining({ film: ['Passengers'], 'zip:full': [] })
          })
        })
      )
    )
  })

  test('sends the upload, as it was arranged, only from its own button', async () => {
    setSendPlan(PLACED)
    requests.length = 0
    await renderBoard()
    await userEvent.fill(dialog().getByLabelText('Project folder'), 'Boogie 2026')
    expect(requests).toEqual([])

    await userEvent.click(dialog().getByRole('button', { name: 'Upload', exact: true }))
    await vi.waitFor(() =>
      expect(requests).toContainEqual({
        intent: 'upload-montage',
        groupId: 'g1',
        plan: {
          zips: DEFAULT_PLAN.zips,
          placed: {
            'zip:full': ['Backup'],
            videos: [],
            photos: ['Passengers'],
            film: ['Passengers'],
            project: []
          },
          inRoot: [],
          folder: 'boogie-2026'
        }
      })
    )
  })
})

describe('an uploaded montage, checked against the storage', () => {
  const dir = '/SkyDock/Passengers/Luc Favre'
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
    await userEvent.click(page.getByRole('button', { name: 'More' }))
    await expect
      .element(page.getByRole('button', { name: 'Upload…', exact: true }))
      .toBeInTheDocument()
    await expect.element(page.getByText(/no longer on the storage/)).toBeInTheDocument()
    await expect.element(page.getByText('luc_favre_20260801.mp4').first()).toBeInTheDocument()
  })
})

describe('freeing an uploaded montage', () => {
  const dir = '/SkyDock/Passengers/Luc Favre'
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
      expect(requests).toContainEqual({ intent: 'free-montage', groupId: 'g1' })
    )
  })

  test('is not offered before the montage is uploaded', async () => {
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
    await expect.element(page.getByText(/given back/)).not.toBeInTheDocument()
    for (const name of ['Reset…', 'Delete montage…', 'Free up space…', 'Upload again…'])
      await expect.element(page.getByRole('button', { name })).not.toBeInTheDocument()
  })
})

describe('emailing the passenger their link', () => {
  const LINK = 'https://nas.local/sharing/AbC123'
  const linked = {
    ...board,
    groups: [{ ...board.groups[0], uploaded: { at: 1_785_010_000, shareUrl: LINK } }]
  }

  const openEmail = async () => {
    await userEvent.click(page.getByRole('button', { name: 'Email Luc…' }).first())
    return page.getByRole('dialog', { name: 'Email the link' })
  }

  test('shows the email as it will arrive, with the link, already written in French', async () => {
    await renderBoard(linked, false)
    const dialog = await openEmail()
    await expect
      .element(dialog.getByLabelText('Subject'))
      .toHaveValue('Ta vidéo et tes photos de ton saut en montage')
    const preview = dialog.getByLabelText('Email preview')
    await expect.element(preview.getByText('Bonjour Luc,')).toBeVisible()
    expect(preview.element().innerHTML).toContain(LINK)
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
      await vi.waitFor(() => expect(opened).toHaveLength(1))
      const url = new URL(opened[0]!)
      expect(url.host).toBe('mail.google.com')
      expect(url.searchParams.get('to')).toBe('luc@example.com')
      expect(url.searchParams.get('su')).toBe('Ta vidéo et tes photos de ton saut en montage')
    } finally {
      window.open = open
    }
    expect(requests).toEqual([])
  })

  test('offers the computer\'s own mail program too, for anyone not on Gmail', async () => {
    await renderBoard(linked, false)
    const dialog = await openEmail()
    await userEvent.click(dialog.getByRole('button', { name: 'Mail program' }))
    await expect
      .element(dialog.getByRole('button', { name: 'Copy & open my mail app' }))
      .toBeInTheDocument()
  })

  test('is not offered before there is a link to send', async () => {
    await renderBoard(board, false)
    await expect.element(page.getByRole('button', { name: 'Email Luc…' })).not.toBeInTheDocument()
  })
})

describe('saying whether the email went', () => {
  const DIR = '/SkyDock/Passengers'
  const LINK = 'https://nas.local/sharing/Luc'
  const said = {
    ...board,
    groups: [
      {
        ...board.groups[0],
        uploaded: {
          at: 1_785_010_000,
          shareUrl: LINK,
          sent: [{ name: 'luc.mp4', holds: ['film'], to: [`${DIR}/Luc Favre`], size: 1 }]
        }
      }
    ],
    storage: {
      dir: DIR,
      problem: null,
      lost: { folders: [], links: [] },
      montages: [
        {
          folder: `${DIR}/Luc Favre`,
          firstname: 'Luc',
          lastname: 'Favre',
          day: '01.08.2026',
          videos: 2,
          photos: 1,
          uploadedAt: 1_785_010_000,
          shareUrl: LINK
        }
      ]
    }
  }

  test('asks, in a dialog that cannot be put away, once the mail was opened', async () => {
    requests.length = 0
    const open = window.open
    window.open = (() => null) as typeof window.open
    try {
      await renderBoard(said, false)
      await userEvent.click(page.getByRole('button', { name: 'Email Luc…' }).first())
      await userEvent.click(page.getByRole('button', { name: 'Gmail', exact: true }))
      await userEvent.click(page.getByRole('button', { name: 'Copy & open Gmail' }))

      const ask = page.getByRole('dialog', { name: 'Was the email sent?' })
      await expect.element(ask).toBeVisible()
      await userEvent.keyboard('{Escape}')
      await expect.element(ask).toBeVisible()

      await userEvent.click(ask.getByRole('button', { name: 'Yes — it was sent' }))
      await vi.waitFor(() =>
        expect(requests).toContainEqual(
          expect.objectContaining({
            intent: 'mark-emailed',
            emailed: expect.objectContaining({ sent: true })
          })
        )
      )
      await expect.element(ask).not.toBeInTheDocument()
    } finally {
      window.open = open
    }
  })
})

describe('where every passenger has got to', () => {
  test('says on the passenger’s entry in the menu which step is next', async () => {
    await renderBoard(board, false)

    const entry = page.getByRole('navigation', { name: 'Folders' }).getByRole('link', {
      name: /Luc Favre/
    })
    await expect.poll(() => entry.element().textContent).toContain('to upload')
    await expect
      .element(entry.getByRole('img', { name: /Next: Upload it — 4 of 6 steps done/ }))
      .toBeInTheDocument()
  })

  test('shows the whole way on the montage page, with what to do next at the step it is at', async () => {
    await renderBoard(board, false)

    await expect.poll(stepAt).toMatch(/Uploaded\s*Next up/)
    await expect
      .element(page.getByRole('button', { name: 'Upload…', exact: true }).first())
      .toBeInTheDocument()
    expect(stepper()?.textContent).toContain('Film — done')
  })

  test('marks each of a passenger’s montage cards with its step', async () => {
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

  test('draws no card for a passenger’s only montage, whose panel is already open', async () => {
    await renderBoard(board, false)

    await expect.element(page.getByRole('button', { name: /^Luc Favre, / })).not.toBeInTheDocument()
    await expect.poll(stepAt).toMatch(/Uploaded/)
    await expect.element(page.getByRole('heading', { name: 'Who it is for' })).toBeInTheDocument()
  })
})

describe('a montage with nothing left to do', () => {
  const DIR = '/SkyDock/Passengers'
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
    storage: { dir: DIR, problem: null, lost: { folders: [], links: [] }, montages: [entry(emailed)] }
  })
  const menu = () => page.getByRole('navigation', { name: 'Folders' })

  test('leaves the montages once it is freed, and is listed under Montages done', async () => {
    const Stub = createRoutesStub([boardRoute(() => freed(true))])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await expect.element(menu().getByRole('heading', { name: /Montages/ })).toBeInTheDocument()
    await expect.element(menu().getByRole('link', { name: /Luc Favre/ })).not.toBeInTheDocument()
    await expect.element(menu().getByRole('link', { name: /Montages done/ })).toBeVisible()
  })

  test('is done once freed, whether or not the passenger has been emailed', async () => {
    const Stub = createRoutesStub([boardRoute(() => freed(false))])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await expect.element(menu().getByRole('link', { name: /Luc Favre/ })).not.toBeInTheDocument()
    await expect.element(menu().getByRole('link', { name: /Montages done/ })).toBeVisible()
  })
})

describe('the montages in the menu', () => {
  test('offers no overall view, only the passengers', async () => {
    await renderBoard(board, false)
    const menu = page.getByRole('navigation', { name: 'Folders' })

    await expect.element(menu.getByRole('heading', { name: /Montages/ })).toBeInTheDocument()
    await expect.element(menu.getByRole('button', { name: /In progress/ })).not.toBeInTheDocument()
    await expect.element(menu.getByRole('link', { name: /Luc Favre/ })).toBeInTheDocument()
  })
})

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
    const waiting = { ...board, montages: { g1: { ...board.montages.g1, film: null } } }
    await renderBoard(waiting, false)
    await expect.poll(stepAt).toContain('Film')

    stream!.onmessage?.({
      data: JSON.stringify({
        kind: 'montage',
        groupId: 'g1',
        who: 'Luc Favre',
        fact: board.montages.g1,
        rendered: true
      })
    })

    await expect.poll(stepAt).toContain('Uploaded')
    await expect
      .element(page.getByText('Luc Favre’s film is rendered — ready to upload'))
      .toBeInTheDocument()
    vi.stubGlobal('EventSource', silent)
  })
})

describe('deleting a montage that is already edited and rendered', () => {
  test('is offered on its page, once, and says what goes and where the files go', async () => {
    requests.length = 0
    await renderBoard(board, false)

    await userEvent.click(page.getByRole('button', { name: 'Delete montage…' }))

    const dialog = page.getByRole('dialog', { name: 'Delete montage' })
    await expect.element(dialog.getByText('Back to Fresh files, loose')).toBeInTheDocument()
    await expect.element(dialog.getByText(/the edit itself/)).toBeInTheDocument()
    await expect.element(dialog.getByText('3 files, loose, to be sorted again')).toBeInTheDocument()

    await userEvent.click(dialog.getByRole('button', { name: 'Delete', exact: true }))
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ intent: 'delete-montage', groupId: 'g1' })
    )
  })
})
