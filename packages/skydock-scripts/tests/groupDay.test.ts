import { describe, it, expect } from 'vitest'
import { dayOfFiles, shiftFiles } from '../src/clustering'
import { moveFiles } from '../src/moveFiles'
import { isoDay } from '../src/utils'
import { mergeGroups } from '../src/workspace'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'
import { manifestFile } from './fixtures'

const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)

const file = (id: string, iso: string) => manifestFile(id, at(iso))

const group = (id: string, files: ManifestFile[]): ManifestGroup => ({
  id,
  label: id,
  day: dayOfFiles(files),
  files
})

describe('the day a jump is filed under', () => {
  it('stays put when a file from an earlier day is dropped into the jump', () => {
    const older = file('a1', '2026-08-30T15:00:00')
    const files = [older, file('b1', '2026-09-13T10:00:00'), file('b2', '2026-09-13T10:04:00')]
    const jump = group('gB', files.slice(1))
    const manifest: Manifest = {
      version: 1,
      createdAt: '2026-09-13',
      files,
      groups: [jump],
      destinations: []
    }

    moveFiles(manifest, new Set(['a1']), { targetGroupId: 'gB' })

    expect(isoDay(jump.day)).toBe('2026-09-13')
    expect(manifest.groups[0].files.map((f) => f.id)).toEqual(['a1', 'b1', 'b2'])
  })

  it('follows the jump when the whole jump is re-timed across midnight', () => {
    const files = [file('c1', '2026-09-13T23:30:00'), file('c2', '2026-09-13T23:40:00')]
    const jump = group('gC', files)
    expect(isoDay(jump.day)).toBe('2026-09-13')

    const manifest: Manifest = {
      version: 1,
      createdAt: '2026-09-13',
      files,
      groups: [jump],
      destinations: []
    }
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
      createdAt: '2026-09-13',
      files: [...moved, ...still],
      groups: [a, b],
      destinations: []
    }

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
