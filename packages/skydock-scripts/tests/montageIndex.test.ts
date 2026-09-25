// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  entryOfMontage,
  lostOnStorage,
  readMontageIndex,
  updateMontageIndex,
  upsert
} from '../src/montageIndex'
import type { MontageIndex } from '../src/montageEntry'
import { jsonResponse, startListStorage, stubFetch } from './fixtures'
import type { ManifestGroup } from '../src/types'

/* The storage's own list of montages. Read off the storage, changed one entry at a time, written back
   — and never written over when it could not be read, since that would lose every other entry. */

const DIR = '/SkyDock/Passengers'

/* A storage that keeps the list of montages in DIR, under the name it has now. */
const LIST = `${DIR}/skydock-montages.json`

const startStorage = async (
  initial: MontageIndex | 'missing' | 'garbage',
  options: { listing?: 'works' | 'fails' } = {}
) => {
  const storage = await startListStorage(
    initial === 'missing'
      ? {}
      : { [LIST]: initial === 'garbage' ? '{not json' : JSON.stringify(initial) },
    options
  )
  return { ...storage, held: () => heldIn(storage.file(LIST)) }
}

const heldIn = (text: string | null) => (text === null ? null : (JSON.parse(text) as MontageIndex))

afterEach(() => {
  vi.unstubAllGlobals()
})

const entry = (folder: string, firstname: string, uploadedAt: number) => ({
  folder,
  firstname,
  lastname: 'Favre',
  day: '01.08.2026',
  videos: 2,
  photos: 10,
  uploadedAt
})

describe('the storage’s list of montages', () => {
  it('is empty while nothing has been uploaded into the folder', async () => {
    const storage = await startStorage('missing')
    try {
      expect(await readMontageIndex(storage.session, DIR)).toEqual({ version: 1, montages: [] })
    } finally {
      await storage.close()
    }
  })

  it('changes one montage and keeps every other — another machine’s included', async () => {
    const storage = await startStorage({
      version: 1,
      montages: [entry(`${DIR}/Ana Roth`, 'Ana', 100)]
    })
    try {
      await updateMontageIndex(storage.session, DIR, (index) =>
        upsert(index, entry(`${DIR}/Luc Favre`, 'Luc', 200))
      )
      await updateMontageIndex(storage.session, DIR, (index) => {
        index.montages.find((t) => t.folder === `${DIR}/Luc Favre`)!.emailed = {
          at: 300,
          to: 'luc@x.ch'
        }
      })
      const held = storage.held()!
      expect(held.montages.map((t) => t.firstname)).toEqual(['Luc', 'Ana'])
      expect(held.montages[0]?.emailed).toEqual({ at: 300, to: 'luc@x.ch' })
    } finally {
      await storage.close()
    }
  })

  /* the storage says a missing file with a 502 page — a list that is not there yet is still just
     a list to start */
  it('starts the list when there is none yet, however the storage says a file is missing', async () => {
    const storage = await startStorage('missing')
    try {
      await updateMontageIndex(storage.session, DIR, (index) =>
        upsert(index, entry(`${DIR}/Luc Favre`, 'Luc', 200))
      )
      expect(storage.held()?.montages.map((t) => t.firstname)).toEqual(['Luc'])
    } finally {
      await storage.close()
    }
  })

  it('never takes a folder it could not list for one with no list in it', async () => {
    const storage = await startStorage(
      { version: 1, montages: [entry(`${DIR}/Ana Roth`, 'Ana', 100)] },
      { listing: 'fails' }
    )
    try {
      await expect(
        updateMontageIndex(storage.session, DIR, (index) =>
          upsert(index, entry(`${DIR}/Luc Favre`, 'Luc', 200))
        )
      ).rejects.toThrow(/would not list/)
      expect(storage.held()?.montages.map((t) => t.firstname)).toEqual(['Ana'])
    } finally {
      await storage.close()
    }
  })

  it('refuses to write over a list it cannot read, rather than lose what is in it', async () => {
    const storage = await startStorage('garbage')
    try {
      await expect(
        updateMontageIndex(storage.session, DIR, (index) =>
          upsert(index, entry(`${DIR}/Luc`, 'Luc', 1))
        )
      ).rejects.toThrow(/cannot be read/)
    } finally {
      await storage.close()
    }
  })
})

/* The list lives where SkyDock's lists were fixed to live. One kept somewhere else before that is
   read from there, and moved the first time it changes, so there are never two lists telling
   different stories. */
describe('the list of montages kept somewhere else before', () => {
  it('is found there, and moved to its own place', async () => {
    const ana = JSON.stringify({ version: 1, montages: [entry(`${DIR}/Ana Roth`, 'Ana', 100)] })
    const storage = await startListStorage({ [LIST]: ana })
    try {
      await updateMontageIndex(
        storage.session,
        '/SkyDock',
        (index) => upsert(index, entry(`${DIR}/Luc Favre`, 'Luc', 200)),
        [DIR]
      )

      expect(heldIn(storage.file('/SkyDock/skydock-montages.json'))?.montages).toHaveLength(2)
      expect(storage.file(LIST)).toBeNull()
    } finally {
      await storage.close()
    }
  })
})

/* The list remembers what went up; the storage says what is there now. What it no longer holds is
   said of the entry rather than taken off the list: whether the passenger was emailed, and that the
   montage was freed, are said nowhere else (RULES, Network storage). */
describe('what the storage no longer holds of the montages on its list', () => {
  const session = { hostname: 'http://nas.local', username: 'u', sessionId: 'sid' }
  const named = (firstname: string) => ({
    ...entry(`${DIR}/${firstname} Favre`, firstname, 100),
    shareUrl: `http://nas.local/sharing/${firstname}`
  })
  const montages = [named('Ana'), named('Luc'), named('Eva')]

  it('names a folder that is gone, and a link the storage no longer honours', async () => {
    stubFetch((url) => {
      const params = new URL(url).searchParams
      if (params.get('api') === 'SYNO.FileStation.Sharing')
        return jsonResponse({
          success: true,
          data: {
            total: 1,
            links: [{ path: `${DIR}/Ana Favre`, url: '/sharing/Ana', status: 'valid' }]
          }
        })
      if (params.get('api') === 'SYNO.FileStation.List')
        return jsonResponse({
          success: true,
          data: {
            files: ['Ana Favre', 'Luc Favre'].map((name) => ({
              name,
              path: `${DIR}/${name}`,
              isdir: true
            }))
          }
        })
      throw new Error(`unexpected ${url}`)
    })

    expect(await lostOnStorage(session, montages)).toEqual({
      folders: [`${DIR}/Eva Favre`],
      links: [`${DIR}/Luc Favre`]
    })
  })

  it('takes nothing away when the storage does not answer', async () => {
    stubFetch(() => jsonResponse({ success: false, error: { code: 119 } }))

    expect(await lostOnStorage(session, montages)).toEqual({ folders: [], links: [] })
  })
})

describe('a montage’s entry', () => {
  it('comes from what its upload recorded: its folder, its link, its film and its backup', () => {
    const group: ManifestGroup = {
      id: 'g1',
      label: 'jump',
      day: '01.08.2026',
      montageJump: true,
      passenger: { firstname: 'Luc', lastname: 'Favre' },
      files: [
        { id: 'v', path: '/o/GX01.MP4', filename: 'GX01.MP4', size: 1, mtime: 1 },
        { id: 'p', path: '/o/G001.JPG', filename: 'G001.JPG', size: 1, mtime: 1 }
      ],
      uploaded: {
        at: 500,
        shareUrl: 'https://nas/s/1',
        film: { remotePath: `${DIR}/Luc Favre/luc.mp4`, md5: 'x', size: 1, localPath: '/l', at: 1 },
        rushes: { remotePath: '/Backup/luc.rushes.zip', md5: 'x', size: 1, localPath: '/l', at: 1 }
      }
    }
    const listed = entryOfMontage(group)!
    expect(listed.dir).toBe(DIR)
    expect(listed.entry).toMatchObject({
      folder: `${DIR}/Luc Favre`,
      firstname: 'Luc',
      videos: 1,
      photos: 1,
      uploadedAt: 500,
      shareUrl: 'https://nas/s/1',
      backup: '/Backup/luc.rushes.zip'
    })
  })

  /* the list lives above every destination; the montage is known by the folder its film went to */
  it('is known by the folder its film went to, and kept in the list folder it is given', () => {
    const group: ManifestGroup = {
      id: 'g1',
      label: 'jump',
      day: '01.08.2026',
      montageJump: true,
      passenger: { firstname: 'Boogie', lastname: '2026' },
      files: [{ id: 'v', path: '/o/GX01.MP4', filename: 'GX01.MP4', size: 1, mtime: 1 }],
      uploaded: {
        at: 500,
        sent: [
          { name: 'boogie.backup.videos.zip', holds: ['videos'], to: ['/Backup/Boogie 2026'] },
          {
            name: 'boogie.mp4',
            holds: ['film'],
            to: ['/Dropzones/Yverdon/Boogie 2026', '/Dropzones/Passengers/Boogie 2026']
          }
        ]
      }
    }
    const listed = entryOfMontage(group, DIR)!
    expect(listed.dir).toBe(DIR)
    expect(listed.entry.folder).toBe('/Dropzones/Yverdon/Boogie 2026')
  })

  it('does not exist for a montage that was never uploaded', () => {
    expect(
      entryOfMontage({ id: 'g', label: 'j', day: '01.08.2026', files: [] } as ManifestGroup)
    ).toBeNull()
  })
})
