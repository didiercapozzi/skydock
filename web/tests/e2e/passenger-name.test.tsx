import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { JumpPanel } from '../../app/components/inspector'
import { PassengerName } from '../../app/components/montage-card'
import type { ManifestGroup } from '../../app/components/types'


const group = (passenger?: { firstname: string; lastname: string }): ManifestGroup => ({
  id: 'g1',
  label: 'jump',
  day: '08.08.2026',
  montageJump: true,
  passenger,
  files: []
})

const renderName = async (
  passenger?: { firstname: string; lastname: string },
  passengers: { firstname: string; lastname: string }[] = []
) => {
  const onSave = vi.fn()
  await render(createElement(PassengerName, { group: group(passenger), passengers, onSave }))
  return { onSave }
}

describe('naming a montage', () => {
  test('saves nothing when focus leaves it', async () => {
    const { onSave } = await renderName({ firstname: 'Luc', lastname: 'Favre' })

    await userEvent.fill(page.getByLabelText('Name'), 'Luc Fa')
    await userEvent.click(document.body)

    expect(onSave).not.toHaveBeenCalled()
  })

  test('Save saves it', async () => {
    const { onSave } = await renderName()

    await userEvent.fill(page.getByLabelText('Name'), 'Luc Favre')
    await userEvent.click(page.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith('Luc', 'Favre')
  })

  test('Escape puts the name back as it was', async () => {
    const { onSave } = await renderName({ firstname: 'Luc', lastname: 'Favre' })

    await userEvent.fill(page.getByLabelText('Name'), 'Someone else')
    await userEvent.keyboard('{Escape}')

    await expect.element(page.getByLabelText('Name')).toHaveValue('Luc Favre')
    expect(onSave).not.toHaveBeenCalled()
  })

  test('an emptied name saves nothing', async () => {
    const { onSave } = await renderName({ firstname: 'Luc', lastname: 'Favre' })

    await userEvent.clear(page.getByLabelText('Name'))
    await userEvent.keyboard('{Enter}')

    expect(onSave).not.toHaveBeenCalled()
  })

  test('says so before a name joins another montage, and joins it as that one is spelled', async () => {
    const { onSave } = await renderName({ firstname: 'Luc', lastname: 'Favre' }, [
      { firstname: 'Chloé', lastname: 'Perret' }
    ])

    await userEvent.fill(page.getByLabelText('Name'), 'chloé perret')
    await expect.element(page.getByText('Joins Chloé Perret’s montage')).toBeVisible()
    await userEvent.keyboard('{Enter}')

    expect(onSave).toHaveBeenCalledWith('Chloé', 'Perret')
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

describe('the panel a montage is named on', () => {
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

  const renderPanel = async (group: ManifestGroup) => {
    const onName = vi.fn()
    const Stub = createRoutesStub([
      {
        path: '/',
        Component: () =>
          createElement(JumpPanel, {
            group,
            label: 'jump',
            locked: null,
            statusOf: () => 'local' as const,
            passengers: [],
            onNameMontage: () => {},
            onName,
            onSelectFiles: () => {}
          })
      }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))
    return { onName }
  }

  test('shows a strip of pictures of the clips, so there is something to name it from', async () => {
    await renderPanel(withFiles())

    await expect
      .poll(() => document.querySelectorAll('[data-picture] img').length)
      .toBeGreaterThan(0)
  })

  test('asks for the name while there is not one', async () => {
    await renderPanel(withFiles())

    await expect.element(page.getByLabelText('Name')).toHaveValue('')
  })

  test('keeps the name there to be changed, and saves the new one', async () => {
    const { onName } = await renderPanel(withFiles({ firstname: 'Luc', lastname: 'Favre' }))

    await expect.element(page.getByLabelText('Name')).toHaveValue('Luc Favre')
    await userEvent.fill(page.getByLabelText('Name'), 'Luc Favrod')
    await userEvent.keyboard('{Enter}')

    expect(onName).toHaveBeenCalledWith('Luc', 'Favrod')
  })

  test('says what changing a processed name costs', async () => {
    await renderPanel({ ...withFiles({ firstname: 'Luc', lastname: 'Favre' }), processed: true })

    await expect.element(page.getByText(/processing it again/i)).toBeVisible()
  })

  test('says more when it has already been uploaded', async () => {
    await renderPanel({
      ...withFiles({ firstname: 'Luc', lastname: 'Favre' }),
      processed: true,
      uploaded: { at: 1 }
    })

    await expect.element(page.getByText(/stays on the storage under the old name/i)).toBeVisible()
  })
})
