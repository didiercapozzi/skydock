import { createElement } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { DetailsToggle } from '../../app/components/board-header'
import { Shell } from '../../app/components/inspector'
import { speak } from '../../app/i18n'

/* The panel on the right can be put away and brought back, and is then out of sight and out of
   reach, not just pushed aside (RULES, The board). */

/* shut, it is out of the accessibility tree too, so it has to be asked for including what is hidden */
const panel = () => page.getByRole('complementary', { name: 'Details', includeHidden: true })

const shown = () =>
  render(
    createElement(
      'div',
      null,
      createElement(DetailsToggle),
      createElement(Shell, null, createElement('button', { type: 'button' }, 'Delete this jump'))
    )
  )

describe('the details panel', () => {
  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    speak('en')
  })

  test('is put away and brought back with the toolbar icon, and remembered', async () => {
    speak('en')
    await page.viewport(1400, 800)
    await shown()
    await expect.element(page.getByRole('button', { name: 'Hide details' })).toBeVisible()
    await page.getByRole('button', { name: 'Hide details' }).click()
    await expect.element(panel()).not.toBeVisible()
    expect(localStorage.getItem('skydock.details')).toBeNull()
    await page.getByRole('button', { name: 'Details' }).click()
    await expect.element(panel()).toBeVisible()
    expect(localStorage.getItem('skydock.details')).toBe('open')
  })

  test('is a drawer on a narrow window, shut until asked for, and not remembered', async () => {
    speak('en')
    await page.viewport(900, 800)
    await shown()
    await expect.element(panel()).not.toBeVisible()
    await page.getByRole('button', { name: 'Details' }).click()
    await expect.element(panel()).toBeVisible()
    expect(localStorage.getItem('skydock.details')).toBeNull()
  })
})
