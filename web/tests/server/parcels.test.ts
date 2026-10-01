// @vitest-environment node
import { i18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { stemOf } from '@skydock/scripts'
import type { MontageEntry } from '@skydock/scripts'
import type { ManifestGroup } from '../../app/components/types'
import { parcelsOfEntry, parcelsOfGroup } from '../../app/helpers/parcels'

/* A montage as it was handed over: one parcel per folder up there, named for its destination, what is in it, and what is inside
   each zip — from what the upload recorded, or from what the storage's list says when this board
   never held it (RULES, Uploading a montage). */

i18n.loadAndActivate({ locale: 'en', messages: {} })

const LINK = 'https://nas.local/sharing/abc'

const video = (n: number) => ({
  id: `v${n}`,
  path: `/o/GX0${n}.MP4`,
  filename: `GX0${n}.MP4`,
  size: 10,
  mtime: 1_785_000_000 + n
})
const photo = (n: number) => ({
  id: `p${n}`,
  path: `/o/G00${n}.JPG`,
  filename: `G00${n}.JPG`,
  size: 1,
  mtime: 1_785_000_100 + n,
  processed: {
    path: `/p/photos/luc_20260801_${n}.jpg`,
    size: 1,
    at: 1,
    source: { size: 1, mtime: 1 }
  }
})

const group = (uploaded: ManifestGroup['uploaded']): ManifestGroup => ({
  id: 'g1',
  label: 'jump',
  day: '01.08.2026',
  montageJump: true,
  passenger: { firstname: 'Luc', lastname: 'Favre' },
  files: [video(1), video(2), video(3), video(4), video(5), photo(1), photo(2)],
  uploaded
})

const STEM = stemOf(group(undefined))

describe('the parcels of a montage this board holds', () => {
  const sent = group({
    at: 1,
    shareUrl: LINK,
    sent: [
      { name: `${STEM}.mp4`, holds: ['film'], to: ['/Tandems/luc-favre'], size: 600_000_000 },
      {
        name: `${STEM}.backup.full.zip`,
        holds: ['videos', 'photos', 'project'],
        to: ['/Backup/luc-favre'],
        size: 5_000_000_000,
        zip: true,
        contents: [
          'videos/GX01.MP4',
          'videos/GX02.MP4',
          'photos/luc_20260801_1.jpg',
          `${STEM}.kdenlive`
        ]
      }
    ]
  })

  it('hands over what holds the film, with its link, before what is kept', () => {
    const [handed, kept] = parcelsOfGroup(sent)

    /* named for the folder where the board knows no destination, listed first, and the one with the link */
    expect(handed).toMatchObject({
      title: 'luc-favre',
      dir: '/Tandems/luc-favre',
      tag: '1 item',
      shareUrl: LINK
    })
    expect(handed?.items[0]).toMatchObject({
      name: `${STEM}.mp4`,
      size: 600_000_000,
      what: 'the film'
    })
    expect(kept).toMatchObject({ title: 'luc-favre', dir: '/Backup/luc-favre', tag: '1 item' })
    expect(kept?.shareUrl).toBeUndefined()
  })

  it('says what is inside a zip, as it was recorded', () => {
    const zip = parcelsOfGroup(sent)[1]!.items[0]!

    expect(zip.what).toBe('the originals · the photos · the project')
    expect(zip.inside).toEqual([
      { kind: 'folder', name: 'videos/', count: 2, files: ['GX01.MP4', 'GX02.MP4'] },
      { kind: 'folder', name: 'photos/', count: 1, files: ['luc_20260801_1.jpg'] },
      { kind: 'file', name: `${STEM}.kdenlive` }
    ])
  })

  it('works out what is inside a zip from the montage when it was not recorded', () => {
    const older = group({
      at: 1,
      sent: [
        {
          name: `${STEM}.backup.full.zip`,
          holds: ['videos', 'photos', 'project'],
          to: ['/Backup/luc-favre']
        }
      ]
    })

    const inside = parcelsOfGroup(older)[0]!.items[0]!.inside

    expect(inside).toEqual([
      {
        kind: 'folder',
        name: 'videos/',
        count: 5,
        files: ['GX01.MP4', 'GX02.MP4', 'GX03.MP4', 'GX04.MP4', 'GX05.MP4']
      },
      {
        kind: 'folder',
        name: 'photos/',
        count: 2,
        files: ['luc_20260801_1.jpg', 'luc_20260801_2.jpg']
      },
      { kind: 'file', name: `${STEM}.kdenlive` }
    ])
  })

  it('puts the same item in every folder it was sent to', () => {
    const twice = group({
      at: 1,
      sent: [{ name: `${STEM}.mp4`, holds: ['film'], to: ['/A/x', '/B/x'], size: 1 }]
    })

    expect(
      parcelsOfGroup(twice)
        .map((parcel) => parcel.dir)
        .sort()
    ).toEqual(['/A/x', '/B/x'])
  })

  it('reads a montage uploaded before every item was written down', () => {
    const legacy = group({
      at: 1,
      shareUrl: LINK,
      film: { remotePath: '/Tandems/luc/film.mp4', md5: 'x', size: 7, localPath: '/l', at: 1 },
      photos: {
        remotePath: '/Tandems/luc/photos.zip',
        md5: 'x',
        size: 3,
        localPath: '/l',
        at: 1,
        holds: ['photos']
      },
      rushes: { remotePath: '/Backup/luc/rushes.zip', md5: 'x', size: 9, localPath: '/l', at: 1 }
    })

    const [handed, kept] = parcelsOfGroup(legacy)

    expect(handed?.items.map((item) => item.name)).toEqual(['film.mp4', 'photos.zip'])
    expect(handed?.items[1]?.inside).toEqual([
      {
        kind: 'folder',
        name: 'photos/',
        count: 2,
        files: ['luc_20260801_1.jpg', 'luc_20260801_2.jpg']
      }
    ])
    expect(kept).toMatchObject({ dir: '/Backup/luc' })
  })

  it('has no parcel for a montage that was never uploaded', () => {
    expect(parcelsOfGroup(group(undefined))).toEqual([])
  })
})

describe('the parcels of a montage only the storage’s list knows', () => {
  const entry: MontageEntry = {
    folder: '/Tandems/luc-favre',
    firstname: 'Luc',
    lastname: 'Favre',
    day: '01.08.2026',
    videos: 19,
    photos: 337,
    uploadedAt: 1,
    shareUrl: LINK,
    freedAt: 2,
    items: [
      {
        name: 'luc.mp4',
        dir: '/Tandems/luc-favre',
        size: 600_000_000,
        holds: ['film'],
        zip: false
      },
      {
        name: 'luc.videos.zip',
        dir: '/Backup/luc-favre',
        size: 5_000_000_000,
        holds: ['videos', 'project'],
        zip: true
      }
    ]
  }

  it('gives each folder, its items with their sizes, and the link', () => {
    const [handed, kept] = parcelsOfEntry(entry)

    expect(handed).toMatchObject({ shareUrl: LINK })
    expect(handed?.items[0]).toMatchObject({ name: 'luc.mp4', size: 600_000_000 })
    expect(kept).toMatchObject({ dir: '/Backup/luc-favre' })
  })

  it('says how many are inside a zip, since the names are only in the zip', () => {
    expect(parcelsOfEntry(entry)[1]!.items[0]!.inside).toEqual([
      { kind: 'folder', name: 'videos/', count: 19, files: [] },
      { kind: 'file', name: 'the kdenlive project' }
    ])
  })

  it('reads an entry written before its items were kept, from its film, photos and backup', () => {
    const [handed, kept] = parcelsOfEntry({
      folder: '/Tandems/luc-favre',
      firstname: 'Luc',
      lastname: 'Favre',
      day: '01.08.2026',
      videos: 2,
      photos: 12,
      uploadedAt: 1,
      shareUrl: LINK,
      film: '/Tandems/luc-favre/luc.mp4',
      photosZip: '/Tandems/luc-favre/luc.photos.zip',
      backup: '/Backup/luc-favre/luc.rushes.zip'
    })

    expect(handed?.items.map((item) => item.name)).toEqual(['luc.mp4', 'luc.photos.zip'])
    expect(handed?.items[1]?.inside).toEqual([
      { kind: 'folder', name: 'photos/', count: 12, files: [] }
    ])
    expect(kept).toMatchObject({ dir: '/Backup/luc-favre' })
    expect(kept?.items[0]?.name).toBe('luc.rushes.zip')
  })
})
