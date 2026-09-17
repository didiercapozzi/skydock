import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { PassengerName } from '../../app/components/tandem-card'
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
