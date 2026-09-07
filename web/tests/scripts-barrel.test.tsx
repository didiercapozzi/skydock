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
      files: [{ path: '/a.mp4', size: 1, mtime: 100, filename: 'a.mp4' }]
    }
    const right = {
      id: 'jump_2',
      label: 'Jump 2',
      confirmed: false,
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
})
