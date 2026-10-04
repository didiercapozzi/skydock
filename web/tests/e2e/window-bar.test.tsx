import { createElement } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { WindowBar } from '../../app/components/window-bar'


const frame = () => ({
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn(() => Promise.resolve(false)),
  onMaximized: vi.fn(() => () => {})
})

afterEach(() => {
  delete window.skydock
})

describe('the window’s own title bar', () => {
  test('asks the window to do what its buttons say', async () => {
    const asked = frame()
    window.skydock = { pathOf: () => null, frame: asked }
    await render(createElement(WindowBar))

    await page.getByRole('button', { name: 'Minimise' }).click()
    await page.getByRole('button', { name: 'Maximise' }).click()
    await page.getByRole('button', { name: 'Close' }).click()

    expect(asked.minimize).toHaveBeenCalledExactlyOnceWith()
    expect(asked.toggleMaximize).toHaveBeenCalledExactlyOnceWith()
    expect(asked.close).toHaveBeenCalledExactlyOnceWith()
  })

  test('is not there in a browser tab', async () => {
    await render(createElement(WindowBar))

    await expect.element(page.getByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })
})
