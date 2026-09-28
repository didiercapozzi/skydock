import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadManifest: vi.fn(() => null) }
})

import { speak } from '../../app/i18n'
import { boardRoute } from './board-route'

/* A montage is named once, and naming is making: a jump or picked files in Fresh files become one,
   a single file too, and what a dropzone holds is copied in so the dropzone keeps its own (RULES,
   Making a montage). A montage belongs to no destination. Clicked and typed in a real browser, the
   answers the server's. */

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const file = (id: string, mtime: number) => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime
})

const FRESH_JUMP = {
  id: 'g1',
  label: 'g1',
  day: '01.08.2026',
  name: 'Sunset load',
  files: [file('a', AT), file('b', AT + 60)]
}
const YVERDON_JUMP = {
  id: 'y1',
  label: 'y1',
  day: '01.08.2026',
  destination: 'Yverdon',
  files: [file('y', AT + 7200), file('z', AT + 7260)]
}

const board = {
  groups: [FRESH_JUMP, YVERDON_JUMP],
  looseFiles: [file('solo', AT + 9000)],
  destinations: [{ name: 'Yverdon' }, { name: 'Passengers' }],
  outputs: {},
  proxies: {},
  montages: {},
  remote: null,
  storage: null,
  hasManifest: true,
  processing: null,
  nas: { connected: false, hostname: null, backupFolder: null }
}

const montage = (name: [string, string], files: ReturnType<typeof file>[], over = {}) => ({
  id: 'm1',
  label: 'm1',
  day: '01.08.2026',
  montageJump: true,
  passenger: { firstname: name[0], lastname: name[1] },
  files,
  ...over
})

const sent: Record<string, unknown>[] = []

const renderBoard = async (answer: unknown, at = '/', shown: unknown = board) => {
  sent.length = 0
  const Stub = createRoutesStub([
    boardRoute(() => shown),
    {
      path: '/api/manifest',
      action: async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>)
        return answer
      }
    }
  ])
  await render(createElement(Stub, { initialEntries: [at] }))
}

const card = (name: RegExp) => page.getByRole('button', { name })
const details = () => page.getByRole('complementary', { name: 'Details' })
/* a montage's page: its panel is open without being asked for, headed by its name */
const pageHeading = (name: string) =>
  details().getByRole('heading', { name: new RegExp(`^${name}`) })

describe('a jump in Fresh files', () => {
  test('is named only by making it a montage, which starts from the name it has', async () => {
    await renderBoard({ groups: [] })
    await userEvent.click(card(/^Sunset load, /))

    await expect.element(details().getByTitle('Rename this jump')).not.toBeInTheDocument()
    await userEvent.click(details().getByRole('button', { name: 'Make a montage…' }))

    await expect.element(details().getByRole('textbox', { name: 'Name' })).toHaveValue('Sunset load')
  })

  test('named, is the montage, and the board goes to it', async () => {
    await renderBoard({ groups: [] })
    await userEvent.click(card(/^Sunset load, /))
    await userEvent.click(details().getByRole('button', { name: 'Make a montage…' }))
    await userEvent.fill(details().getByRole('textbox', { name: 'Name' }), 'Luc Favre')
    await userEvent.click(details().getByRole('button', { name: 'Make montage' }))

    await expect.element(pageHeading('Luc Favre')).toBeVisible()
    await expect
      .poll(() => sent.at(-1))
      .toMatchObject({
        intent: 'save-groups',
        groups: expect.arrayContaining([
          expect.objectContaining({
            id: 'g1',
            montageJump: true,
            passenger: { firstname: 'Luc', lastname: 'Favre' }
          })
        ])
      })
  })
})

describe('picked files in Fresh files', () => {
  test('named, are made a montage, and the board goes to it', async () => {
    await renderBoard({
      groups: [YVERDON_JUMP, montage(['Boogie', '2026'], FRESH_JUMP.files)],
      looseFiles: [file('solo', AT + 9000)]
    })
    await userEvent.click(card(/^Sunset load, /))
    for (const name of [/a\.MP4/, /b\.MP4/])
      await userEvent.click(page.getByRole('button', { name }).last(), {
        modifiers: ['ControlOrMeta']
      })
    await userEvent.click(details().getByRole('button', { name: 'Make a montage of these…' }))
    await userEvent.fill(details().getByRole('textbox', { name: 'Name' }), 'Boogie 2026')
    await userEvent.click(details().getByRole('button', { name: 'Make montage' }))

    expect(sent[0]).toMatchObject({ intent: 'make-montage', fileIds: ['a', 'b'], name: 'Boogie 2026' })
    await expect.element(pageHeading('Boogie 2026')).toBeVisible()
  })

  test('one file on its own can be made a montage', async () => {
    await renderBoard({ groups: [FRESH_JUMP, YVERDON_JUMP, montage(['Solo', ''], [file('solo', AT + 9000)])] })
    await userEvent.click(card(/^Loose files, /))
    await userEvent.click(page.getByRole('button', { name: /solo\.MP4/ }).last())
    await userEvent.click(details().getByRole('button', { name: 'Make a montage of this…' }))
    await userEvent.fill(details().getByRole('textbox', { name: 'Name' }), 'Solo')
    await userEvent.click(details().getByRole('button', { name: 'Make montage' }))

    expect(sent[0]).toMatchObject({ intent: 'make-montage', fileIds: ['solo'], name: 'Solo' })
    await expect.element(pageHeading('Solo')).toBeVisible()
  })
})

describe('files a dropzone holds', () => {
  test('are copied into a montage, and the dropzone keeps them', async () => {
    const copies = YVERDON_JUMP.files.map((f) => ({ ...f, id: `${f.id}~1`, copyOf: f.id }))
    await renderBoard({
      groups: [FRESH_JUMP, YVERDON_JUMP, montage(['Boogie', '2026'], copies)],
      looseFiles: [file('solo', AT + 9000)]
    }, '/dropzone/Yverdon')
    for (const name of [/y\.MP4/, /z\.MP4/])
      await userEvent.click(page.getByRole('button', { name }).last(), {
        modifiers: ['ControlOrMeta']
      })
    await userEvent.click(details().getByRole('button', { name: 'Copy into a montage…' }))
    await userEvent.fill(details().getByRole('textbox', { name: 'Name' }), 'Boogie 2026')

    await expect.element(details().getByText(/copied, Yverdon keeps its own/)).toBeVisible()
    await userEvent.click(details().getByRole('button', { name: 'Copy into montage' }))

    expect(sent[0]).toMatchObject({ intent: 'make-montage', fileIds: ['y', 'z'], name: 'Boogie 2026' })
    await expect.element(pageHeading('Boogie 2026')).toBeVisible()
    await userEvent.click(page.getByRole('navigation', { name: 'Folders' }).getByText('Yverdon'))
    await expect.element(page.getByRole('button', { name: /y\.MP4/ }).first()).toBeVisible()
  })
})

describe('a montage', () => {
  const withMontage = { ...board, groups: [...board.groups, montage(['Boogie', '2026'], [file('m', AT)])] }

  /* a montage belongs to no place, and Passengers is a destination like Yverdon */
  test('is listed among the montages, and Passengers among the destinations', async () => {
    await renderBoard({ groups: withMontage.groups }, '/montage/Boogie 2026', withMontage)

    const menu = page.getByRole('navigation', { name: 'Folders' })
    await expect.element(menu.getByRole('link', { name: /Boogie 2026/ })).toBeVisible()
    await expect.element(menu.getByRole('link', { name: /Passengers/ })).toBeVisible()
    await expect.element(details().getByRole('combobox', { name: 'Delivered to' })).not.toBeInTheDocument()
  })
})

/* A montage whose last files go back to Fresh files is left with nothing, so the board goes there with
   them (RULES, Filing). */
describe('a montage emptied', () => {
  const at = (files: ReturnType<typeof file>[]) => {
    const shown = { ...board, groups: [...board.groups, montage(['Boogie', '2026'], files)] }
    return renderBoard({ groups: shown.groups }, '/montage/Boogie 2026', shown)
  }
  const fresh = () => page.getByRole('heading', { name: /^Fresh files/ })
  const takeOut = () => page.getByRole('dialog', { name: 'Remove files' })

  test('goes back to Fresh files once its last file is sent back', async () => {
    await at([file('m', AT)])
    await userEvent.click(page.getByRole('button', { name: /m\.MP4/ }).first())

    await userEvent.keyboard('{Delete}')
    await userEvent.click(takeOut().getByRole('button', { name: 'Loose in Fresh files' }))

    await vi.waitFor(() => expect(sent).toContainEqual(expect.objectContaining({ intent: 'move-files', fileIds: ['m'] })))
    await expect.element(fresh()).toBeVisible()
  })

  test('stays on the montage while it still has files', async () => {
    await at([file('m', AT), file('n', AT + 60)])
    await userEvent.click(page.getByRole('button', { name: /m\.MP4/ }).first())

    await userEvent.keyboard('{Delete}')
    await userEvent.click(takeOut().getByRole('button', { name: 'Loose in Fresh files' }))

    await vi.waitFor(() => expect(sent).toContainEqual(expect.objectContaining({ intent: 'move-files', fileIds: ['m'] })))
    await expect.element(pageHeading('Boogie 2026')).toBeVisible()
  })
})

/* A file taken out of a montage has two ways out, and which one is asked (RULES, Montages): back to
   Fresh files, or into the bin. */
describe('files taken out of a montage', () => {
  const at = (files: (ReturnType<typeof file> & { copyOf?: string })[]) => {
    const shown = { ...board, groups: [...board.groups, montage(['Boogie', '2026'], files)] }
    return renderBoard({ groups: shown.groups }, '/montage/Boogie 2026', shown)
  }
  const takeOut = () => page.getByRole('dialog', { name: 'Remove files' })

  test('ask whether they go back to Fresh files or into the bin, and move nothing until then', async () => {
    await at([file('m', AT), file('n', AT + 60)])
    await userEvent.click(page.getByRole('button', { name: /m\.MP4/ }).first())

    await userEvent.keyboard('{Delete}')

    await expect.element(takeOut().getByRole('button', { name: 'Loose in Fresh files' })).toBeVisible()
    await expect.element(takeOut().getByRole('button', { name: 'Put in the bin' })).toBeVisible()
    expect(sent).toEqual([])
  })

  test('offer the bin as the red button with the bin on it', async () => {
    await at([file('m', AT), file('n', AT + 60)])
    await userEvent.click(page.getByRole('button', { name: /m\.MP4/ }).first())

    await userEvent.keyboard('{Delete}')

    const toBin = takeOut().getByRole('button', { name: 'Put in the bin' }).element()
    expect(getComputedStyle(toBin).backgroundColor).toBe('rgb(198, 40, 40)')
    expect(toBin.querySelector('svg')).not.toBeNull()
  })

  test('go into the bin when that is chosen', async () => {
    await at([file('m', AT), file('n', AT + 60)])
    await userEvent.click(page.getByRole('button', { name: /m\.MP4/ }).first())

    await userEvent.keyboard('{Delete}')
    await userEvent.click(takeOut().getByRole('button', { name: 'Put in the bin' }))

    await vi.waitFor(() => expect(sent).toContainEqual({ intent: 'trash-unsorted', fileIds: ['m'] }))
  })

  test('stay where they are when it is cancelled', async () => {
    await at([file('m', AT), file('n', AT + 60)])
    await userEvent.click(page.getByRole('button', { name: /m\.MP4/ }).first())

    await userEvent.keyboard('{Delete}')
    await userEvent.click(takeOut().getByRole('button', { name: 'Cancel' }))

    await expect.element(takeOut()).not.toBeInTheDocument()
    expect(sent).toEqual([])
  })

  /* a copy is the montage's own hold on a file that stays where it is */
  test('cannot put a copy in the bin', async () => {
    await at([file('m', AT), { ...file('c', AT + 60), copyOf: 'plane' }])
    for (const name of [/m\.MP4/, /c\.MP4/])
      await userEvent.click(page.getByRole('button', { name }).first(), { modifiers: ['ControlOrMeta'] })

    await userEvent.keyboard('{Delete}')

    await expect.element(takeOut().getByRole('button', { name: 'Put in the bin' })).toBeDisabled()
  })
})

/* What is dropped on the Montages heading becomes a montage, and a montage is its name: the name is
   asked for before anything moves (RULES, Making a montage). */
describe('dropped on the Montages heading', () => {
  const heading = () =>
    page.getByRole('navigation', { name: 'Folders' }).getByRole('heading', { name: /Montages/ })
  const naming = () => page.getByRole('dialog', { name: 'Name the montage' })

  test('a jump asks for the montage’s name, and saved, is that montage', async () => {
    const named = { ...FRESH_JUMP, montageJump: true, passenger: { firstname: 'Luc', lastname: 'Favre' } }
    await renderBoard({ groups: [named, YVERDON_JUMP] })

    await userEvent.dragAndDrop(card(/^Sunset load, /), heading())
    await userEvent.fill(naming().getByRole('textbox', { name: 'Name' }), 'Luc Favre')
    await userEvent.click(naming().getByRole('button', { name: 'Make montage' }))

    expect(sent[0]?.intent).toBe('save-groups')
    expect((sent[0]?.groups as { id: string }[]).find((g) => g.id === 'g1')).toMatchObject({
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' }
    })
    await expect.element(pageHeading('Luc Favre')).toBeVisible()
  })

  test('cancelled, changes nothing', async () => {
    await renderBoard({ groups: board.groups })

    await userEvent.dragAndDrop(card(/^Sunset load, /), heading())
    await userEvent.click(naming().getByRole('button', { name: 'Cancel' }))

    await expect.element(naming()).not.toBeInTheDocument()
    expect(sent).toEqual([])
    await expect.element(card(/^Sunset load, /)).toBeInTheDocument()
  })

  test('picked files ask the same, and are made a montage of that name', async () => {
    await renderBoard({ groups: [YVERDON_JUMP, montage(['Boogie', '2026'], FRESH_JUMP.files)] })
    await userEvent.click(card(/^Sunset load, /))
    for (const name of [/a\.MP4/, /b\.MP4/])
      await userEvent.click(page.getByRole('button', { name }).last(), { modifiers: ['ControlOrMeta'] })

    await userEvent.dragAndDrop(page.getByRole('button', { name: /a\.MP4/ }).last(), heading())
    await expect.element(naming().getByText('These 2 files become a montage once it has a name.')).toBeInTheDocument()
    await userEvent.fill(naming().getByRole('textbox', { name: 'Name' }), 'Boogie 2026')
    await userEvent.click(naming().getByRole('button', { name: 'Make montage' }))

    expect(sent[0]).toMatchObject({ intent: 'make-montage', fileIds: ['a', 'b'], name: 'Boogie 2026' })
  })
})

/* Removing files asks the one question every time, wherever they are (RULES, Putting files in the
   bin): loose in Fresh files, or into the bin. */
describe('removing files', () => {
  const removing = () => page.getByRole('dialog', { name: 'Remove files' })

  test('out of a jump in Fresh files asks, and moves nothing until answered', async () => {
    await renderBoard({ groups: board.groups })
    await userEvent.click(card(/^Sunset load, /))
    await userEvent.click(page.getByRole('button', { name: /a\.MP4/ }).last())

    await userEvent.keyboard('{Delete}')

    await expect.element(removing().getByRole('button', { name: 'Loose in Fresh files' })).toBeVisible()
    await expect.element(removing().getByRole('button', { name: 'Put in the bin' })).toBeVisible()
    expect(sent).toEqual([])
  })

  test('out of a dropzone asks too, and goes into the bin when that is chosen', async () => {
    await renderBoard({ groups: board.groups }, '/dropzone/Yverdon')
    await userEvent.click(page.getByRole('button', { name: /y\.MP4/ }).last())

    await userEvent.keyboard('{Delete}')
    await expect.element(removing().getByText(/from Yverdon/)).toBeVisible()
    await userEvent.click(removing().getByRole('button', { name: 'Put in the bin' }))

    await vi.waitFor(() => expect(sent).toContainEqual({ intent: 'trash-unsorted', fileIds: ['y'] }))
  })

  /* a loose file in Fresh files has nowhere further back to go: only the bin is left */
  test('already loose in Fresh files offers only the bin', async () => {
    await renderBoard({ groups: board.groups })
    await userEvent.click(card(/^Loose files, /))
    await userEvent.click(page.getByRole('button', { name: /solo\.MP4/ }).last())

    await userEvent.keyboard('{Delete}')

    await expect.element(removing().getByRole('button', { name: 'Put in the bin' })).toBeVisible()
    await expect.element(removing().getByRole('button', { name: 'Loose in Fresh files' })).not.toBeInTheDocument()
  })
})

/* a day is written out in words, in the language the board speaks */
describe('files grouped by day', () => {
  test('are headed by their day, written out', async () => {
    await renderBoard({ groups: board.groups })

    await userEvent.click(page.getByRole('group', { name: 'Group' }).getByRole('button', { name: 'By day' }))

    await expect.element(page.getByText(/1 August 2026/).first()).toBeVisible()
    await expect.element(page.getByText(/object Object/)).not.toBeInTheDocument()
  })

  test('are written the way the language the board speaks writes them', async () => {
    speak('fr')
    try {
      await renderBoard({ groups: board.groups })

      await userEvent.click(page.getByRole('group', { name: 'Grouper' }).getByRole('button', { name: 'Par jour' }))

      await expect.element(page.getByText(/1 août 2026/).first()).toBeVisible()
    } finally {
      speak('en')
    }
  })
})
