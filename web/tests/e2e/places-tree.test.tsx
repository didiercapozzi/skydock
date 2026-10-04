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
      cameras: [],
      statusContext: () => ({}),
      montageOpen: () => false,
      delivered: 0,
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

/* a montage that is done — freed from this machine — is counted under Montages done, not among the montages */
describe('finished montages in the rail', () => {
  test('are listed under Montages done', async () => {
    const Tree = () =>
      createElement(PlacesTree, {
        destinations: [],
        groups: [],
        looseFiles: [],
        cameras: [],
        statusContext: () => ({}),
        montageOpen: () => false,
        delivered: 3,
        passengerProgress: () => null,
        onAddPlace: () => {},
        dropTarget: () => ({}),
        overTarget: null
      })
    const Stub = createRoutesStub([{ path: '*', Component: Tree }])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await expect.element(page.getByRole('link', { name: /Montages done/ })).toBeVisible()
  })
})
