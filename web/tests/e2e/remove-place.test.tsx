import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { RemovePlaceDialog } from '../../app/components/remove-place-dialog'
import { boardRoute } from './board-route'

/* Taking a dropzone off the board asks first, and its whole answer is what does not happen
   (RULES, Places): what was filed there comes back to Fresh files whole, every original stays on
   this machine, and the folder on the storage is left as it is. */

const open = (over: Partial<Parameters<typeof RemovePlaceDialog>[0]> = {}) =>
  render(
    createElement(RemovePlaceDialog, {
      place: 'Yverdon',
      jumps: 2,
      loose: 1,
      linked: null,
      onClose: () => {},
      onConfirm: () => {},
      ...over
    })
  )

describe('removing a place', () => {
  test('says what comes back to Fresh files, and that nothing is deleted', async () => {
    await open()

    const dialog = page.getByRole('dialog', { name: 'Remove a place' })
    await expect.element(dialog).toBeVisible()
    await expect.poll(() => dialog.element().textContent).toContain('2 jumps and 1 loose file')
    await expect.poll(() => dialog.element().textContent).toContain('come back to Fresh files')
    await expect
      .poll(() => dialog.element().textContent)
      .toContain('every original stays on this machine')
  })

  test('says the storage is left alone, when the place has a folder up there', async () => {
    await open({ linked: '/SkyDock/Yverdon' })

    const dialog = page.getByRole('dialog', { name: 'Remove a place' })
    await expect
      .poll(() => dialog.element().textContent)
      .toContain('stays on the storage, and so does any link handed out of it')
  })

  test('says so plainly when nothing is filed there', async () => {
    await open({ jumps: 0, loose: 0 })

    const dialog = page.getByRole('dialog', { name: 'Remove a place' })
    await expect.poll(() => dialog.element().textContent).toContain('nothing is filed there')
  })

  test('does nothing until it is asked to', async () => {
    const onConfirm = vi.fn()
    await open({ onConfirm })

    expect(onConfirm).not.toHaveBeenCalled()
    await userEvent.click(page.getByRole('button', { name: 'Remove Yverdon' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})

/* And the board offers it on a dropzone's own page — including an empty one, which is exactly the
   place worth taking off the board. */
describe('a dropzone on the board', () => {
  const board = (looseFiles: unknown[]) => ({
    groups: [],
    looseFiles,
    destinations: [{ name: 'Yverdon' }],
    outputs: {},
    proxies: {},
    montages: {},
    remote: null,
    storage: null,
    hasManifest: true,
    processing: null,
    nas: { connected: false, hostname: null, backupFolder: null }
  })

  const openYverdon = async (looseFiles: unknown[] = []) => {
    const sent: unknown[] = []
    const Stub = createRoutesStub([
      boardRoute(() => board(looseFiles)),
      {
        path: '/api/manifest',
        action: async ({ request }: { request: Request }) => {
          sent.push(await request.json())
          return { ok: true }
        }
      }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))
    await userEvent.click(page.getByRole('link', { name: /Yverdon/ }).first())
    return sent
  }

  test('can be taken off the board, and asks before it is', async () => {
    const sent = await openYverdon()

    await userEvent.click(page.getByRole('button', { name: 'Remove place…' }))
    await expect.element(page.getByRole('dialog', { name: 'Remove a place' })).toBeVisible()
    expect(sent).toEqual([])

    await userEvent.click(page.getByRole('button', { name: 'Remove Yverdon' }))
    await expect.poll(() => sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ intent: 'remove-destination', destination: 'Yverdon' })
  })

  test('offers it even with nothing in it, which is the one worth removing', async () => {
    await openYverdon()

    await expect.element(page.getByRole('button', { name: 'Remove place…' })).toBeVisible()
  })
})
