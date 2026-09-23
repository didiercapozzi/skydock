// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { hasDestination, removeDestination } from '../src/destinations'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'

/* A place taken off the board: what was filed there comes back to Fresh files, whole, and nothing
   is deleted (RULES, Places). */

const file = (over: Partial<ManifestFile> = {}): ManifestFile => ({
  path: '/work/original_files/2026-08-01/a.mp4',
  size: 100,
  mtime: 1_700_000_000,
  filename: 'a.mp4',
  id: 'id-a',
  ...over
})

const group = (over: Partial<ManifestGroup> = {}): ManifestGroup => ({
  id: 'g1',
  label: 'Jump 1',
  day: '2026-08-01',
  files: [file()],
  ...over
})

const manifestOf = (over: Partial<Manifest> = {}): Manifest => ({
  version: 1,
  createdAt: '2026-08-01T10:00:00.000Z',
  files: [],
  groups: [],
  destinations: [{ name: 'Yverdon', path: '/home/Yverdon', shareUrl: 'https://nas/share/1' }],
  ...over
})

describe('a place removed from the board', () => {
  it('is no longer one of the places', () => {
    const manifest = manifestOf()
    removeDestination(manifest, 'Yverdon')
    expect(manifest.destinations).toEqual([])
    expect(hasDestination(manifest, 'Yverdon')).toBe(false)
  })

  it('leaves the other places alone', () => {
    const manifest = manifestOf({
      destinations: [{ name: 'Yverdon' }, { name: 'Beromünster', path: '/home/Bero' }]
    })
    removeDestination(manifest, 'Yverdon')
    expect(manifest.destinations).toEqual([{ name: 'Beromünster', path: '/home/Bero' }])
  })

  it('puts the jumps filed there back in Fresh files, whole', () => {
    const filed = group({ destination: 'Yverdon', name: 'The good one' })
    const manifest = manifestOf({ groups: [filed] })
    const said = removeDestination(manifest, 'Yverdon')
    expect(said.jumps).toBe(1)
    expect(manifest.groups).toHaveLength(1)
    expect(manifest.groups[0].destination).toBeUndefined()
    expect(manifest.groups[0].name).toBe('The good one')
    expect(manifest.groups[0].files).toHaveLength(1)
  })

  it('puts the loose files filed there back in Fresh files, loose', () => {
    const manifest = manifestOf({ files: [file({ destination: 'Yverdon' })] })
    const said = removeDestination(manifest, 'Yverdon')
    expect(said.loose).toBe(1)
    expect(manifest.files[0].destination).toBeUndefined()
  })

  it('leaves what is filed somewhere else where it is', () => {
    const manifest = manifestOf({
      groups: [group({ id: 'g2', destination: 'Beromünster' })],
      files: [file({ id: 'id-b', destination: 'Beromünster' })]
    })
    removeDestination(manifest, 'Yverdon')
    expect(manifest.groups[0].destination).toBe('Beromünster')
    expect(manifest.files[0].destination).toBe('Beromünster')
  })

  it('forgets the copies made for it, which were written into its own folder', () => {
    const processed = {
      path: '/work/processed/Yverdon/a.mp4',
      size: 90,
      at: 1_700_000_100,
      source: { id: 'id-a', size: 100, mtime: 1_700_000_000, cropStart: null, cropEnd: null }
    }
    const manifest = manifestOf({
      groups: [group({ destination: 'Yverdon', processed: true, files: [file({ processed })] })],
      files: [file({ destination: 'Yverdon', processed })]
    })
    removeDestination(manifest, 'Yverdon')
    expect(manifest.groups[0].processed).toBeUndefined()
    expect(manifest.files[0].processed).toBeUndefined()
  })

  it('is a place while something is still filed under its name, even with no place of its own', () => {
    const manifest = manifestOf({
      destinations: [],
      groups: [group({ destination: 'Yverdon' })]
    })
    expect(hasDestination(manifest, 'Yverdon')).toBe(true)
    removeDestination(manifest, 'Yverdon')
    expect(hasDestination(manifest, 'Yverdon')).toBe(false)
  })
})
