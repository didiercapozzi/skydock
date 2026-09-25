import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { MontageCardActions } from '../../app/components/montage-card'
import type { ManifestGroup } from '../../app/components/types'

/* The editing project waits until every clip in it has its proxy, or has failed to get one: the
   editor opens on proxies, and a project made before them opens on the full clips (RULES, The
   editing project). The button says so rather than letting it be made too early. */

const processed: ManifestGroup = {
  id: 'g1',
  label: 'g1',
  day: '25.09.2026',
  passenger: { firstname: 'Luc', lastname: 'Favre' },
  processed: true,
  files: []
}

const actions = (proxiesWaiting: number, onMontage = vi.fn()) =>
  render(
    createElement(MontageCardActions, {
      group: processed,
      busy: null,
      blocked: { blocked: false, message: null },
      proxiesWaiting,
      named: true,
      onProcess: () => {},
      onMontage,
      onOpenMontage: () => {},
      onUpload: () => {}
    })
  )

describe('making the editing project', () => {
  test('waits while clips are still getting their proxy, and says how many', async () => {
    await actions(2)

    await expect.element(page.getByText('waiting for 2 proxies')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Make the project' })).toBeDisabled()
  })

  test('is offered once every clip has its proxy, or has failed to', async () => {
    const onMontage = vi.fn()
    await actions(0, onMontage)

    await expect.element(page.getByText(/waiting for/)).not.toBeInTheDocument()
    await userEvent.click(page.getByRole('button', { name: 'Make the project' }))
    expect(onMontage).toHaveBeenCalledTimes(1)
  })
})
