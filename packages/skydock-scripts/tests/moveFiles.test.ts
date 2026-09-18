// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { moveFiles } from '../src/moveFiles'
import type { Manifest, ManifestFile } from '../src/types'

/* One way of moving files on the board, used by a drag and by a file dropped in again. */

const file = (id: string, extra: Partial<ManifestFile> = {}): ManifestFile => ({
  id,
  path: `/src/${id}.mp4`,
  filename: `${id}.mp4`,
  size: 1,
  mtime: 1_785_000_000,
  ...extra
})

describe('moving files', () => {
  /* a lone file is its registry entry, so what was set on it in the jump is carried across */
  it('keeps the crop a file had in its jump when it is taken out to stand alone', () => {
    const manifest: Manifest = {
      version: 1,
      createdAt: 'x',
      files: [file('a'), file('b')],
      groups: [
        {
          id: 'g1',
          label: 'jump',
          day: '01.08.2026',
          files: [file('a', { cropStart: 2, cropEnd: 5, rotation: 90 }), file('b')]
        }
      ]
    }
    moveFiles(manifest, new Set(['a']), { destination: null })
    expect(manifest.groups[0]?.files.map((f) => f.id)).toEqual(['b'])
    expect(manifest.files.find((f) => f.id === 'a')).toMatchObject({
      cropStart: 2,
      cropEnd: 5,
      rotation: 90
    })
  })

  it('puts a loose file into the jump it is dragged onto', () => {
    const manifest: Manifest = {
      version: 1,
      createdAt: 'x',
      files: [file('a'), file('loose')],
      groups: [{ id: 'g1', label: 'jump', day: '01.08.2026', files: [file('a')] }]
    }
    moveFiles(manifest, new Set(['loose']), { targetGroupId: 'g1' })
    expect(manifest.groups[0]?.files.map((f) => f.id).sort()).toEqual(['a', 'loose'])
  })

  it('keeps the crop a file had in its jump when it moves to another', () => {
    const manifest: Manifest = {
      version: 1,
      createdAt: 'x',
      files: [file('a'), file('b')],
      groups: [
        {
          id: 'g1',
          label: 'jump',
          day: '01.08.2026',
          files: [file('a', { cropStart: 2, cropEnd: 5 })]
        },
        { id: 'g2', label: 'jump', day: '01.08.2026', files: [file('b')] }
      ]
    }
    moveFiles(manifest, new Set(['a']), { targetGroupId: 'g2' })
    expect(
      manifest.groups.find((g) => g.id === 'g2')?.files.find((f) => f.id === 'a')
    ).toMatchObject({
      cropStart: 2,
      cropEnd: 5
    })
    /* the jump it left is empty, so it goes */
    expect(manifest.groups.map((g) => g.id)).toEqual(['g2'])
  })

  it('refuses a jump that is not there', () => {
    const manifest: Manifest = { version: 1, createdAt: 'x', files: [file('a')], groups: [] }
    expect(() => moveFiles(manifest, new Set(['a']), { targetGroupId: 'nope' })).toThrow(
      /not found/
    )
  })
})
