import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { MontageCardActions } from '../../app/components/montage-card'
import type { ManifestGroup } from '../../app/components/types'


const processed: ManifestGroup = {
  id: 'g1',
  label: 'g1',
  day: '25.09.2026',
  passenger: { firstname: 'Luc', lastname: 'Favre' },
  processed: true,
  files: []
}

const actions = (
  proxiesWaiting: number,
  onMontage = vi.fn(),
  more: Partial<Parameters<typeof MontageCardActions>[0]> = {}
) =>
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
      onUpload: () => {},
      ...more
    })
  )

const made = {
  edit: true,
  film: { size: 1, mtime: 1, seconds: 60, path: '/w/luc.mp4' },
  baseName: 'luc'
}

describe('a processed montage with no edit yet', () => {
  test('opens the film editor at once while clips are still getting their proxy', async () => {
    const onMontage = vi.fn()
    await actions(2, onMontage)

    await expect.element(page.getByText('waiting for 2 proxies')).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Edit the film' }))
    expect(onMontage).toHaveBeenCalledTimes(1)
  })

  test('says nothing of proxies once every clip has its own, or has failed to', async () => {
    const onMontage = vi.fn()
    await actions(0, onMontage)

    await expect.element(page.getByText(/waiting for/)).not.toBeInTheDocument()
    await userEvent.click(page.getByRole('button', { name: 'Edit the film' }))
    expect(onMontage).toHaveBeenCalledTimes(1)
  })

  test('opens the film editor while the board waits for another answer', async () => {
    const onMontage = vi.fn()
    await actions(0, onMontage, { busy: 'shift' })

    await userEvent.click(page.getByRole('button', { name: 'Edit the film' }))
    expect(onMontage).toHaveBeenCalledTimes(1)
  })
})

describe('a montage held by work under way', () => {
  test('greys what would change it while its film is rendered, saying why, and still opens the editor', async () => {
    const onOpenMontage = vi.fn()
    await actions(0, vi.fn(), {
      held: 'rendering',
      facts: made,
      onOpenMontage
    })

    const why = 'Its film is being rendered — wait for the render to finish, or cancel it'
    const again = page.getByRole('button', { name: 'Process again' })
    await expect.element(again).toBeDisabled()
    await expect.element(again).toHaveAttribute('title', why)
    await expect.element(page.getByRole('button', { name: /Upload/ })).toBeDisabled()
    await userEvent.click(page.getByRole('button', { name: 'Edit the film' }))
    expect(onOpenMontage).toHaveBeenCalledTimes(1)
  })

  test('says it is processing, with a Cancel, while a run holds it', async () => {
    const onCancelProcess = vi.fn()
    await actions(0, vi.fn(), {
      group: { ...processed, processed: false },
      held: 'processing',
      onCancelProcess
    })

    await expect.element(page.getByRole('button', { name: 'Processing…' })).toBeDisabled()
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }))
    expect(onCancelProcess).toHaveBeenCalledTimes(1)
  })

  test('is free while nothing holds it, whatever runs elsewhere', async () => {
    await actions(0, vi.fn(), { held: null, facts: made })

    await expect.element(page.getByRole('button', { name: 'Process again' })).toBeEnabled()
  })
})
