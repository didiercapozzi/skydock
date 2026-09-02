import { test, expect, seedMinimalManifest, mockStatusIdle } from './fixtures'

test.describe('smoke — SSR and navigation', () => {
  test('home renders dashboard with SSR loader', async ({ page, outputDir }) => {
    seedMinimalManifest(outputDir)
    await mockStatusIdle(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'SkyDock' })).toBeVisible()
  })

  test('home shows review section when manifest present', async ({ page, outputDir }) => {
    seedMinimalManifest(outputDir)
    await mockStatusIdle(page)
    await page.goto('/')
    await expect(page.getByText(/Review Proposed Jumps|No Manifest Found/)).toBeVisible()
  })

  test('jump detail 404 for unknown jump', async ({ page }) => {
    await mockStatusIdle(page)
    const response = await page.goto('/jump/2026-08-24/Unknown_Jump')
    expect(response?.status()).toBe(404)
  })

  test('api status polling', async ({ page, outputDir }) => {
    seedMinimalManifest(outputDir)
    await mockStatusIdle(page)
    await page.goto('/')
    const res = await page.request.get('/api/status')
    expect(res.ok()).toBeTruthy()
    const json = (await res.json()) as { ok: boolean }
    expect(json.ok).toBe(true)
  })
})
