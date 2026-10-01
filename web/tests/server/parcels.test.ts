// @vitest-environment node
import { i18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { stemOf } from '@skydock/scripts'
import type { ManifestGroup } from '../../app/components/types'
import { parcelsOfGroup } from '../../app/helpers/parcels'

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
