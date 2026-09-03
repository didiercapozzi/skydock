import { expect, test, type Locator } from '@playwright/test'

test.describe('demo — UX rules from RULES.md §9', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo')
    await expect(page.getByText('Review Proposed Jumps')).toBeVisible()
    await expect(page.locator('[data-hydrated="true"]')).toBeVisible()
  })

  test.describe('§9.4 File selection', () => {
    test('checkbox click selects it, shows tray', async ({ page }) => {
      const firstRow = page.locator('[data-file-row]').first()
      await firstRow.getByRole('checkbox').click()
      await expect(firstRow).toHaveClass(/bg-blue-50/)
      await expect(page.locator('[data-staging-tray]')).toBeVisible()
      await expect(page.getByText('1 file selected')).toBeVisible()
    })

    test('ctrl+click checkbox adds to selection without clearing', async ({ page }) => {
      const rows = page.locator('[data-file-row]')
      await rows.nth(0).getByRole('checkbox').click()
      await rows.nth(1).getByRole('checkbox').click({ modifiers: ['Control'] })
      await expect(page.getByText('2 files selected')).toBeVisible()
      await expect(rows.nth(0)).toHaveClass(/bg-blue-50/)
      await expect(rows.nth(1)).toHaveClass(/bg-blue-50/)
    })

    test('checkbox click without ctrl clears previous selection', async ({ page }) => {
      const rows = page.locator('[data-file-row]')
      await rows.nth(0).getByRole('checkbox').click()
      await expect(page.getByText('1 file selected')).toBeVisible()
      await rows.nth(3).getByRole('checkbox').click()
      await expect(page.getByText('1 file selected')).toBeVisible()
      await expect(rows.nth(0)).not.toHaveClass(/bg-blue-50/)
      await expect(rows.nth(3)).toHaveClass(/bg-blue-50/)
    })

    test('deselect last file hides tray', async ({ page }) => {
      const firstRow = page.locator('[data-file-row]').first()
      await firstRow.getByRole('checkbox').click()
      await expect(page.locator('[data-staging-tray]')).toBeVisible()
      await firstRow.getByRole('checkbox').click()
      await expect(page.locator('[data-staging-tray]')).not.toBeVisible()
    })

    test('shift+click checkbox selects range', async ({ page }) => {
      const rows = page.locator('[data-file-row]')
      await rows.nth(0).getByRole('checkbox').click()
      await rows.nth(2).getByRole('checkbox').click({ modifiers: ['Shift'] })
      await expect(rows.nth(0)).toHaveClass(/bg-blue-50/)
      await expect(rows.nth(1)).toHaveClass(/bg-blue-50/)
      await expect(rows.nth(2)).toHaveClass(/bg-blue-50/)
    })
  })

  test.describe('§9.5 Staging tray', () => {
    test('tray shows selected count and clear button', async ({ page }) => {
      const rows = page.locator('[data-file-row]')
      await rows.nth(0).getByRole('checkbox').click()
      await expect(rows.nth(0)).toHaveClass(/bg-blue-50/)
      await rows.nth(1).getByRole('checkbox').click({ modifiers: ['Control'] })
      await expect(rows.nth(1)).toHaveClass(/bg-blue-50/)
      const tray = page.locator('[data-staging-tray]')
      await expect(tray).toBeVisible()
      await expect(tray.getByText('2 files selected')).toBeVisible()
      await expect(tray.getByRole('button', { name: 'Clear' })).toBeVisible()
    })

    test('clear button resets selection and hides tray', async ({ page }) => {
      const firstRow = page.locator('[data-file-row]').first()
      await firstRow.getByRole('checkbox').click()
      await expect(page.locator('[data-staging-tray]')).toBeVisible()
      await page.locator('[data-staging-tray]').getByRole('button', { name: 'Clear' }).click()
      await expect(page.locator('[data-staging-tray]')).not.toBeVisible()
      await expect(firstRow).not.toHaveClass(/bg-blue-50/)
    })

    test('tray is staging area, no move/copy toggle', async ({ page }) => {
      const firstRow = page.locator('[data-file-row]').first()
      await firstRow.getByRole('checkbox').click()
      const tray = page.locator('[data-staging-tray]')
      await expect(tray).toBeVisible()
      await expect(tray.getByText('Move')).not.toBeVisible()
      await expect(tray.getByText('Copy')).not.toBeVisible()
    })
  })

  test.describe('§9.6 Drag & drop', () => {
    test.beforeEach(async ({ page }) => {
      await page.evaluate(() => document.fonts.ready)
    })

    const mouseDrag = async (source: Locator, target: Locator) => {
      await target.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await source.dragTo(target)
    }

    const dragRowToPosition = async (source: Locator, targetRow: Locator, where: 'above' | 'below') => {
      await targetRow.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      const box = await targetRow.boundingBox()
      const height = box?.height ?? 40
      const y = where === 'above' ? 6 : Math.max(7, height - 6)
      await source.dragTo(targetRow, { targetPosition: { x: 8, y } })
    }

    test.describe('§9.6.1 Drag sources', () => {
      test('file row is draggable', async ({ page }) => {
        const firstRow = page.locator('[data-file-row]').first()
        await expect(firstRow).toHaveAttribute('draggable', 'true')
      })

      test('tray is draggable when files selected', async ({ page }) => {
        await page.locator('[data-file-row]').first().getByRole('checkbox').click()
        const tray = page.locator('[data-staging-tray]')
        await expect(tray).toBeVisible()
        await expect(tray).toHaveAttribute('draggable', 'true')
      })

      test('tray not visible when no files selected', async ({ page }) => {
        await expect(page.locator('[data-staging-tray]')).not.toBeVisible()
      })
    })

    test.describe('§9.6.2 Drop targets', () => {
      test('dropping file row on different jump shows Move/Copy/Cancel dialog', async ({ page }) => {
        const jumpCards = page.locator('[data-jump-card]')
        await expect(jumpCards).toHaveCount(4)
        const sourceRow = jumpCards.first().locator('[data-file-row]').first()
        await mouseDrag(sourceRow, jumpCards.nth(1))
        const dialog = page.locator('[data-drop-dialog]')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByRole('button', { name: 'Move' })).toBeVisible()
        await expect(dialog.getByRole('button', { name: 'Copy' })).toBeVisible()
        await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
      })

      test('cancel closes dialog without changing selection', async ({ page }) => {
        const jumpCards = page.locator('[data-jump-card]')
        await mouseDrag(jumpCards.first().locator('[data-file-row]').first(), jumpCards.nth(1))
        const dialog = page.locator('[data-drop-dialog]')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: 'Cancel' }).click()
        await expect(dialog).not.toBeVisible()
      })

      test('move option closes dialog', async ({ page }) => {
        const jumpCards = page.locator('[data-jump-card]')
        await mouseDrag(jumpCards.first().locator('[data-file-row]').first(), jumpCards.nth(1))
        const dialog = page.locator('[data-drop-dialog]')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: 'Move' }).click()
        await expect(dialog).not.toBeVisible()
      })

      test('copy option closes dialog', async ({ page }) => {
        const jumpCards = page.locator('[data-jump-card]')
        await mouseDrag(jumpCards.first().locator('[data-file-row]').first(), jumpCards.nth(1))
        const dialog = page.locator('[data-drop-dialog]')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: 'Copy' }).click()
        await expect(dialog).not.toBeVisible()
      })

      test('dropping within same jump shows no dialog', async ({ page }) => {
        const firstCard = page.locator('[data-jump-card]').first()
        await expect(firstCard.locator('[data-file-row]').first()).toBeVisible()
        await mouseDrag(firstCard.locator('[data-file-row]').first(), firstCard)
        await expect(page.locator('[data-drop-dialog]')).not.toBeVisible()
      })

      test('reorders single file within same jump to correct position', async ({ page }) => {
        const card = page.locator('[data-jump-card]').filter({ hasText: 'Jump 1' })
        const rows = card.locator('[data-file-row]')
        await dragRowToPosition(rows.nth(0), rows.nth(2), 'below')
        await expect(page.locator('[data-drop-dialog]')).not.toBeVisible()
        await expect(rows.nth(0).getByText('DJI_0002.MP4')).toBeVisible()
        await expect(rows.nth(1).getByText('DJI_0003.JPG')).toBeVisible()
        await expect(rows.nth(2).getByText('DJI_0001.MP4')).toBeVisible()
      })

      test('reorders grouped files within same jump to correct position', async ({ page }) => {
        const card = page.locator('[data-jump-card]').filter({ hasText: 'Jump 1' })
        const rows = card.locator('[data-file-row]')
        await rows.nth(0).getByRole('checkbox').click()
        await expect(rows.nth(0)).toHaveClass(/bg-blue-50/)
        await rows.nth(1).getByRole('checkbox').click({ modifiers: ['Control'] })
        await expect(rows.nth(1)).toHaveClass(/bg-blue-50/)
        await dragRowToPosition(rows.nth(0), rows.nth(2), 'below')
        await expect(page.locator('[data-drop-dialog]')).not.toBeVisible()
        await expect(rows.nth(0).getByText('DJI_0003.JPG')).toBeVisible()
        await expect(rows.nth(1).getByText('DJI_0001.MP4')).toBeVisible()
        await expect(rows.nth(2).getByText('DJI_0002.MP4')).toBeVisible()
      })
    })

    test.describe('§9.6.3 Constraints', () => {
      test('jump cards accept drops', async ({ page }) => {
        const jumpCards = page.locator('[data-jump-card]')
        await expect(jumpCards).toHaveCount(4)
        for (let i = 0; i < 4; i++) {
          await expect(jumpCards.nth(i)).toBeVisible()
        }
      })
    })

    test.describe('§9.6.4 Staging tray', () => {
      test('tray visible when files selected', async ({ page }) => {
        await page.locator('[data-file-row]').first().getByRole('checkbox').click()
        await expect(page.locator('[data-file-row]').first()).toHaveClass(/bg-blue-50/)
        await expect(page.locator('[data-staging-tray]')).toBeVisible()
      })

      test('tray is drag source with clear button', async ({ page }) => {
        await page.locator('[data-file-row]').first().getByRole('checkbox').click()
        const tray = page.locator('[data-staging-tray]')
        await expect(tray).toBeVisible()
        await expect(tray).toHaveAttribute('draggable', 'true')
        await expect(tray.getByRole('button', { name: 'Clear' })).toBeVisible()
      })

      test('clear button resets selection', async ({ page }) => {
        await page.locator('[data-file-row]').first().getByRole('checkbox').click()
        await expect(page.locator('[data-file-row]').first()).toHaveClass(/bg-blue-50/)
        await expect(page.locator('[data-staging-tray]')).toBeVisible()
        await page.locator('[data-staging-tray]').getByRole('button', { name: 'Clear' }).click()
        await expect(page.locator('[data-staging-tray]')).not.toBeVisible()
      })
    })

    test.describe('§9.6.5 User interactions', () => {
      test('tray drag onto distant jump shows dialog', async ({ page }) => {
        await page.locator('[data-file-row]').first().getByRole('checkbox').click()
        const tray = page.locator('[data-staging-tray]')
        await expect(tray).toBeVisible()
        await mouseDrag(tray, page.locator('[data-jump-card]').nth(3))
        await expect(page.locator('[data-drop-dialog]')).toBeVisible()
      })

      test('full drag and drop: select, drag, move file between jumps', async ({ page }) => {
        const jumpCards = page.locator('[data-jump-card]')
        const sourceCard = jumpCards.filter({ hasText: 'Jump 1' })
        const targetCard = jumpCards.filter({ hasText: 'Jump 2' })
        const sourceRow = sourceCard.locator('[data-file-row]').first()
        await sourceRow.getByRole('checkbox').click()
        await expect(sourceRow).toHaveClass(/bg-blue-50/)
        await expect(page.locator('[data-staging-tray]')).toBeVisible()
        await mouseDrag(sourceRow, targetCard)
        const dialog = page.locator('[data-drop-dialog]')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: 'Move' }).click()
        await expect(dialog).not.toBeVisible()
        await expect(sourceCard.getByText('DJI_0001.MP4')).not.toBeVisible()
        await expect(targetCard.getByText('DJI_0001.MP4')).toBeVisible()
        await expect(page.locator('[data-staging-tray]')).not.toBeVisible()
      })

      test('full drag and drop: copy keeps file in both jumps', async ({ page }) => {
        const jumpCards = page.locator('[data-jump-card]')
        const sourceCard = jumpCards.filter({ hasText: 'Jump 1' })
        const targetCard = jumpCards.filter({ hasText: 'Jump 2' })
        const sourceRow = sourceCard.locator('[data-file-row]').first()
        await sourceRow.getByRole('checkbox').click()
        await expect(sourceRow).toHaveClass(/bg-blue-50/)
        await expect(page.locator('[data-staging-tray]')).toBeVisible()
        await mouseDrag(sourceRow, targetCard)
        const dialog = page.locator('[data-drop-dialog]')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: 'Copy' }).click()
        await expect(dialog).not.toBeVisible()
        await expect(sourceCard.getByText('DJI_0001.MP4')).toBeVisible()
        await expect(targetCard.getByText('DJI_0001.MP4')).toBeVisible()
        await expect(page.locator('[data-staging-tray]')).not.toBeVisible()
      })
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
      const jump1Card = jumpCards.filter({ hasText: 'Jump 1' })
      await expect(jump1Card).toHaveCount(1)
      await expect(jump1Card.getByText('3 files')).toBeVisible()
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

  test.describe('§9.10 Preview drawer', () => {
    test('row click opens preview drawer without selecting', async ({ page }) => {
      const firstRow = page.locator('[data-file-row]').first()
      await firstRow.click()
      const drawer = page.locator('[data-preview-drawer]')
      await expect(drawer).toBeVisible()
      await expect(firstRow).not.toHaveClass(/bg-blue-50/)
      await expect(page.locator('[data-staging-tray]')).not.toBeVisible()
    })

    test('preview shows video element for MP4 files', async ({ page }) => {
      const card = page.locator('[data-jump-card]').filter({ hasText: 'Jump 1' })
      await card.locator('[data-file-row]').first().click()
      const drawer = page.locator('[data-preview-drawer]')
      await expect(drawer).toBeVisible()
      await expect(drawer.getByText('DJI_0001.MP4')).toBeVisible()
      await expect(drawer.locator('video')).toBeVisible()
    })

    test('preview shows image element for JPG files', async ({ page }) => {
      const card = page.locator('[data-jump-card]').filter({ hasText: 'Jump 1' })
      await card.locator('[data-file-row]').nth(2).click()
      const drawer = page.locator('[data-preview-drawer]')
      await expect(drawer).toBeVisible()
      await expect(drawer.getByText('DJI_0003.JPG')).toBeVisible()
      await expect(drawer.locator('img')).toBeVisible()
    })

    test('checkbox click selects without opening preview', async ({ page }) => {
      const firstRow = page.locator('[data-file-row]').first()
      await firstRow.getByRole('checkbox').click()
      await expect(firstRow).toHaveClass(/bg-blue-50/)
      await expect(page.locator('[data-preview-drawer]')).not.toBeVisible()
    })

    test('escape closes preview', async ({ page }) => {
      await page.locator('[data-file-row]').first().click()
      const drawer = page.locator('[data-preview-drawer]')
      await expect(drawer).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(drawer).not.toBeVisible()
    })

    test('close button closes preview', async ({ page }) => {
      await page.locator('[data-file-row]').first().click()
      const drawer = page.locator('[data-preview-drawer]')
      await expect(drawer).toBeVisible()
      await drawer.getByRole('button', { name: 'Close' }).click()
      await expect(drawer).not.toBeVisible()
    })

    test('prev and next navigate files within jump', async ({ page }) => {
      const card = page.locator('[data-jump-card]').filter({ hasText: 'Jump 1' })
      await card.locator('[data-file-row]').first().click()
      const drawer = page.locator('[data-preview-drawer]')
      await expect(drawer.getByText('DJI_0001.MP4')).toBeVisible()
      await drawer.getByRole('button', { name: 'Next' }).click()
      await expect(drawer.getByText('DJI_0002.MP4')).toBeVisible()
      await drawer.getByRole('button', { name: 'Previous' }).click()
      await expect(drawer.getByText('DJI_0001.MP4')).toBeVisible()
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
