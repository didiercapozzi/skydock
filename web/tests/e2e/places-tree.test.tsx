import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { PlacesTree } from '../../app/components/places-tree'

/* The rail offers a new destination as one quiet line, whose field opens when it is wanted and
   closes once the name is added or let go (RULES, Places). */

const renderTree = async (onAddPlace: (name: string) => void) => {
  const Tree = () =>
    createElement(PlacesTree, {
      destinations: [{ name: 'Yverdon' }],
      groups: [],
      looseFiles: [],
      storage: null,
      cameras: [],
      statusContext: () => ({}),
      montageOpen: () => false,
      passengerProgress: () => null,
      onAddPlace,
      dropTarget: () => ({}),
      overTarget: null
    })
  const Stub = createRoutesStub([{ path: '*', Component: Tree }])
  await render(createElement(Stub, { initialEntries: ['/'] }))
}

const field = () => page.getByRole('textbox', { name: 'New destination' })

describe('adding a destination from the rail', () => {
  test('opens the field on asking, adds what is typed, and closes again', async () => {
    const onAddPlace = vi.fn()
    await renderTree(onAddPlace)

    await expect.element(field()).not.toBeInTheDocument()
    await userEvent.click(page.getByRole('button', { name: 'Add a destination…' }))
    await userEvent.fill(field(), 'Ecuvillens')
    await userEvent.click(page.getByRole('button', { name: 'Add', exact: true }))

    expect(onAddPlace).toHaveBeenCalledWith('Ecuvillens')
    await expect.element(field()).not.toBeInTheDocument()
  })

  test('is let go with Escape, adding nothing', async () => {
    const onAddPlace = vi.fn()
    await renderTree(onAddPlace)

    await userEvent.click(page.getByRole('button', { name: 'Add a destination…' }))
    await userEvent.type(field(), 'Bex')
    await userEvent.keyboard('{Escape}')

    await expect.element(field()).not.toBeInTheDocument()
    expect(onAddPlace).not.toHaveBeenCalled()
  })
})
