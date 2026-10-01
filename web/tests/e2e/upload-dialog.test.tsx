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
import { DEFAULT_PLAN, stemOf } from '@skydock/scripts'
import { setSendPlan } from '../../app/hooks/useSendPlan'
import { boardRoute } from './board-route'

/* Uploading a montage is the one step that hands things to someone, so it shows what it is about to
   do before it does it, in two steps: what is zipped, with what that makes named as it will be, and
   then which destinations each item goes to. Nothing is sent until the dialog's own button is
   pressed. */

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
    { path: '/api/upload-progress', loader: () => null },
    { path: '/api/remote-files', loader: () => ({ ok: false, reason: 'test' }) }
  ])
  const screen = await render(createElement(Stub, { initialEntries: ['/'] }))
  await userEvent.click(page.getByRole('link', { name: /Luc Favre/ }).first())
  if (open) await userEvent.click(page.getByRole('button', { name: 'Upload…', exact: true }))
  return screen
}

const STEM = stemOf({ id: 'g1', label: 'jump', day: '01.08.2026', montageJump: true, passenger: { firstname: 'Luc', lastname: 'Favre' }, files })

const dialog = () => page.getByRole('dialog', { name: 'Upload' })
const zip = (ending: string) => dialog().getByRole('region', { name: `${STEM}.${ending}.zip` })
const place = (name: string) => dialog().getByRole('region', { name })
/* dragged onto a destination, scrolled into view first so nothing moves mid-drag */
/* what is dragged onto a destination comes from the first step: a zip by its header, a part by its pill */
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
    /* the folder's files by name are in its title, not spelled out on the line */
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

  /* pressing a part is the same as dropping it on the drop area: it makes a zip of its own */
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

/* where a club sends a montage's film and photos, chosen once and remembered from then on */
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
    /* what is inside it is set apart under it, as it is in the zip itself */
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

  /* a plan remembered from an earlier montage can name a destination that has since gone */
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

/* Uploaded is what the storage holds, not what was once recorded: delete the files over there and
   the montage reads as not uploaded again, and says what went missing. */
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
    await expect
      .element(page.getByRole('button', { name: 'Upload…', exact: true }))
      .toBeInTheDocument()
    await expect.element(page.getByText(/no longer on the storage/)).toBeInTheDocument()
    await expect.element(page.getByText('luc_favre_20260801.mp4').first()).toBeInTheDocument()
  })
})

/* Freeing an uploaded montage: offered only once it is up there, never without asking, and what is
   left afterwards says it lives on the storage only. */
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
    /* what freeing gave back is said once, when it happens — not on every visit */
    await expect.element(page.getByText(/given back/)).not.toBeInTheDocument()
    for (const name of ['Reset…', 'Delete montage…', 'Free up space…', 'Upload again…'])
      await expect.element(page.getByRole('button', { name })).not.toBeInTheDocument()
  })
})

/* Sending the link: the email is written and laid out already, shown as it will arrive, and
   copied into a new Gmail message that is already addressed and titled. */
describe('emailing the passenger their link', () => {
  const LINK = 'https://nas.local/sharing/AbC123'
  const linked = {
    ...board,
    groups: [{ ...board.groups[0], uploaded: { at: 1_785_010_000, shareUrl: LINK } }]
  }

  const openEmail = async () => {
    await userEvent.click(page.getByRole('button', { name: 'Email Luc…' }))
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
      /* the email is copied first, and Gmail opened once it is */
      await vi.waitFor(() => expect(opened).toHaveLength(1))
      const url = new URL(opened[0]!)
      expect(url.host).toBe('mail.google.com')
      expect(url.searchParams.get('to')).toBe('luc@example.com')
      expect(url.searchParams.get('su')).toBe('Ta vidéo et tes photos de ton saut en montage')
    } finally {
      window.open = open
    }
    /* nothing is sent from here */
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

/* The storage's own list of montages, under On the storage: every montage up there — this machine's
   and the ones it no longer has — with whether the passenger was emailed, and a way to say so. */
describe('the montages on the storage', () => {
  const DIR = '/SkyDock/Passengers'
  const listed = {
    ...board,
    storage: {
      dir: DIR,
      problem: null,
      lost: { folders: [], links: [] },
      montages: [
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

  test('lists a montage this machine no longer has, and whether its passenger was emailed', async () => {
    await renderBoard(listed, false)
    await userEvent.click(
      page.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: /On the storage/ })
    )
    await expect.element(page.getByRole('region', { name: 'On the storage' })).toBeInTheDocument()
    await expect.element(page.getByText('Ana Roth')).toBeInTheDocument()
    await expect.element(page.getByText('not emailed', { exact: true })).toBeInTheDocument()
    await expect.element(page.getByText('storage only', { exact: true })).toBeInTheDocument()
  })

  test('emails it from its entry, and says on the list that it was sent', async () => {
    requests.length = 0
    await renderBoard(listed, false)
    await userEvent.click(
      page.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: /On the storage/ })
    )
    await userEvent.click(page.getByRole('button', { name: 'Email…' }))
    const dialog = page.getByRole('dialog', { name: 'Email the link' })
    await expect.element(dialog.getByLabelText('Email preview').getByText('Bonjour Ana,')).toBeVisible()
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

/* The list remembers; the storage says what is there. A montage whose link the storage no longer
   honours, or whose folder it no longer holds, stays on the list for what it says — whether its
   passenger was emailed, that it was freed — but offers nothing that is not there to offer. */
describe('a montage on the storage’s list that the storage no longer holds', () => {
  const DIR = '/SkyDock/Passengers'
  const ana = {
    folder: `${DIR}/Ana Roth`,
    firstname: 'Ana',
    lastname: 'Roth',
    day: '28.07.2026',
    videos: 12,
    photos: 40,
    uploadedAt: 1_785_000_000,
    shareUrl: 'https://nas.local/sharing/Ana'
  }
  const lostAs = (lost: { folders: string[]; links: string[] }) => ({
    ...board,
    storage: { dir: DIR, problem: null, lost, montages: [ana] }
  })
  const openStorage = () =>
    userEvent.click(
      page.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: /On the storage/ })
    )

  test('offers no link to send or copy once the storage no longer honours it', async () => {
    await renderBoard(lostAs({ folders: [], links: [ana.folder] }), false)
    await openStorage()
    await expect.element(page.getByText('Ana Roth')).toBeInTheDocument()
    await expect.element(page.getByText('link gone')).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'Email…' })).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()
  })

  test('says it is no longer on the storage once its folder is gone', async () => {
    await renderBoard(lostAs({ folders: [ana.folder], links: [] }), false)
    await openStorage()
    await expect.element(page.getByText('no longer on the storage')).toBeInTheDocument()
    await expect.element(page.getByRole('link', { name: 'Open' })).not.toBeInTheDocument()
  })

  /* Open on a montage up there opens the storage's own web interface, File Station, on its folder */
  test('opens the storage’s own web interface on its folder, in a new tab', async () => {
    await renderBoard(lostAs({ folders: [], links: [] }), false)
    await openStorage()

    const open = page.getByRole('link', { name: 'Open' })
    await expect.element(open).toBeVisible()
    expect(open.element().getAttribute('target')).toBe('_blank')
    const href = open.element().getAttribute('href') ?? ''
    expect(href.startsWith('https://nas.local/index.cgi?launchApp=SYNO.SDS.App.FileStation3.Instance')).toBe(true)
    expect(decodeURIComponent(decodeURIComponent(href.split('launchParam=')[1] ?? ''))).toBe(
      `openfile=${DIR}/Ana Roth`
    )
    await expect.element(page.getByRole('button', { name: 'Watch…' })).not.toBeInTheDocument()
  })
})

/* Every passenger walks the same six steps, and the board says where each one is: on their entry in
   the menu, on their montage's card, and the whole way in the panel. Luc Favre here is processed,
   edited and rendered — so the next thing is the upload. */
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

  test('shows the whole way in the panel, with what to do next at the step it is at', async () => {
    await renderBoard(board, false)

    const trail = page.getByRole('list', { name: 'Where this montage has got to' }).first()
    await expect.element(trail).toBeInTheDocument()
    await expect
      .poll(() => trail.element().querySelector('[aria-current="step"]')?.textContent)
      .toMatch(/Uploaded\s*Next: Upload it$/)
    await expect.element(trail.getByText('Rendered — done')).toBeInTheDocument()
  })

  /* a passenger with two jumps has a card for each, and each says its own step */
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

  /* a passenger with one montage is that montage: no card repeats what the panel says */
  test('draws no card for a passenger’s only montage, whose panel is already open', async () => {
    await renderBoard(board, false)

    await expect.element(page.getByRole('button', { name: /^Luc Favre, / })).not.toBeInTheDocument()
    await expect
      .element(page.getByRole('list', { name: 'Where this montage has got to' }))
      .toBeInTheDocument()
    /* the panel's own way of acting on it is there without selecting anything */
    await expect.element(page.getByRole('button', { name: /Select its 3 files/ })).toBeInTheDocument()
  })
})

/* A montage freed and walked to its last step — emailed, as the storage's list says — has nothing
   left to do here. It leaves the montages, and is found in the storage's own list. */
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

  test('leaves the montages once it is freed and the passenger was emailed', async () => {
    const Stub = createRoutesStub([boardRoute(() => freed(true))])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await expect.element(menu().getByRole('heading', { name: /Montages/ })).toBeInTheDocument()
    await expect.element(menu().getByRole('link', { name: /Luc Favre/ })).not.toBeInTheDocument()
    /* still there, where every montage on the storage is */
    await expect.poll(() => menu().element().textContent).toContain('On the storage')
  })

  /* freed alone is not done: the passenger still has to hear about it */
  test('stays, saying what is left, while the passenger has not been emailed', async () => {
    const Stub = createRoutesStub([boardRoute(() => freed(false))])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    const luc = menu().getByRole('link', { name: /Luc Favre/ })
    await expect.poll(() => luc.element().textContent).toContain('to email')
  })
})

/* There is no page of every montage: a montage is worked on one passenger at a time. The Montages
   heading is where a jump is dropped to become one, and a click on it goes nowhere. */
describe('the montages in the menu', () => {
  test('offers no overall view, only the passengers', async () => {
    await renderBoard(board, false)
    const menu = page.getByRole('navigation', { name: 'Folders' })

    await expect.element(menu.getByRole('heading', { name: /Montages/ })).toBeInTheDocument()
    await expect.element(menu.getByRole('button', { name: /In progress/ })).not.toBeInTheDocument()
    await expect.element(menu.getByRole('link', { name: /Luc Favre/ })).toBeInTheDocument()
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
    const waiting = { ...board, montages: { g1: { ...board.montages.g1, film: null } } }
    await renderBoard(waiting, false)
    const trail = page.getByRole('list', { name: 'Where this montage has got to' })
    await expect
      .poll(() => trail.element().querySelector('[aria-current="step"]')?.textContent)
      .toContain('Rendered')

    stream!.onmessage?.({
      data: JSON.stringify({
        kind: 'montage',
        groupId: 'g1',
        who: 'Luc Favre',
        fact: board.montages.g1,
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

/* A montage can be deleted at whatever step it has reached — this one has an edit and a film — and
   deleting asks first, saying what goes with it and that its files come back loose. */
describe('deleting a montage that is already edited and rendered', () => {
  test('is offered on its page, once, and says what goes and where the files go', async () => {
    requests.length = 0
    await renderBoard(board, false)

    await userEvent.click(page.getByRole('button', { name: 'Delete montage…' }))

    const dialog = page.getByRole('dialog', { name: 'Delete montage' })
    await expect.element(dialog.getByText('Back to Fresh files, loose')).toBeInTheDocument()
    await expect.element(dialog.getByText(/the kdenlive project — the edit itself/)).toBeInTheDocument()
    await expect.element(dialog.getByText('3 files, loose, to be sorted again')).toBeInTheDocument()

    await userEvent.click(dialog.getByRole('button', { name: 'Delete', exact: true }))
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ intent: 'delete-montage', groupId: 'g1' })
    )
  })
})

/* A board scanned again from nothing has forgotten its montages, and the storage's list has not: a
   montage whose files are here, waiting to be sorted, is offered back where the list names it. */
describe('a montage this board has forgotten', () => {
  const DIR = '/SkyDock/Passengers'
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
      lost: { folders: [], links: [] },
      montages: [entry(['Ana', 'Roth'], ['a1', 'a2']), entry(['Luc', 'Favre'], ['v1', 'v2'])]
    }
  }

  test('is offered back from the storage’s list, and only the one that was forgotten', async () => {
    requests.length = 0
    await renderBoard(forgot, false)
    await userEvent.click(
      page.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: /On the storage/ })
    )

    const restore = page.getByRole('button', { name: /^Restore · 2 files$/ })
    await expect.element(restore).toBeInTheDocument()
    expect(page.getByRole('button', { name: /^Restore ·/ }).elements()).toHaveLength(1)

    await userEvent.click(restore)
    await vi.waitFor(() =>
      expect(requests).toContainEqual({
        intent: 'restore-montages',
        folders: [`${DIR}/Ana Roth`]
      })
    )
  })
})
