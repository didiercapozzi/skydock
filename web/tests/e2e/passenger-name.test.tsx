import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { PassengerCard, PassengerName } from '../../app/components/tandem-card'
import type { ManifestGroup } from '../../app/components/types'

/* A montage is named once, by one name — a person, an event — and that name is its folder. It is
   saved when the field is left or on Enter, and a single word is a whole name.

   The real browser is what decides here: this is about where focus goes and when blur fires, and
   a synthesised event would prove nothing. */

const group = (passenger?: { firstname: string; lastname: string }): ManifestGroup => ({
  id: 'g1',
  label: 'jump',
  day: '08.08.2026',
  montageJump: true,
  passenger,
  files: []
})

const renderName = async (passenger?: { firstname: string; lastname: string }) => {
  const onSave = vi.fn()
  await render(createElement(PassengerName, { group: group(passenger), onSave }))
  return { onSave }
}

describe('naming a montage', () => {
  test('saves the name when focus leaves it', async () => {
    const { onSave } = await renderName()

    await userEvent.fill(page.getByLabelText('Name'), 'Luc Favre')
    /* clicking away is what finishing looks like */
    await userEvent.click(document.body)

    expect(onSave).toHaveBeenCalledWith('Luc', 'Favre')
  })

  test('Enter saves without waiting to be clicked away from', async () => {
    const { onSave } = await renderName()

    await userEvent.fill(page.getByLabelText('Name'), 'Luc Favre')
    await userEvent.keyboard('{Enter}')

    expect(onSave).toHaveBeenCalledWith('Luc', 'Favre')
  })

  test('takes a single word as a whole name', async () => {
    const { onSave } = await renderName()

    await userEvent.fill(page.getByLabelText('Name'), 'Boogie')
    await userEvent.keyboard('{Enter}')

    expect(onSave).toHaveBeenCalledWith('Boogie', '')
  })

  test('a name already recorded comes back whole', async () => {
    await renderName({ firstname: 'Chloé', lastname: 'Perret' })

    await expect.element(page.getByLabelText('Name')).toHaveValue('Chloé Perret')
  })
})

/* A name is read off a form or a face, so a card that offers only a pair of counts is asking
   somebody to remember what they saw on another screen. And a name read wrong has to be
   changeable: it is the montage's folder. */
describe('the card a montage is named on', () => {
  const withFiles = (passenger?: { firstname: string; lastname: string }): ManifestGroup => ({
    id: 'g1',
    label: 'jump',
    day: '08.08.2026',
    montageJump: true,
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

    await expect.element(page.getByAltText(/frame from this montage/i).first()).toBeVisible()
  })

  test('asks for the name while there is not one', async () => {
    await renderCard(withFiles())

    await expect.element(page.getByLabelText('Name')).toBeVisible()
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

    await expect.element(page.getByLabelText('Name')).toHaveValue('Luc Favre')
  })

  /* changing it after the files have been processed means processing them again, into a new folder */
  test('says what changing a processed name costs', async () => {
    await renderCard({ ...withFiles({ firstname: 'Luc', lastname: 'Favre' }), processed: true }, true)

    await expect.element(page.getByText(/processing it again/i)).toBeVisible()
  })

  test('says more when it has already been uploaded', async () => {
    await renderCard(
      {
        ...withFiles({ firstname: 'Luc', lastname: 'Favre' }),
        processed: true,
        uploaded: { at: 1 }
      },
      true
    )

    await expect.element(page.getByText(/stays on the storage under the old name/i)).toBeVisible()
  })
})
