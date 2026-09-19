// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { reclusterGroups } from '../src/clustering'
import { restorableFiles, restoreTandems } from '../src/restoreTandems'
import type { TandemEntry, TandemIndex } from '../src/tandemEntry'
import { entryOfTandem, upsert } from '../src/tandemIndex'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'

/* A board scanned again from nothing has forgotten its tandems; the storage's list has not. Every
   tandem uploaded is written down with the files it was made of, each by what it contains, and a
   scan from scratch gives every file that identity again — so the tandem is put back: the same
   files, under the same name, at the times they had. */

/* 1 August 2026, 10:00 local, as the camera said — and an hour later, as a person set it right */
const CAMERA = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)
const CORRECTED = CAMERA + 3600

const file = (id: string, mtime: number): ManifestFile => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime
})

const sent = (name: string) => ({
  remotePath: `/SkyDock/Tandems/Luc Favre/${name}`,
  md5: 'x',
  size: 1,
  localPath: '/l',
  at: 1
})

/* Luc Favre's tandem as it was when it was uploaded: two clips, an hour on from the camera's clock */
const uploadedTandem = (): ManifestGroup => ({
  id: 'group_7',
  label: 'group_7',
  day: '01.08.2026',
  destination: 'Tandems',
  passenger: { firstname: 'Luc', lastname: 'Favre' },
  processed: true,
  uploaded: { at: 5, film: sent('luc.mp4') },
  files: [file('a', CORRECTED), file('b', CORRECTED + 60)]
})

const listed = (): TandemEntry => {
  const index: TandemIndex = { version: 1, tandems: [] }
  upsert(index, entryOfTandem(uploadedTandem())!.entry)
  return index.tandems[0]!
}

/* the same disk scanned from nothing: every file back on its camera time, in jumps nobody filed */
const forgotten = (): Manifest => {
  const manifest: Manifest = {
    version: 1,
    createdAt: 'x',
    files: [file('a', CAMERA), file('b', CAMERA + 60), file('other', CAMERA + 7200)],
    groups: []
  }
  reclusterGroups(manifest)
  return manifest
}

describe('the storage’s list of tandems', () => {
  it('writes down which files a tandem is made of, and the times they were given', () => {
    expect(listed().files).toEqual([
      { id: 'a', filename: 'a.MP4', mtime: CORRECTED },
      { id: 'b', filename: 'b.MP4', mtime: CORRECTED + 60 }
    ])
  })

  /* one passenger is one folder and one entry, however many jumps */
  it('keeps the files of a passenger’s first jump when their second is uploaded', () => {
    const index: TandemIndex = { version: 1, tandems: [] }
    upsert(index, entryOfTandem(uploadedTandem())!.entry)
    const second = { ...uploadedTandem(), id: 'group_8', files: [file('c', CORRECTED + 9000)] }
    upsert(index, entryOfTandem(second)!.entry)

    expect(index.tandems).toHaveLength(1)
    expect(index.tandems[0]?.files?.map((f) => f.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('a tandem this board has forgotten', () => {
  it('is put back from the list: the same files, under the passenger’s name', () => {
    const manifest = forgotten()

    const restored = restoreTandems(manifest, [listed()])

    expect(restored).toEqual([{ who: 'Luc Favre', files: 2, of: 2 }])
    const tandem = manifest.groups.find((g) => g.destination === 'Tandems')
    expect(tandem?.passenger).toEqual({ firstname: 'Luc', lastname: 'Favre' })
    expect(tandem?.files.map((f) => f.id)).toEqual(['a', 'b'])
    /* and nothing that was not its own */
    expect(manifest.files.find((f) => f.id === 'other')?.mtime).toBe(CAMERA + 7200)
  })

  it('gets back the times a person had set right', () => {
    const manifest = forgotten()

    restoreTandems(manifest, [listed()])

    const tandem = manifest.groups.find((g) => g.destination === 'Tandems')
    expect(tandem?.files.map((f) => f.mtime)).toEqual([CORRECTED, CORRECTED + 60])
    expect(manifest.files.find((f) => f.id === 'a')?.mtime).toBe(CORRECTED)
  })

  /* "uploaded" is only ever said of a copy proved on both sides, and the copies are gone */
  it('comes back named and waiting to be processed, never claimed as uploaded', () => {
    const manifest = forgotten()

    restoreTandems(manifest, [listed()])

    const tandem = manifest.groups.find((g) => g.destination === 'Tandems')
    expect(tandem?.processed).toBeFalsy()
    expect(tandem?.uploaded).toBeUndefined()
  })

  it('says how many of its files were found when some are no longer here', () => {
    const manifest = forgotten()
    manifest.files = manifest.files.filter((f) => f.id !== 'b')
    reclusterGroups(manifest)

    expect(restoreTandems(manifest, [listed()])).toEqual([{ who: 'Luc Favre', files: 1, of: 2 }])
  })
})

describe('a tandem that is not to be restored', () => {
  /* whoever filed them since knows better than a list */
  it('is left alone when its files are already filed somewhere', () => {
    const manifest = forgotten()
    for (const group of manifest.groups) group.destination = 'Yverdon'

    expect(restorableFiles(manifest, listed())).toEqual([])
    expect(restoreTandems(manifest, [listed()])).toEqual([])
    expect(manifest.groups.every((g) => g.destination === 'Yverdon')).toBe(true)
  })

  it('is left alone while it is still on the board', () => {
    const manifest: Manifest = {
      version: 1,
      createdAt: 'x',
      files: uploadedTandem().files,
      groups: [uploadedTandem()]
    }

    expect(restoreTandems(manifest, [listed()])).toEqual([])
    expect(manifest.groups).toHaveLength(1)
  })

  /* written before the list knew the files, or freed from its machine: nothing here to find */
  it('is left alone when the list does not say which files it was, or none are here', () => {
    const { files: _files, ...old } = listed()
    expect(restoreTandems(forgotten(), [old])).toEqual([])
    const elsewhere = { ...listed(), files: [{ id: 'gone', filename: 'g.MP4', mtime: 1 }] }
    expect(restoreTandems(forgotten(), [elsewhere])).toEqual([])
  })
})
