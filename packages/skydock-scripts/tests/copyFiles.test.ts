// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { reclusterGroups } from '../src/clustering'
import { loadManifest, saveManifest } from '../src/manifest'
import { copyFiles, moveFiles } from '../src/moveFiles'
import { getProxyPath } from '../src/proxy'
import { deleteTandem } from '../src/resetTandem'
import { trashUnsorted } from '../src/trashUnsorted'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'
import { createTmpDir } from './fixtures'

/* A clip two jumps share — the plane, the exit, the group photo — is copied into the second jump
   rather than moved: it stays where it was, and the other jump gets an entry of its own for the same
   original, with its own trim, time, processed copy and upload. Nothing on the disk is doubled. */

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const file = (id: string, mtime: number, over: Partial<ManifestFile> = {}): ManifestFile => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 10,
  mtime,
  ...over
})

const jump = (
  id: string,
  files: ManifestFile[],
  over: Partial<ManifestGroup> = {}
): ManifestGroup => ({
  id,
  label: id,
  day: '01.08.2026',
  files,
  ...over
})

/* Luc's jump holds the plane and his exit; Ana's, two hours later, holds hers */
const board = (): Manifest => {
  const plane = file('plane', AT, { cropStart: 2, cropEnd: 9 })
  const luc = file('luc', AT + 60)
  const ana = file('ana', AT + 7200)
  const ana2 = file('ana2', AT + 7260)
  return {
    version: 1,
    createdAt: 'x',
    files: [file('plane', AT), luc, ana, ana2],
    groups: [
      jump('lucs', [plane, luc], { processed: true }),
      jump('anas', [ana, ana2], { processed: true })
    ]
  }
}

const idsIn = (manifest: Manifest, groupId: string) =>
  manifest.groups.find((g) => g.id === groupId)?.files.map((f) => f.id)

let dir: string | null = null
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
  dir = null
})

describe('copying files into another jump', () => {
  it('leaves the file where it was and gives the other jump an entry of its own for it', () => {
    const manifest = board()

    expect(copyFiles(manifest, new Set(['plane']), 'anas')).toEqual({ copied: 1, passedOver: 0 })

    expect(idsIn(manifest, 'lucs')).toEqual(['plane', 'luc'])
    expect(idsIn(manifest, 'anas')).toEqual(['plane~1', 'ana', 'ana2'])
    const copy = manifest.files.find((f) => f.id === 'plane~1')
    expect(copy).toMatchObject({ copyOf: 'plane', path: '/o/plane.MP4' })
  })

  /* the likeliest thing to want, and changed there afterwards without touching the other jump */
  it('arrives trimmed as it is where it was copied from', () => {
    const manifest = board()
    copyFiles(manifest, new Set(['plane']), 'anas')

    const copy = manifest.groups.find((g) => g.id === 'anas')?.files.find((f) => f.id === 'plane~1')
    expect(copy).toMatchObject({ cropStart: 2, cropEnd: 9 })
  })

  it('brings nothing made from the file with it, and the jump it lands in is to be processed again', () => {
    const manifest = board()
    manifest.files[0]!.processed = {
      path: '/p/x.mp4',
      size: 1,
      at: 1,
      source: { size: 10, mtime: AT }
    }

    copyFiles(manifest, new Set(['plane']), 'anas')

    expect(manifest.files.find((f) => f.id === 'plane~1')?.processed).toBeUndefined()
    expect(manifest.groups.find((g) => g.id === 'anas')?.processed).toBeFalsy()
    /* and the jump it was copied from is untouched */
    expect(manifest.groups.find((g) => g.id === 'lucs')?.processed).toBe(true)
  })

  it('passes over a file the jump already holds, as itself or as a copy', () => {
    const manifest = board()
    copyFiles(manifest, new Set(['plane']), 'anas')

    expect(copyFiles(manifest, new Set(['plane']), 'anas')).toEqual({ copied: 0, passedOver: 1 })
    expect(copyFiles(manifest, new Set(['luc']), 'lucs')).toEqual({ copied: 0, passedOver: 1 })
  })

  it('copies a copy as a copy of the original, into a third jump', () => {
    const manifest = board()
    manifest.files.push(file('third', AT + 20000), file('third2', AT + 20060))
    manifest.groups.push(jump('thirds', [file('third', AT + 20000), file('third2', AT + 20060)]))
    copyFiles(manifest, new Set(['plane']), 'anas')

    copyFiles(manifest, new Set(['plane~1']), 'thirds')

    expect(manifest.files.find((f) => f.id === 'plane~2')).toMatchObject({ copyOf: 'plane' })
  })

  it('keeps its own time once in the other jump, so re-timing one leaves the other alone', () => {
    const manifest = board()
    copyFiles(manifest, new Set(['plane']), 'anas')
    const copy = manifest.files.find((f) => f.id === 'plane~1')!

    copy.mtime = AT + 7100

    expect(manifest.files.find((f) => f.id === 'plane')?.mtime).toBe(AT)
  })
})

describe('a copy, kept through what happens to a board', () => {
  it('comes back from saving and loading as the copy it was', () => {
    dir = createTmpDir('skydock-copies-')
    const manifestPath = path.join(dir, 'manifest.json')
    const manifest = board()
    copyFiles(manifest, new Set(['plane']), 'anas')

    saveManifest(manifestPath, manifest)
    const loaded = loadManifest(manifestPath)!

    expect(idsIn(loaded, 'anas')).toEqual(['plane~1', 'ana', 'ana2'])
    expect(loaded.groups.find((g) => g.id === 'anas')?.files[0]).toMatchObject({
      copyOf: 'plane',
      cropStart: 2
    })
  })

  /* at the same moment as its original, the gap rule would pull it back beside it */
  it('stays in its jump through a scan, and is never put beside its original', () => {
    const manifest = board()
    copyFiles(manifest, new Set(['plane']), 'anas')

    reclusterGroups(manifest)

    expect(idsIn(manifest, 'lucs')).toEqual(['plane', 'luc'])
    expect(idsIn(manifest, 'anas')).toEqual(['plane~1', 'ana', 'ana2'])
  })

  it('shares its original’s proxy rather than having one made for it', () => {
    const manifest = board()
    copyFiles(manifest, new Set(['plane']), 'anas')
    const copy = manifest.files.find((f) => f.id === 'plane~1')!

    expect(getProxyPath(copy, '/out')).toBe(getProxyPath(manifest.files[0]!, '/out'))
  })
})

describe('a copy that leaves its jump', () => {
  /* the original is wherever it already is: a second loose entry for it would be the file twice */
  it('ends, rather than going loose beside its original', () => {
    const manifest = board()
    copyFiles(manifest, new Set(['plane']), 'anas')

    moveFiles(manifest, new Set(['plane~1']), { destination: null })

    expect(manifest.files.some((f) => f.id === 'plane~1')).toBe(false)
    expect(idsIn(manifest, 'anas')).toEqual(['ana', 'ana2'])
    expect(idsIn(manifest, 'lucs')).toEqual(['plane', 'luc'])
  })

  it('can be moved on into another jump, still a copy', () => {
    const manifest = board()
    copyFiles(manifest, new Set(['luc']), 'anas')

    moveFiles(manifest, new Set(['luc~1']), { newGroup: true })

    expect(manifest.files.find((f) => f.id === 'luc~1')).toMatchObject({ copyOf: 'luc' })
  })

  it('goes with its tandem when the tandem is deleted, leaving the original where it is', () => {
    dir = createTmpDir('skydock-copies-')
    const manifest = board()
    const anas = manifest.groups.find((g) => g.id === 'anas')!
    anas.destination = 'Tandems'
    anas.passenger = { firstname: 'Ana', lastname: 'Roth' }
    copyFiles(manifest, new Set(['plane']), 'anas')

    deleteTandem(manifest, dir, 'anas')

    expect(manifest.files.some((f) => f.id === 'plane~1')).toBe(false)
    expect(idsIn(manifest, 'lucs')).toEqual(['plane', 'luc'])
  })
})

describe('the original of a copy', () => {
  /* the bin takes the file off the disk, and the copy is of that very file */
  it('cannot be put in the bin while a jump holds a copy of it', () => {
    dir = createTmpDir('skydock-copies-')
    const manifest = board()
    copyFiles(manifest, new Set(['plane']), 'anas')
    moveFiles(manifest, new Set(['plane']), { destination: null })

    expect(() => trashUnsorted(manifest, new Set(['plane']), dir!)).toThrow(/copied into a jump/)
  })
})
