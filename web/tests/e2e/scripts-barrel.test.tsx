import { describe, expect, test } from 'vitest'
import * as scripts from '@skydock/scripts'

describe('scripts barrel browser import', () => {
  test('barrel evaluates in browser without touching node builtins', () => {
    expect(typeof scripts.mergeJumps).toBe('function')
    expect(typeof scripts.moveFilesBetweenJumps).toBe('function')
    expect(typeof scripts.reclusterJumps).toBe('function')
  })

  test('mergeJumps merges two jumps with mtime-sorted union', () => {
    const left = {
      id: 'jump_1',
      label: 'Jump 1',
      confirmed: true,
      day: '01.01.2025',
      files: [{ path: '/a.mp4', size: 1, mtime: 100, filename: 'a.mp4' }]
    }
    const right = {
      id: 'jump_2',
      label: 'Jump 2',
      confirmed: false,
      day: '01.01.2025',
      files: [
        { path: '/a.mp4', size: 1, mtime: 100, filename: 'a.mp4' },
        { path: '/b.mp4', size: 1, mtime: 50, filename: 'b.mp4' }
      ]
    }
    const next = scripts.mergeJumps([left, right], 'jump_1', 'jump_2')
    expect(next.length).toBe(1)
    expect(next[0].id).toBe('jump_1')
    expect(next[0].files.map((f) => f.path)).toEqual(['/b.mp4', '/a.mp4'])
    expect(next[0].confirmed).toBe(false)
  })

  test('jump schema keeps passenger and publish fields', () => {
    const jump = {
      id: 'jump_1',
      label: 'Jump 1',
      confirmed: false,
      day: '01.01.2025',
      files: [],
      passenger: { firstname: 'John', lastname: 'Doe' },
      publish: { shareUrl: 'https://example.com/sharing/x' }
    }
    const parsed = scripts.manifestJumpSchema.parse(jump)
    expect(parsed.passenger).toEqual({
      firstname: 'John',
      lastname: 'Doe'
    })
    expect(parsed.publish).toEqual({ shareUrl: 'https://example.com/sharing/x' })
  })

  test('buildJumpBaseName uses lowercase passenger name and jump day', () => {
    const dayOf = (epoch: number) => {
      const d = new Date(epoch * 1000)
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${d.getFullYear()}${month}${day}`
    }
    const t = 1724493600
    expect(
      scripts.buildJumpBaseName(
        { firstname: 'John', lastname: 'Doe' },
        'Jump 1',
        t
      )
    ).toBe(`john_doe_${dayOf(t)}`)
    expect(scripts.buildJumpBaseName(undefined, 'Jump 1', t)).toBe(`jump_1_${dayOf(t)}`)
    expect(
      scripts.buildJumpBaseName({ firstname: 'Mary Ann', lastname: "O'Brien" }, 'J', t)
    ).toBe(`mary_ann_o_brien_${dayOf(t)}`)
    expect(scripts.buildJumpBaseName({ firstname: '', lastname: '' }, '', t)).toBe(
      `jump_${dayOf(t)}`
    )
  })

  test('hasCompletePassenger requires all three trimmed fields', () => {
    expect(
      scripts.hasCompletePassenger({ firstname: 'John', lastname: 'Doe' })
    ).toBe(true)
    expect(scripts.hasCompletePassenger(undefined)).toBe(false)
    expect(scripts.hasCompletePassenger(null)).toBe(false)
    expect(scripts.hasCompletePassenger({ firstname: 'John', lastname: '' })).toBe(false)
    expect(
      scripts.hasCompletePassenger({ firstname: '  ', lastname: 'Doe' })
    ).toBe(false)
  })

  test('mergeJumps drops publish and keeps left passenger', () => {
    const left = {
      id: 'jump_1',
      label: 'Jump 1',
      confirmed: false,
      day: '01.01.2025',
      passenger: { firstname: 'John', lastname: 'Doe' },
      publish: { shareUrl: 'https://example.com/sharing/old' },
      files: []
    }
    const right = {
      id: 'jump_2',
      label: 'Jump 2',
      confirmed: false,
      day: '01.01.2025',
      files: []
    }
    const next = scripts.mergeJumps([left, right], 'jump_1', 'jump_2')
    expect(next[0].publish).toBeUndefined()
    expect(next[0].passenger).toEqual({
      firstname: 'John',
      lastname: 'Doe'
    })
  })
})
