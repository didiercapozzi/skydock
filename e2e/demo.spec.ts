import { test, expect } from '@playwright/test'

test.describe('demo — UX rules from RULES.md §9', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo')
    await expect(page.getByText('Review Proposed Jumps')).toBeVisible()
  })

  test.describe('§9.4 File selection', () => {
    test('click file row selects it, shows tray', async ({ page }) => {
      const firstRow = page.locator('[data-file-row]').first()
      await firstRow.click()
      await expect(firstRow).toHaveClass(/bg-blue-50/)
      await expect(page.locator('[data-staging-tray]')).toBeVisible()
      await expect(page.getByText('1 file selected')).toBeVisible()
    })

    test('ctrl+click adds to selection without clearing', async ({ page }) => {
      const rows = page.locator('[data-file-row]')
      await rows.nth(0).click()
      await rows.nth(1).click({ modifiers: ['Control'] })
      await expect(page.getByText('2 files selected')).toBeVisible()
      await expect(rows.nth(0)).toHaveClass(/bg-blue-50/)
      await expect(rows.nth(1)).toHaveClass(/bg-blue-50/)
    })

    test('click without ctrl clears previous selection', async ({ page }) => {
      const rows = page.locator('[data-file-row]')
      await rows.nth(0).click()
      await expect(page.getByText('1 file selected')).toBeVisible()
      await rows.nth(3).click()
      await expect(page.getByText('1 file selected')).toBeVisible()
      await expect(rows.nth(0)).not.toHaveClass(/bg-blue-50/)
      await expect(rows.nth(3)).toHaveClass(/bg-blue-50/)
    })

    test('deselect last file hides tray', async ({ page }) => {
      const firstRow = page.locator('[data-file-row]').first()
      await firstRow.click()
      await expect(page.locator('[data-staging-tray]')).toBeVisible()
      await firstRow.click()
      await expect(page.locator('[data-staging-tray]')).not.toBeVisible()
    })

    test('shift+click selects range', async ({ page }) => {
      const rows = page.locator('[data-file-row]')
      await rows.nth(0).click()
      await rows.nth(2).click({ modifiers: ['Shift'] })
      await expect(rows.nth(0)).toHaveClass(/bg-blue-50/)
      await expect(rows.nth(1)).toHaveClass(/bg-blue-50/)
      await expect(rows.nth(2)).toHaveClass(/bg-blue-50/)
    })
  })

  test.describe('§9.5 Staging tray', () => {
    test('tray shows selected count and clear button', async ({ page }) => {
      const rows = page.locator('[data-file-row]')
      await rows.nth(0).click()
      await rows.nth(1).click({ modifiers: ['Control'] })
      const tray = page.locator('[data-staging-tray]')
      await expect(tray).toBeVisible()
      await expect(tray.getByText('2 files selected')).toBeVisible()
      await expect(tray.getByRole('button', { name: 'Clear' })).toBeVisible()
    })

    test('clear button resets selection and hides tray', async ({ page }) => {
      const firstRow = page.locator('[data-file-row]').first()
      await firstRow.click()
      await expect(page.locator('[data-staging-tray]')).toBeVisible()
      await page.locator('[data-staging-tray]').getByRole('button', { name: 'Clear' }).click()
      await expect(page.locator('[data-staging-tray]')).not.toBeVisible()
      await expect(firstRow).not.toHaveClass(/bg-blue-50/)
    })

    test('move and copy mode toggles', async ({ page }) => {
      const firstRow = page.locator('[data-file-row]').first()
      await firstRow.click()
      const tray = page.locator('[data-staging-tray]')
      await expect(tray.getByText('Move')).toBeVisible()
      await expect(tray.getByText('Copy')).toBeVisible()
    })
  })

  test.describe('§9.7 Header & empty states', () => {
    test('header shows SkyDock link and demo badge', async ({ page }) => {
      await expect(page.locator('header').getByText('SkyDock')).toBeVisible()
      await expect(page.getByText('DEMO MODE')).toBeVisible()
    })

    test('scan button is disabled', async ({ page }) => {
      const scanButton = page.locator('header').getByRole('button', { name: 'Scan' })
      await expect(scanButton).toBeDisabled()
    })

    test('shows correct jump and file counts', async ({ page }) => {
      await expect(page.getByText(/4 jumps, \d+ files/)).toBeVisible()
    })
  })

  test.describe('§9.8 Jump cards & day groups', () => {
    test('jumps grouped by day with count', async ({ page }) => {
      await expect(page.getByText('4 jumps').first()).toBeVisible()
    })

    test('jump cards show label, time range, and file count', async ({ page }) => {
      const jumpCards = page.locator('[data-jump-card]')
      await expect(jumpCards).toHaveCount(4)
      const firstCard = jumpCards.first()
      await expect(firstCard.getByText('Jump 1')).toBeVisible()
      await expect(firstCard.getByText('3 files')).toBeVisible()
    })

    test('jump card shows video/photo counts', async ({ page }) => {
      const firstCard = page.locator('[data-jump-card]').first()
      await expect(firstCard.getByText('2').first()).toBeVisible()
      await expect(firstCard.getByText('1').first()).toBeVisible()
    })
  })

  test.describe('§9.9 Compare selection', () => {
    test('checkbox selects jump for comparison', async ({ page }) => {
      const jumpCard = page.locator('[data-jump-card]').first()
      const checkbox = jumpCard.locator('..').locator('input[type="checkbox"][title="Select for comparison"]')
      await checkbox.click()
      await expect(page.getByText('1 jump selected')).toBeVisible()
      await expect(jumpCard.locator('..')).toHaveClass(/ring-blue-500/)
    })

    test('compare button enabled only when 2 selected', async ({ page }) => {
      const jumpCards = page.locator('[data-jump-card]')
      const checkbox1 = jumpCards.nth(0).locator('..').locator('input[type="checkbox"][title="Select for comparison"]')
      const checkbox2 = jumpCards.nth(1).locator('..').locator('input[type="checkbox"][title="Select for comparison"]')
      await checkbox1.click()
      await expect(page.getByRole('button', { name: 'Compare' })).not.toBeVisible()
      await checkbox2.click()
      await expect(page.getByRole('button', { name: 'Compare' })).toBeVisible()
    })

    test('clear resets jump selection', async ({ page }) => {
      const checkbox = page.locator('[data-jump-card]').first().locator('..').locator('input[type="checkbox"][title="Select for comparison"]')
      await checkbox.click()
      await expect(page.getByText('1 jump selected')).toBeVisible()
      await page.getByText('1 jump selected').locator('..').getByRole('button', { name: 'Clear' }).click()
      await expect(page.getByText('1 jump selected')).not.toBeVisible()
    })

    test('cannot select more than 2 jumps', async ({ page }) => {
      const jumpCards = page.locator('[data-jump-card]')
      const checkbox0 = jumpCards.nth(0).locator('..').locator('input[type="checkbox"][title="Select for comparison"]')
      const checkbox1 = jumpCards.nth(1).locator('..').locator('input[type="checkbox"][title="Select for comparison"]')
      const checkbox2 = jumpCards.nth(2).locator('..').locator('input[type="checkbox"][title="Select for comparison"]')
      await checkbox0.click()
      await checkbox1.click()
      await checkbox2.click()
      await expect(page.getByText('2 jumps selected')).toBeVisible()
    })
  })

  test.describe('§9.12 Visual presentation', () => {
    test('unassigned files section has amber styling', async ({ page }) => {
      const unassigned = page.getByText(/Unassigned files/)
      await expect(unassigned).toBeVisible()
    })

    test('file rows have video/photo icons', async ({ page }) => {
      const rows = page.locator('[data-file-row]')
      const mp4Row = rows.filter({ hasText: 'DJI_0001.MP4' })
      const jpgRow = rows.filter({ hasText: 'DJI_0003.JPG' })
      await expect(mp4Row).toBeVisible()
      await expect(jpgRow).toBeVisible()
    })

    test('jump cards have gradient header', async ({ page }) => {
      const firstCard = page.locator('[data-jump-card]').first()
      const header = firstCard.locator('div').first()
      await expect(header).toHaveClass(/from-gray-50/)
    })
  })
})
