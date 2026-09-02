import { test, expect, seedMinimalManifest, mockStatusIdle } from './fixtures'

test.describe('repro — user interactions', () => {
  test('click file row opens preview', async ({ page, outputDir }) => {
    seedMinimalManifest(outputDir)
    await mockStatusIdle(page)
    page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.text()))
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))
    await page.goto('/')
    await expect(page.getByText('Review Proposed Jumps')).toBeVisible()
    const fileRow = page.locator('[data-file-row]').first()
    await expect(fileRow).toBeVisible()
    await fileRow.scrollIntoViewIfNeeded()
    const previewBtn = fileRow.getByTitle('Preview')
    await expect(previewBtn).toBeVisible()
    await previewBtn.click()
    await expect(page.getByRole('link', { name: 'Open' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: '← Prev' })).toBeVisible()
  })

  test('drag file between jumps works', async ({ page, outputDir }) => {
    seedMinimalManifest(outputDir)
    await mockStatusIdle(page)
    await page.goto('/')
    await expect(page.getByText('Review Proposed Jumps')).toBeVisible()
    const rows = page.locator('[data-file-row]')
    await expect(rows.first()).toBeVisible()
    const count = await rows.count()
    console.log('file rows count', count)
    expect(count).toBe(2)
    const sourceCard = page.locator('div.border.rounded-lg').filter({ hasText: 'Jump 1' }).first()
    const targetCard = page.locator('div.border.rounded-lg').filter({ hasText: 'Jump 2' }).first()
    await expect(sourceCard).toBeVisible()
    await expect(targetCard).toBeVisible()
    const sourceRow = sourceCard.locator('[data-file-row]').first()
    await expect(sourceRow).toBeVisible()
    await sourceRow.scrollIntoViewIfNeeded()
    await targetCard.scrollIntoViewIfNeeded()
    const responsePromise = page.waitForResponse((r) => r.url().includes('/api/manifest') && r.request().method() === 'POST', { timeout: 10000 })
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.border.rounded-lg')) as HTMLElement[]
      const sourceCard = cards.find((c) => c.textContent?.includes('Jump 1')) as HTMLElement
      const targetCard = cards.find((c) => c.textContent?.includes('Jump 2')) as HTMLElement
      if (!sourceCard || !targetCard) throw new Error('cards not found')
      const row = sourceCard.querySelector('[data-file-row]') as HTMLElement
      if (!row) throw new Error('row not found')
      const dt = new DataTransfer()
      dt.effectAllowed = 'move'
      dt.setData('text/plain', 'test')
      const dragStart = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })
      ;(row as any).dispatchEvent(dragStart)
      const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })
      targetCard.dispatchEvent(dragOver)
      const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
      targetCard.dispatchEvent(drop)
    })
    const response = await responsePromise
    expect(response.ok()).toBeTruthy()
  })

  test('click jump label edits name', async ({ page, outputDir }) => {
    seedMinimalManifest(outputDir)
    await mockStatusIdle(page)
    await page.goto('/')
    await expect(page.getByText('Review Proposed Jumps')).toBeVisible()
    const jumpCard = page.locator('div.border.rounded-lg').filter({ hasText: 'Jump 1' }).first()
    await expect(jumpCard).toBeVisible()
    await jumpCard.scrollIntoViewIfNeeded()
    const label = jumpCard.locator('span.font-semibold', { hasText: 'Jump 1' }).first()
    await expect(label).toBeVisible()
    await label.click()
    await expect(page.locator('input[value="Jump 1"]')).toBeVisible({ timeout: 5000 })
  })
})
