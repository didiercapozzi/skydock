import { describe, expect, test } from 'vitest'
import {
  buildGmailUrl,
  buildMailtoUrl,
  DEFAULT_EMAIL_BODY,
  DEFAULT_EMAIL_SUBJECT,
  renderEmailTemplate
} from '../app/components/utils'

describe('email template rendering', () => {
  test('replaces every placeholder including repeats', () => {
    expect(
      renderEmailTemplate('Hi {{firstname}} {{lastname}}, link: {{shareUrl}} ({{shareUrl}})', {
        firstname: 'John',
        lastname: 'Doe',
        shareUrl: 'https://nas/sharing/x'
      })
    ).toBe('Hi John Doe, link: https://nas/sharing/x (https://nas/sharing/x)')
  })

  test('leaves unknown placeholders untouched', () => {
    expect(renderEmailTemplate('Hello {{unknown}}', { firstname: 'John' })).toBe(
      'Hello {{unknown}}'
    )
  })

  test('defaults contain the key placeholders', () => {
    expect(DEFAULT_EMAIL_SUBJECT.length).toBeGreaterThan(0)
    expect(DEFAULT_EMAIL_BODY).toContain('{{firstname}}')
    expect(DEFAULT_EMAIL_BODY).toContain('{{shareUrl}}')
  })
})

describe('email compose links', () => {
  test('gmail link carries encoded recipient, subject and body', () => {
    const url = buildGmailUrl('john@example.com', 'Hello & welcome', 'Line one\nLine two')
    expect(url).toContain('mail.google.com/mail')
    expect(url).toContain(`to=${encodeURIComponent('john@example.com')}`)
    expect(url).toContain(`su=${encodeURIComponent('Hello & welcome')}`)
    expect(url).toContain(`body=${encodeURIComponent('Line one\nLine two')}`)
  })

  test('mailto link carries encoded subject and body', () => {
    const url = buildMailtoUrl('john@example.com', 'Hi there', 'See this')
    expect(url.startsWith('mailto:john@example.com?')).toBe(true)
    expect(url).toContain(`subject=${encodeURIComponent('Hi there')}`)
    expect(url).toContain(`body=${encodeURIComponent('See this')}`)
  })
})
