import { describe, expect, test } from 'vitest'
import * as scripts from '@skydock/scripts'

describe('scripts barrel browser import', () => {
  test('barrel evaluates in browser without touching node builtins', () => {
    expect(typeof scripts.mergeGroups).toBe('function')
    expect(typeof scripts.moveFilesBetweenGroups).toBe('function')
    expect(typeof scripts.reclusterGroups).toBe('function')
  })

  test('mergeGroups merges two groups with mtime-sorted union', () => {
    const left = {
      id: 'group_1',
      label: 'Group 1',
      confirmed: true,
      day: '01.01.2025',
      files: [{ path: '/a.mp4', size: 1, mtime: 100, filename: 'a.mp4' }]
    }
    const right = {
      id: 'group_2',
      label: 'Group 2',
      confirmed: false,
      day: '01.01.2025',
      files: [
        { path: '/a.mp4', size: 1, mtime: 100, filename: 'a.mp4' },
        { path: '/b.mp4', size: 1, mtime: 50, filename: 'b.mp4' }
      ]
    }
    const next = scripts.mergeGroups([left, right], 'group_1', 'group_2')
    expect(next.length).toBe(1)
    expect(next[0].id).toBe('group_1')
    expect(next[0].files.map((f) => f.path)).toEqual(['/b.mp4', '/a.mp4'])
    expect(next[0].confirmed).toBe(false)
  })

  test('group schema keeps passenger and publish fields', () => {
    const group = {
      id: 'group_1',
      label: 'Group 1',
      confirmed: false,
      day: '01.01.2025',
      files: [],
      passenger: { firstname: 'John', lastname: 'Doe' },
      publish: { shareUrl: 'https://example.com/sharing/x' }
    }
    const parsed = scripts.manifestGroupSchema.parse(group)
    expect(parsed.passenger).toEqual({
      firstname: 'John',
      lastname: 'Doe'
    })
    expect(parsed.publish).toEqual({ shareUrl: 'https://example.com/sharing/x' })
  })

  test('buildGroupBaseName uses lowercase passenger name and group day', () => {
    const dayOf = (epoch: number) => {
      const d = new Date(epoch * 1000)
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${d.getFullYear()}${month}${day}`
    }
    const t = 1724493600
    expect(
      scripts.buildGroupBaseName(
        { firstname: 'John', lastname: 'Doe' },
        'Group 1',
        t
      )
    ).toBe(`john_doe_${dayOf(t)}`)
    expect(scripts.buildGroupBaseName(undefined, 'Group 1', t)).toBe(`group_1_${dayOf(t)}`)
    expect(
      scripts.buildGroupBaseName({ firstname: 'Mary Ann', lastname: "O'Brien" }, 'G', t)
    ).toBe(`mary_ann_o_brien_${dayOf(t)}`)
    expect(scripts.buildGroupBaseName({ firstname: '', lastname: '' }, '', t)).toBe(
      `group_${dayOf(t)}`
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

  test('mergeGroups drops publish and keeps left passenger', () => {
    const left = {
      id: 'group_1',
      label: 'Group 1',
      confirmed: false,
      day: '01.01.2025',
      passenger: { firstname: 'John', lastname: 'Doe' },
      publish: { shareUrl: 'https://example.com/sharing/old' },
      files: []
    }
    const right = {
      id: 'group_2',
      label: 'Group 2',
      confirmed: false,
      day: '01.01.2025',
      files: []
    }
    const next = scripts.mergeGroups([left, right], 'group_1', 'group_2')
    expect(next[0].publish).toBeUndefined()
    expect(next[0].passenger).toEqual({
      firstname: 'John',
      lastname: 'Doe'
    })
  })
})
