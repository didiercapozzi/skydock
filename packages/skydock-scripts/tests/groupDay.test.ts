// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { dayOfFiles, shiftFiles } from '../src/clustering'
import { isoDay } from '../src/utils'
import { mergeGroups } from '../src/workspace'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'

const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)

const file = (id: string, iso: string): ManifestFile => ({
  id,
  path: `/out/${id}.MP4`,
  filename: `${id}.MP4`,
  mtime: at(iso),
  size: 1000
})

const group = (id: string, files: ManifestFile[]): ManifestGroup => ({
  id,
  label: id,
  day: dayOfFiles(files),
  files
})

/* A jump is filed under the day it started, and that day is carried on the jump rather than worked
   out from its files every time. The difference only shows when a jump holds a file from another
   day — which is exactly what dragging one in does. */
describe('the day a jump is filed under', () => {
  /* the manifest writes days as the club reads them; the board keys them the other way round */
  it('translates a stored day into a sortable key, and refuses anything else', () => {
    expect(isoDay('12.09.2026')).toBe('2026-09-12')
    expect(isoDay('2026-09-12')).toBe('')
    expect(isoDay('')).toBe('')
  })

  it('stays put when a file from an earlier day is dropped into the jump', () => {
    const older = file('a1', '2026-08-30T15:00:00')
    const jump = group('gB', [file('b1', '2026-09-13T10:00:00'), file('b2', '2026-09-13T10:04:00')])

    /* what the server does on a drop: the file joins the jump, the jump's day is left alone */
    jump.files = [...jump.files, older].sort((a, b) => a.mtime - b.mtime)

    expect(isoDay(jump.day)).toBe('2026-09-13')
    expect(jump.files.map((f) => f.id)).toEqual(['a1', 'b1', 'b2'])
  })

  it('follows the jump when the whole jump is re-timed across midnight', () => {
    const files = [file('c1', '2026-09-13T23:30:00'), file('c2', '2026-09-13T23:40:00')]
    const jump = group('gC', files)
    expect(isoDay(jump.day)).toBe('2026-09-13')

    const manifest: Manifest = { version: 1, files, groups: [jump], destinations: [] } as Manifest
    /* an hour later is the next day */
    shiftFiles(manifest, new Set(['c1', 'c2']), 60 * 60)

    expect(isoDay(jump.day)).toBe('2026-09-14')
  })

  it('leaves other jumps alone when one is re-timed', () => {
    const moved = [file('d1', '2026-09-13T23:30:00')]
    const still = [file('e1', '2026-09-13T08:00:00')]
    const a = group('gD', moved)
    const b = group('gE', still)
    const manifest: Manifest = {
      version: 1,
      files: [...moved, ...still],
      groups: [a, b],
      destinations: []
    } as Manifest

    shiftFiles(manifest, new Set(['d1']), 60 * 60)

    expect(isoDay(a.day)).toBe('2026-09-14')
    expect(isoDay(b.day)).toBe('2026-09-13')
  })

  it('takes the earlier jump’s day when two jumps are merged', () => {
    const early = group('gF', [file('f1', '2026-09-12T09:00:00')])
    const late = group('gG', [file('g1', '2026-09-13T09:00:00')])

    const merged = mergeGroups([late, early], 'gG', 'gF')
    const result = merged.find((g) => g.id === 'gG')

    expect(isoDay(result?.day ?? '')).toBe('2026-09-12')
    expect(result?.files.map((f) => f.id)).toEqual(['f1', 'g1'])
  })
})
