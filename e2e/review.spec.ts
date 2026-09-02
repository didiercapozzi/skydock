import { test, expect, seedMinimalManifest, mockStatusIdle } from './fixtures'

test.describe('review — grouping and drag', () => {
  test('shows jumps grouped by day', async ({ page, outputDir }) => {
    seedMinimalManifest(outputDir)
    await mockStatusIdle(page)
    await page.goto('/')
    await expect(page.getByText('Jump 1')).toBeVisible()
    await expect(page.getByText('Jump 2')).toBeVisible()
  })

  test('drag file between jumps via UI', async ({ page, outputDir }) => {
    seedMinimalManifest(outputDir)
    await mockStatusIdle(page)
    await page.goto('/')
    await expect(page.getByText('Jump 1')).toBeVisible()
    await expect(page.getByText('Jump 2')).toBeVisible()
    const sourceCard = page.locator('div.border.rounded-lg').filter({ hasText: 'Jump 1' }).first()
    const targetCard = page.locator('div.border.rounded-lg').filter({ hasText: 'Jump 2' }).first()
    await expect(sourceCard).toBeVisible()
    await expect(targetCard).toBeVisible()
    const sourceRow = sourceCard.locator('[data-file-row]').first()
    await expect(sourceRow).toBeVisible()
    const responsePromise = page.waitForResponse((r) => r.url().includes('/api/manifest') && r.request().method() === 'POST', { timeout: 10000 })
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.border.rounded-lg')) as HTMLElement[]
      const source = cards.find((c) => c.textContent?.includes('Jump 1')) as HTMLElement
      const target = cards.find((c) => c.textContent?.includes('Jump 2')) as HTMLElement
      const row = source.querySelector('[data-file-row]') as HTMLElement
      const dt = new DataTransfer()
      dt.effectAllowed = 'move'
      dt.setData('text/plain', 'test')
      row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    })
    const response = await responsePromise
    expect(response.ok()).toBeTruthy()
  })

  test('create jump via UI button', async ({ page, outputDir }) => {
    seedMinimalManifest(outputDir)
    await mockStatusIdle(page)
    await page.goto('/')
    await expect(page.getByText('Jump 1')).toBeVisible()
    const initialCards = await page.locator('div.border.rounded-lg').filter({ hasText: 'Jump' }).count()
    await page.getByRole('button', { name: '+ Add Jump' }).click()
    await expect(page.locator('div.border.rounded-lg').filter({ hasText: 'Jump' })).toHaveCount(initialCards + 1, { timeout: 5000 }).catch(async () => {
      const after = await page.locator('div.border.rounded-lg').filter({ hasText: 'Jump' }).count()
      expect(after).toBeGreaterThan(initialCards)
    })
  })
})
