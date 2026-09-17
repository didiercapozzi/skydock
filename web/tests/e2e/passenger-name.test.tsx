import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { PassengerCard, PassengerName } from '../../app/components/tandem-card'
import type { ManifestGroup } from '../../app/components/types'

/* Typing a first name and then moving to the last name used to record the passenger there and
   then — with no last name. The card replaced the inputs with the half name it had just invented,
   so the last name could not be typed at all, and a jump with half a name is one the folder rule
   reads as a place: it delivered the tandem flat, with every file named after the dropzone. One
   bug, and the two halves of it looked unrelated.

   The real browser is what decides here: this is about where focus goes and when blur fires, and
   a synthesised event would prove nothing. */

const group = (passenger?: { firstname: string; lastname: string }): ManifestGroup => ({
  id: 'g1',
  label: 'jump',
  day: '08.08.2026',
  destination: 'Tandems',
  passenger,
  files: []
})

const renderName = async (passenger?: { firstname: string; lastname: string }) => {
  const onSave = vi.fn()
  await render(createElement(PassengerName, { group: group(passenger), onSave }))
  return { onSave }
}

describe('naming a passenger', () => {
  test('moving from the first name to the last name saves nothing yet', async () => {
    const { onSave } = await renderName()

    await userEvent.fill(page.getByLabelText('First name'), 'Luc')
    await userEvent.click(page.getByLabelText('Last name'))

    expect(onSave).not.toHaveBeenCalled()
    /* and both halves are still there to type into */
    await expect.element(page.getByLabelText('First name')).toHaveValue('Luc')
    await expect.element(page.getByLabelText('Last name')).toBeVisible()
  })

  test('saves once, with both halves, when focus leaves the name altogether', async () => {
    const { onSave } = await renderName()

    await userEvent.fill(page.getByLabelText('First name'), 'Luc')
    await userEvent.fill(page.getByLabelText('Last name'), 'Favre')
    /* clicking away is what finishing looks like */
    await userEvent.click(document.body)

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('Luc', 'Favre')
  })

  test('Enter saves without waiting to be clicked away from', async () => {
    const { onSave } = await renderName()

    await userEvent.fill(page.getByLabelText('First name'), 'Luc')
    await userEvent.fill(page.getByLabelText('Last name'), 'Favre')
    await userEvent.keyboard('{Enter}')

    expect(onSave).toHaveBeenCalledWith('Luc', 'Favre')
  })

  test('a name already recorded comes back in its two halves', async () => {
    await renderName({ firstname: 'Chloé', lastname: 'Perret' })

    await expect.element(page.getByLabelText('First name')).toHaveValue('Chloé')
    await expect.element(page.getByLabelText('Last name')).toHaveValue('Perret')
  })
})

/* A name is read off a form or a face, so a card that offers only a pair of counts is asking
   somebody to remember what they saw on another screen. And a name read wrong has to be
   changeable: it is the folder the passenger gets. */
describe('the card a passenger is named on', () => {
  const withFiles = (passenger?: { firstname: string; lastname: string }): ManifestGroup => ({
    id: 'g1',
    label: 'jump',
    day: '08.08.2026',
    destination: 'Tandems',
    passenger,
    files: [
      { path: '/o/GX01.MP4', size: 1, mtime: 1, filename: 'GX01.MP4', id: 'v1' },
      { path: '/o/GX02.MP4', size: 1, mtime: 2, filename: 'GX02.MP4', id: 'v2' }
    ]
  })

  const renderCard = async (group: ManifestGroup, naming = false) => {
    const onRename = vi.fn()
    const onName = vi.fn()
    await render(
      createElement(PassengerCard, {
        group,
        who: group.passenger
          ? `${group.passenger.firstname} ${group.passenger.lastname}`.trim()
          : '',
        naming,
        dropTarget: {},
        onOpen: vi.fn(),
        onRename,
        onName
      })
    )
    return { onRename, onName }
  }

  test('shows frames off the clips, so there is something to name it from', async () => {
    await renderCard(withFiles())

    await expect.element(page.getByAltText(/frame from this tandem/i).first()).toBeVisible()
  })

  test('asks for the name while there is not one', async () => {
    await renderCard(withFiles())

    await expect.element(page.getByLabelText('First name')).toBeVisible()
  })

  /* the name is the folder, and a name can be read wrong */
  test('offers to change a name that is already set', async () => {
    const { onRename } = await renderCard(withFiles({ firstname: 'Luc', lastname: 'Favre' }))

    await expect.element(page.getByText('Luc Favre')).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'rename' }))

    expect(onRename).toHaveBeenCalled()
  })

  test('comes back with the name already in it when changing one', async () => {
    await renderCard(withFiles({ firstname: 'Luc', lastname: 'Favre' }), true)

    await expect.element(page.getByLabelText('First name')).toHaveValue('Luc')
    await expect.element(page.getByLabelText('Last name')).toHaveValue('Favre')
  })

  /* changing it after the files have been prepared means preparing them again, into a new folder */
  test('says what changing a prepared name costs', async () => {
    await renderCard({ ...withFiles({ firstname: 'Luc', lastname: 'Favre' }), processed: true }, true)

    await expect.element(page.getByText(/preparing it again/i)).toBeVisible()
  })

  test('says more when it has already been delivered', async () => {
    await renderCard(
      {
        ...withFiles({ firstname: 'Luc', lastname: 'Favre' }),
        processed: true,
        delivered: { at: 1 }
      },
      true
    )

    await expect.element(page.getByText(/stays on the storage under the old name/i)).toBeVisible()
  })
})
