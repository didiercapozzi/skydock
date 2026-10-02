import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { HistoryDialog } from '../../app/components/history-dialog'

/* The board's last changes, each said in words, and a way back to before any of them (RULES, Going
   back). */

const realFetch = globalThis.fetch

afterEach(() => {
  vi.stubGlobal('fetch', realFetch)
})

const NOTHING = {
  filed: [],
  montagesMade: [],
  montagesGone: [],
  jumpsMade: 0,
  jumpsGone: 0,
  jumpsRenamed: 0,
  trimmed: 0,
  retimed: 0,
  filesAdded: 0,
  filesGone: 0,
  processed: 0,
  uploaded: 0,
}

const shown = async () => {
  const at = Math.floor(Date.now() / 1000)
  vi.stubGlobal('fetch', async () =>
    Response.json({
      steps: [
        {
          step: 's2',
          at,
          change: { ...NOTHING, filed: [{ to: { kind: 'dz', name: 'Yverdon' }, files: 3 }] }
        },
        { step: 's1', at: at - 60, change: { ...NOTHING, montagesMade: ['Luc Favre'], trimmed: 2 } }
      ]
    })
  )
  const onGoBack = vi.fn()
  const Stub = createRoutesStub([
    { path: '/', Component: () => createElement(HistoryDialog, { onGoBack, onClose: () => {} }) }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
  return { onGoBack }
}

describe('the board’s history', () => {
  test('says what each change did, the latest first', async () => {
    await shown()
    const dialog = page.getByRole('dialog', { name: 'History' })

    await expect.element(dialog.getByText('Moved 3 files to Yverdon')).toBeVisible()
    await expect.element(dialog.getByText('Made Luc Favre’s montage')).toBeVisible()
    await expect.element(dialog.getByText('Trimmed, framed or turned 2 files')).toBeVisible()
  })

  test('goes back to before the change picked', async () => {
    const { onGoBack } = await shown()

    await userEvent.click(page.getByRole('button', { name: 'Undo from here' }).first())

    expect(onGoBack).toHaveBeenCalledWith('s2')
  })
})
