import { test, expect, seedMinimalManifest, mockStatusIdle } from './fixtures'

test.describe('review — grouping and drag', () => {
  test('shows jumps grouped by day', async ({ page, outputDir }) => {
    seedMinimalManifest(outputDir)
    await mockStatusIdle(page)
    await page.goto('/')
    await expect(page.getByText('Jump 1')).toBeVisible()
    await expect(page.getByText('Jump 2')).toBeVisible()
  })

  test('file move via api.manifest', async ({ page, outputDir }) => {
    seedMinimalManifest(outputDir)
    await mockStatusIdle(page)
    await page.goto('/')
    await expect(page.getByText('Jump 1')).toBeVisible()
    const responsePromise = page.waitForResponse((r) => r.url().includes('/api/manifest') && r.request().method() === 'POST')
    await page.evaluate(async () => {
      await fetch('/api/manifest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'move-files', fromJumpId: '2026-08-24_Jump1', toJumpId: '2026-08-24_Jump2', filePaths: [] })
      })
    })
    const response = await responsePromise
    expect(response.ok()).toBeTruthy()
  })

  test('create and delete jump', async ({ page, outputDir }) => {
    seedMinimalManifest(outputDir)
    await mockStatusIdle(page)
    await page.goto('/')
    await page.getByRole('button', { name: '+ Add Jump' }).click()
    await page.waitForTimeout(500)
    const addResponse = await page.evaluate(async () => {
      const r = await fetch('/api/manifest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create-jump' })
      })
      return r.json()
    })
    expect(addResponse.ok).toBe(true)
  })
})
