// @vitest-environment node
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getGroupProcessedDir } from '../src/process'
import { copyIntoMontage, moveFiles } from '../src/moveFiles'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'
import { stemOf } from '../src/sending'
import { montageCalled, passengerFrom, passengerName } from '../src/workspace'

/* A montage is named once, by one name, and made from a jump or from picked files. What is in Fresh
   files moves into it; what already belongs somewhere — a dropzone, another montage — is copied in,
   adjustments and all, and stays where it was. A montage belongs to no destination. */

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)

const file = (id: string, mtime: number, over: Partial<ManifestFile> = {}): ManifestFile => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 10,
  mtime,
  ...over
})

const jump = (id: string, files: ManifestFile[], over: Partial<ManifestGroup> = {}) => ({
  id,
  label: id,
  day: '01.08.2026',
  files,
  ...over
})

/* Yverdon holds a jump already uploaded, its first clip trimmed, cropped and turned */
const yverdon = (): Manifest => {
  const adjusted = { cropStart: 8, cropEnd: 52, rotation: 90 as const }
  const uploaded = {
    remotePath: '/nas/Yverdon/y.mp4',
    md5: 'x',
    size: 1,
    localPath: '/l',
    at: 1
  }
  return {
    version: 1,
    createdAt: 'x',
    files: [
      file('jump1', AT, { ...adjusted, uploaded }),
      file('jump2', AT + 60, { uploaded }),
      file('loose', AT + 9000)
    ],
    groups: [
      jump(
        'yv',
        [file('jump1', AT, { ...adjusted, uploaded }), file('jump2', AT + 60, { uploaded })],
        { destination: 'Yverdon', processed: true }
      )
    ],
    destinations: [
      { name: 'Yverdon', path: '/nas/Yverdon' },
      { name: 'Passengers', path: '/nas/Passengers' }
    ]
  }
}

const montageOf = (manifest: Manifest, name: string) =>
  manifest.groups.filter((g) => g.montageJump && passengerName(g.passenger) === name)

describe('a montage’s name', () => {
  it('is one name, kept in the record’s two parts and given back exactly', () => {
    expect(passengerFrom('Luc Favre')).toEqual({ firstname: 'Luc', lastname: 'Favre' })
    expect(passengerFrom('  Boogie  ')).toEqual({ firstname: 'Boogie', lastname: '' })
    expect(passengerName(passengerFrom('Jean-Marc de la Tour'))).toBe('Jean-Marc de la Tour')
  })

  it('joins a montage that already has it, however it is capitalised, keeping its spelling', () => {
    const groups = [jump('g', [], { montageJump: true, passenger: passengerFrom('Chloé Perret') })]
    expect(passengerName(montageCalled(groups, 'chloé perret'))).toBe('Chloé Perret')
    expect(passengerName(montageCalled(groups, 'Luc Favre'))).toBe('Luc Favre')
  })
})

describe('making a montage of files in Fresh files', () => {
  it('moves them into a new jump filed under the montage’s name', () => {
    const manifest = yverdon()
    moveFiles(manifest, new Set(['loose']), {
      newGroup: true,
      montage: true,
      passenger: passengerFrom('Solo')
    })
    const [made] = montageOf(manifest, 'Solo')
    expect(made?.files.map((f) => f.id)).toEqual(['loose'])
    expect(made?.name).toBeUndefined()
  })
})

describe('making a montage of files a dropzone holds', () => {
  it('copies them in, adjusted as they were, and leaves the dropzone’s jump as it is', () => {
    const manifest = yverdon()
    const { copied } = copyIntoMontage(
      manifest,
      new Set(['jump1', 'jump2']),
      passengerFrom('Boogie 2026')
    )

    expect(copied).toBe(2)
    const [made] = montageOf(manifest, 'Boogie 2026')
    const copy = made?.files.find((f) => f.copyOf === 'jump1')
    expect(copy).toMatchObject({ cropStart: 8, cropEnd: 52, rotation: 90 })
    expect(copy?.uploaded).toBeUndefined()
    const yv = manifest.groups.find((g) => g.id === 'yv')!
    expect(yv.files.map((f) => f.id)).toEqual(['jump1', 'jump2'])
    expect(yv.files[0]?.uploaded).toBeDefined()
  })

  it('lets the copy change on its own: trimming the dropzone’s file again leaves it alone', () => {
    const manifest = yverdon()
    copyIntoMontage(manifest, new Set(['jump1']), passengerFrom('Boogie 2026'))
    manifest.groups.find((g) => g.id === 'yv')!.files[0]!.cropStart = 15

    const [made] = montageOf(manifest, 'Boogie 2026')
    expect(made?.files[0]?.cropStart).toBe(8)
  })

  it('makes a second jump given the same name a jump of that montage, with its own times', () => {
    const manifest = yverdon()
    manifest.groups.push(jump('yv2', [file('later', AT + 7200)], { destination: 'Yverdon' }))
    manifest.files.push(file('later', AT + 7200))
    const boogie = passengerFrom('Boogie 2026')
    copyIntoMontage(manifest, new Set(['jump1']), boogie)
    copyIntoMontage(manifest, new Set(['later']), montageCalled(manifest.groups, 'boogie 2026'))

    const jumps = montageOf(manifest, 'Boogie 2026')
    expect(jumps).toHaveLength(2)
    expect(jumps.map((g) => g.files[0]?.mtime)).toEqual([AT, AT + 7200])
  })

  it('passes over a file freed from this machine, having no file here to copy', () => {
    const manifest = yverdon()
    manifest.groups[0]!.files[1]!.freed = true
    const { copied, freed } = copyIntoMontage(
      manifest,
      new Set(['jump1', 'jump2']),
      passengerFrom('Boogie 2026')
    )
    expect(copied).toBe(1)
    expect(freed).toBe(1)
  })
})

describe('where a montage is worked on', () => {
  it('is a folder of its own, under the montages folder', () => {
    const montage = jump('m', [file('jump1', AT)], {
      montageJump: true,
      passenger: passengerFrom('Luc Favre')
    })
    expect(getGroupProcessedDir('/out', montage).dir).toBe(
      path.join('/out', 'processed', 'Montages', 'Luc Favre')
    )
  })
})

describe('what a montage’s upload is named', () => {
  /* the day its film and project are named for, and the time the jump started */
  it('is its name, the day of its jump and the time it started', () => {
    const montage = jump('m', [file('a', AT)], {
      montageJump: true,
      day: '19.09.2026',
      passenger: passengerFrom('Jean DULUC')
    })
    expect(stemOf(montage)).toBe('jean_duluc_20260919_100000')
  })
})
