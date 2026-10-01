import { createElement } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'

/* A hand over everything that answers a press, whatever it is made of, and the plain arrow over what is
   switched off. */

const cursorOf = (name: string) =>
  getComputedStyle(page.getByRole('button', { name }).element()).cursor

describe('the pointer', () => {
  test('is a hand over what can be pressed and an arrow over what cannot', async () => {
    await render(
      createElement(
        'div',
        null,
        createElement('button', { type: 'button' }, 'Press'),
        createElement('button', { type: 'button', disabled: true }, 'Off'),
        createElement('div', { role: 'button', tabIndex: 0 }, 'Row'),
        createElement('a', { href: '#there' }, 'Link'),
        createElement('select', { 'aria-label': 'Choose' }, createElement('option', null, 'One')),
        createElement('input', { type: 'checkbox', 'aria-label': 'Tick' })
      )
    )

    expect(cursorOf('Press')).toBe('pointer')
    expect(cursorOf('Row')).toBe('pointer')
    expect(cursorOf('Off')).toBe('default')
    expect(getComputedStyle(page.getByRole('link', { name: 'Link' }).element()).cursor).toBe('pointer')
    expect(getComputedStyle(page.getByRole('combobox', { name: 'Choose' }).element()).cursor).toBe('pointer')
    expect(getComputedStyle(page.getByRole('checkbox', { name: 'Tick' }).element()).cursor).toBe('pointer')
  })
})
