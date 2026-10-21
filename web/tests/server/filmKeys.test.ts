// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEYS,
  keyLabel,
  keyNames,
  keyOwner,
  moveKey,
  parseKeys,
  refusedKey,
  withoutKey
} from '../../app/helpers/filmKeys'

describe('the keys of the film editor', () => {
  it('have D, Delete and Backspace on delete by default', () => {
    expect(DEFAULT_KEYS.delete).toEqual(['d', 'Delete', 'Backspace'])
    expect(DEFAULT_KEYS.cut).toEqual(['c'])
    expect(DEFAULT_KEYS.previous).toEqual(['q'])
    expect(DEFAULT_KEYS.next).toEqual(['e'])
  })

  it('are the defaults when nothing or garbage is stored', () => {
    expect(parseKeys('')).toEqual(DEFAULT_KEYS)
    expect(parseKeys('not json')).toEqual(DEFAULT_KEYS)
    expect(parseKeys('[1]')).toEqual(DEFAULT_KEYS)
  })

  it('keep what is stored per action and default the rest', () => {
    const got = parseKeys(JSON.stringify({ cut: ['x'], snap: 5, fade: ['Enter'], title: [] }))
    expect(got.cut).toEqual(['x'])
    expect(got.snap).toEqual(DEFAULT_KEYS.snap)
    expect(got.fade).toEqual([])
    expect(got.title).toEqual([])
    expect(got.delete).toEqual(DEFAULT_KEYS.delete)
  })

  it('keep the good keys of an action that holds a refused one', () => {
    const got = parseKeys(JSON.stringify({ cut: ['F1', 'x'], fade: ['Enter', 5] }))
    expect(got.cut).toEqual(['x'])
    expect(got.fade).toEqual([])
  })

  it('drop a key that two actions claim in storage', () => {
    const got = parseKeys(JSON.stringify({ cut: ['x'], fade: ['x', 'g'] }))
    expect(got.cut).toEqual(['x'])
    expect(got.fade).toEqual(['g'])
  })

  it('read a stored letter the way it is pressed', () => {
    expect(parseKeys(JSON.stringify({ cut: ['X'], fade: ['x'] }))).toMatchObject({
      cut: ['x'],
      fade: []
    })
  })

  it('say which action owns a key', () => {
    expect(keyOwner(DEFAULT_KEYS, 'd')).toBe('delete')
    expect(keyOwner(DEFAULT_KEYS, 'x')).toBeNull()
  })

  it('move a key to another action', () => {
    const got = moveKey(DEFAULT_KEYS, 'cut', 'd')
    expect(got.cut).toEqual(['c', 'd'])
    expect(got.delete).toEqual(['Delete', 'Backspace'])
  })

  it('do not repeat a key on an action', () => {
    expect(moveKey(DEFAULT_KEYS, 'cut', 'c').cut).toEqual(['c'])
  })

  it('lose a key that is cleared', () => {
    expect(withoutKey(DEFAULT_KEYS, 'delete', 'd').delete).toEqual(['Delete', 'Backspace'])
  })

  it('refuse the keys that are not for the tools, and say why', () => {
    for (const key of ['Enter', ' ', 'Escape', 'Tab', '?', 'ArrowLeft', 'Home', 'F5', 'Shift'])
      expect(refusedKey(key)).toEqual(expect.any(String))
    for (const key of ['x', '1', 'Delete', 'Backspace', '-']) expect(refusedKey(key)).toBeNull()
  })

  it('show a key the way it is read', () => {
    expect(keyLabel('d')).toBe('D')
    expect(keyLabel('Delete')).toBe('Delete')
  })

  it('read a letter of another alphabet as the Latin letter on the same keycap', () => {
    expect(keyNames({ key: 'с', code: 'KeyC' })).toEqual(['с', 'c'])
    expect(keyNames({ key: 'C', code: 'KeyC' })).toEqual(['c'])
    expect(keyNames({ key: 'a', code: 'KeyQ' })).toEqual(['a'])
    expect(keyNames({ key: ',', code: 'KeyM' })).toEqual([','])
  })

  it('default an action whose stored keys are too many', () => {
    const many = ['a', 'b', 'c', 'e', 'g', 'h', 'i', 'j', 'k']
    expect(parseKeys(JSON.stringify({ cut: many })).cut).toEqual(DEFAULT_KEYS.cut)
  })
})
