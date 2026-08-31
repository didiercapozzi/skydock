import { describe, it, expect } from 'vitest'
import { formatSequenceDate, formatSequenceTime } from '../app/lib/sequences'

describe('formatSequenceDate', () => {
  it('formats epoch to day month year', () => {
    const epoch = new Date('2026-08-22T12:00:00Z').getTime() / 1000
    const result = formatSequenceDate(epoch)
    expect(result).toMatch(/^\d+ \d+ \d+$/)
  })
})

describe('formatSequenceTime', () => {
  it('formats epoch to HH:MM', () => {
    const epoch = new Date('2026-08-22T12:30:00Z').getTime() / 1000
    const result = formatSequenceTime(epoch)
    expect(result).toMatch(/\d{2}:\d{2}/)
  })
})
