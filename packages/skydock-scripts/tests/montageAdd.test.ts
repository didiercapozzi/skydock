// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { addToMontage, clipCandidates } from '../src/montageAdd'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'

const AT = Math.floor(new Date(2026, 7, 1, 11, 0, 0).getTime() / 1000)

const file = (id: string, offset: number, over: Partial<ManifestFile> = {}): ManifestFile => ({
  path: `/o/${id}.mp4`,
  size: 1,
  mtime: AT + offset,
  filename: `${id}.mp4`,
  id,
  ...over
})

const group = (id: string, files: ManifestFile[], over: Partial<ManifestGroup> = {}) => ({
  id,
  label: id,
  day: '01.08.2026',
  files,
  ...over
})

const luc = { firstname: 'Luc', lastname: 'Favre' }
const marie = { firstname: 'Marie', lastname: 'Roth' }

const board = () => {
  const here = file('here', 0)
  const near = file('near', 120)
  const far = file('far', 7200)
  const jumped = file('jumped', 300)
  const hers = file('hers', 600)
  const dropped = file('dropped', 900, { destination: 'Yverdon' })
  const gone = file('gone', 1200, { freed: true })
  const manifest: Manifest = {
    version: 1,
    createdAt: '2026-08-01',
    files: [here, near, far, jumped, hers, dropped, gone],
    groups: [
      group('luc', [here], { montageJump: true, passenger: luc, processed: true }),
      group('yverdon', [jumped], { destination: 'Yverdon' }),
      group('marie', [hers], { montageJump: true, passenger: marie, processed: true })
    ],
    destinations: [{ name: 'Yverdon' }]
  }
  return manifest
}

describe('the clips that could join a montage', () => {
  it('are every clip of the board that is not in it, the nearest in time to the jump first', () => {
    const ids = clipCandidates(board(), 'luc').map((c) => c.id)

    expect(ids).toEqual(['near', 'jumped', 'hers', 'dropped', 'gone', 'far'])
  })

  it('say where each one is', () => {
    const origins = Object.fromEntries(clipCandidates(board(), 'luc').map((c) => [c.id, c.origin]))

    expect(origins).toMatchObject({
      near: { kind: 'loose' },
      jumped: { kind: 'jump', name: 'Yverdon' },
      hers: { kind: 'montage', name: 'Marie Roth' },
      dropped: { kind: 'dropzone', name: 'Yverdon' }
    })
  })

  it('say which are on the storage only', () => {
    const freed = clipCandidates(board(), 'luc').filter((c) => c.freed)

    expect(freed.map((c) => c.id)).toEqual(['gone'])
  })

  it('leave out a clip the montage holds already, a copy of it too', () => {
    const manifest = board()
    const copy = { ...manifest.files[1]!, id: 'near~1', copyOf: 'near' }
    manifest.files.push(copy)
    manifest.groups[0]!.files.push(copy)

    expect(clipCandidates(manifest, 'luc').map((c) => c.id)).not.toContain('near')
    expect(clipCandidates(manifest, 'luc').map((c) => c.id)).not.toContain('near~1')
  })
})

describe('adding clips to a montage', () => {
  it('moves a loose clip in, so it leaves Fresh files', async () => {
    const manifest = board()

    const { keys } = await addToMontage(manifest, 'luc', new Set(['near']))

    expect(keys).toEqual(['near'])
    expect(manifest.groups[0]?.files.map((f) => f.id)).toEqual(['here', 'near'])
    expect(manifest.files.filter((f) => f.id === 'near')).toHaveLength(1)
  })

  it('copies in a clip that is somewhere else, which stays there as it is', async () => {
    const manifest = board()

    const { keys } = await addToMontage(manifest, 'luc', new Set(['jumped', 'hers']))

    expect(keys.sort()).toEqual(['hers~1', 'jumped~1'])
    expect(manifest.groups[1]?.files.map((f) => f.id)).toEqual(['jumped'])
    expect(manifest.groups[2]?.files.map((f) => f.id)).toEqual(['hers'])
    expect(manifest.groups[2]?.processed).toBe(true)
  })

  it('does not put the montage back to be processed', async () => {
    const manifest = board()

    await addToMontage(manifest, 'luc', new Set(['near', 'jumped']))

    expect(manifest.groups[0]?.processed).toBe(true)
  })

  it('leaves a clip that is on the storage only, and says so', async () => {
    const manifest = board()

    const { keys, freed } = await addToMontage(manifest, 'luc', new Set(['gone']))

    expect(keys).toEqual([])
    expect(freed).toBe(1)
  })

  it('adds nothing twice', async () => {
    const manifest = board()
    await addToMontage(manifest, 'luc', new Set(['jumped']))

    const again = await addToMontage(manifest, 'luc', new Set(['jumped']))

    expect(again.keys).toEqual([])
  })
})
