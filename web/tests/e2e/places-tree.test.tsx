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
      knownCameras: [],
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
        knownCameras: [],
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

/* every camera this machine has met is listed: lit when plugged in, muted and said so when not, and
   one that waits for the files to be picked says how many are new (RULES, Cameras) */
describe('cameras in the rail', () => {
  const renderCameras = async (
    cameras: Array<Record<string, unknown>>,
    known: Array<Record<string, unknown>>
  ) => {
    const Tree = () =>
      createElement(PlacesTree, {
        destinations: [],
        groups: [],
        looseFiles: [],
        cameras: cameras as never,
        knownCameras: known as never,
        statusContext: () => ({}),
        montageOpen: () => false,
        delivered: 0,
        passengerProgress: () => null,
        onAddPlace: () => {},
        dropTarget: () => ({}),
        overTarget: null
      })
    const Stub = createRoutesStub([{ path: '*', Component: Tree }])
    await render(createElement(Stub, { initialEntries: ['/'] }))
  }

  test('lists one that is not plugged in, muted and saying it is not connected', async () => {
    await renderCameras(
      [],
      [{ key: 'name:HERO5 Black', name: 'HERO5 Black', auto: false, lastSeen: 1_785_000_000 }]
    )

    const row = page.getByRole('link', { name: /HERO5 Black/ })
    await expect.element(row).toBeVisible()
    await expect.element(row.getByText('not connected')).toBeVisible()
    await expect.element(row.getByText('HERO5 Black', { exact: true })).toHaveClass(/text-ink-3/)
    await expect.element(row).toHaveAttribute('href', '/camera/name:HERO5%20Black')
  })

  test('says how many files are new on one plugged in that is not copied by itself', async () => {
    await renderCameras(
      [
        {
          camera: 'HERO5 Black',
          mount: '/mnt/osmo/HERO5',
          over: 'drive',
          key: 'name:HERO5 Black',
          known: true,
          auto: false,
          fresh: 3
        }
      ],
      [{ key: 'name:HERO5 Black', name: 'HERO5 Black', auto: false, lastSeen: 1_785_000_000 }]
    )

    const row = page.getByRole('link', { name: /HERO5 Black/ })
    await expect.element(row.getByText('3 new')).toBeVisible()
    await expect.element(row.getByText('not connected')).not.toBeInTheDocument()
  })

  test('says nothing of new files for one copied by itself', async () => {
    await renderCameras(
      [
        {
          camera: 'OsmoNano',
          mount: '/mnt/osmo/OsmoNano',
          over: 'drive',
          key: 'name:OsmoNano',
          known: true,
          auto: true,
          fresh: 3
        }
      ],
      [{ key: 'name:OsmoNano', name: 'OsmoNano', auto: true, lastSeen: 1_785_000_000 }]
    )

    await expect.element(page.getByRole('link', { name: /OsmoNano/ })).toBeVisible()
    await expect.element(page.getByText('3 new')).not.toBeInTheDocument()
  })
})
