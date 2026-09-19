// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { reclusterGroups, shiftGroupTo, startOfFiles } from '../src/clustering'
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

    expect(copyFiles(manifest, new Set(['plane']), 'anas')).toEqual({
      copied: 1,
      passedOver: 0,
      freed: 0
    })

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

    expect(copyFiles(manifest, new Set(['plane']), 'anas')).toEqual({
      copied: 0,
      passedOver: 1,
      freed: 0
    })
    expect(copyFiles(manifest, new Set(['luc']), 'lucs')).toEqual({
      copied: 0,
      passedOver: 1,
      freed: 0
    })
  })

  /* freed from this machine, a file has nothing here to copy — and is told apart from one already held */
  it('copies nothing of a file freed from this machine, and says it was freed', () => {
    const manifest = board()
    for (const f of [...manifest.files, ...manifest.groups.flatMap((g) => g.files)])
      if (f.id === 'plane') f.freed = true

    expect(copyFiles(manifest, new Set(['plane']), 'anas')).toEqual({
      copied: 0,
      passedOver: 0,
      freed: 1
    })
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
  it('cannot be put in the bin while a jump holds a copy of it', async () => {
    dir = createTmpDir('skydock-copies-')
    const manifest = board()
    copyFiles(manifest, new Set(['plane']), 'anas')
    moveFiles(manifest, new Set(['plane']), { destination: null })

    await expect(
      trashUnsorted(manifest, new Set(['plane']), dir, path.join(dir, 'bin'))
    ).rejects.toThrow(/copied into a jump/)
  })
})

/* A copy was shot for another jump and brought in, often from well before. It does not say when
   this jump began — so copying a clip in leaves the jump's start, its day and the time that gets
   corrected exactly as they were, and there is nothing to set right afterwards. */
describe('a jump holding a copy from earlier', () => {
  /* Luc's plane, from the day before, copied into Ana's jump */
  const withEarlierCopy = () => {
    const manifest = board()
    const dayBefore = AT - 86_400
    manifest.files[0]!.mtime = dayBefore
    manifest.groups[0]!.files[0]!.mtime = dayBefore
    copyFiles(manifest, new Set(['plane']), 'anas')
    return { manifest, anas: manifest.groups.find((g) => g.id === 'anas')! }
  }

  it('still starts when its own files start', () => {
    const { anas } = withEarlierCopy()
    expect(startOfFiles(anas.files)).toBe(AT + 7200)
  })

  it('lists the copy first all the same, since it was shot first', () => {
    const { anas } = withEarlierCopy()
    expect(anas.files.map((f) => f.id)).toEqual(['plane~1', 'ana', 'ana2'])
  })

  /* the day is worked out again when a jump is re-timed, and must not become the copy's */
  it('stays filed under its own day when it is re-timed', () => {
    const { manifest, anas } = withEarlierCopy()

    shiftGroupTo(manifest, anas, AT + 7200 + 600)

    expect(anas.day).toBe('01.08.2026')
  })

  it('is re-timed from its own first file, the copy moving along with the rest', () => {
    const { manifest, anas } = withEarlierCopy()
    const copyWas = anas.files[0]!.mtime

    shiftGroupTo(manifest, anas, AT + 7200 + 600)

    expect(anas.files.find((f) => f.id === 'ana')?.mtime).toBe(AT + 7200 + 600)
    expect(anas.files.find((f) => f.id === 'plane~1')?.mtime).toBe(copyWas + 600)
  })

  it('has only its copies to go by when it holds nothing else', () => {
    expect(
      startOfFiles([file('x~1', AT, { copyOf: 'x' }), file('y~1', AT + 5, { copyOf: 'y' })])
    ).toBe(AT)
  })
})

/* The same holds for any file brought in, not only a copy: one dragged from another jump, or added
   from the computer, was often shot well before the jump it lands in. The jump is its own unbroken
   run, and starts when that does. */
describe('a jump holding a file brought in from well before', () => {
  const broughtIn = () => {
    const manifest = board()
    /* Luc's exit clip, dragged into Ana's jump two hours later */
    moveFiles(manifest, new Set(['luc']), { targetGroupId: 'anas' })
    return { manifest, anas: manifest.groups.find((g) => g.id === 'anas')! }
  }

  it('still starts when its own run starts', () => {
    const { anas } = broughtIn()
    expect(anas.files.map((f) => f.id)).toEqual(['luc', 'ana', 'ana2'])
    expect(startOfFiles(anas.files)).toBe(AT + 7200)
  })

  it('is re-timed from its own run, and stays on its own day', () => {
    const { manifest, anas } = broughtIn()

    shiftGroupTo(manifest, anas, AT + 7200 + 300)

    expect(anas.files.find((f) => f.id === 'ana')?.mtime).toBe(AT + 7200 + 300)
    expect(anas.day).toBe('01.08.2026')
  })

  /* close enough to be the same filming, it is the jump: five minutes before is when it began */
  it('does start earlier when the file brought in is part of the same run', () => {
    const manifest = board()
    manifest.files.push(file('justBefore', AT + 7200 - 300))
    moveFiles(manifest, new Set(['justBefore']), { targetGroupId: 'anas' })

    expect(startOfFiles(manifest.groups.find((g) => g.id === 'anas')!.files)).toBe(AT + 7200 - 300)
  })
})
