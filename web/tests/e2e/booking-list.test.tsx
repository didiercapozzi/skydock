import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { BookingListDialog } from '../../app/components/booking-list-dialog'

/* The day's bookings brought in from a booking export or pasted from anywhere, and shown back as
   they were read (RULES, The booking list). Nothing here reaches a real server: the list is the
   work folder's, and a test has no business writing into one. */

const realFetch = globalThis.fetch

afterEach(() => {
  vi.stubGlobal('fetch', realFetch)
})

const renderDialog = async () => {
  const asked: unknown[] = []
  vi.stubGlobal('fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method?.toUpperCase() !== 'POST') return Response.json({ list: [] })
    asked.push(JSON.parse(String(init.body)))
    return Response.json({ list: [{ name: 'Luc Favre', time: '10:30', email: 'luc@example.com' }] })
  })
  const Stub = createRoutesStub([
    { path: '/', Component: () => createElement(BookingListDialog, { onClose: () => {} }) }
  ])
  await render(createElement(Stub, { initialEntries: ['/'] }))
  return { asked }
}

describe('bringing in the booking list', () => {
  test('offers nothing to bring in while nothing is pasted', async () => {
    await renderDialog()

    await expect
      .element(page.getByRole('button', { name: 'Bring in the list' }))
      .toBeDisabled()
  })

  test('sends what was pasted, and shows the list as it was read', async () => {
    const { asked } = await renderDialog()
    const dialog = page.getByRole('dialog', { name: 'Booking list' })

    await userEvent.fill(dialog.getByRole('textbox', { name: 'The list' }), 'Heure;Nom\n10:30;Luc Favre')
    await userEvent.click(dialog.getByRole('button', { name: /the list$/ }))

    await expect.element(dialog.getByText('1 booking on the list')).toBeVisible()
    await expect.element(dialog.getByText('luc@example.com')).toBeVisible()
    expect(asked).toMatchObject([{ csv: 'Heure;Nom\n10:30;Luc Favre' }])
  })
})
