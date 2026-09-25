// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  deliveryFolders,
  originsDirOf,
  readOriginIndex,
  recordOrigins,
  settleListsDir
} from '../src/originIndex'
import { loadNasSession, saveNasSession } from '../src/nas'
import type { Manifest } from '../src/types'
import { createTmpDir, startListStorage } from './fixtures'
import { alreadyUp, sameSizeUnknown, worthReading } from '../src/originEntry'
import type { OriginIndex } from '../src/originEntry'

/* Where every file on the storage came from. Read off the storage, added to one upload at a time,
   written back — and never written over when it could not be read, since that would lose every
   other entry (RULES, Network storage). */

const YVERDON = '/home/Photos/Skydive/Yverdon'
/* the club's own folders: its dropzones, and the one the passengers' folders sit in */
const FOLDERS = [YVERDON, '/home/Photos/Skydive/Passengers', '/home/Photos/Skydive/Epagny']

/* A storage that keeps SkyDock's list of what it holds above the club's folders, where it has
   always been worked out to go. */
const LIST = '/home/Photos/Skydive/skydock-origins.json'

const startStorage = async (
  initial: OriginIndex | 'missing' | 'garbage',
  options: { listing?: 'works' | 'fails' } = {}
) => {
  const storage = await startListStorage(
    initial === 'missing'
      ? {}
      : { [LIST]: initial === 'garbage' ? '{not json' : JSON.stringify(initial) },
    options
  )
  const heldAt = (at: string) => {
    const text = storage.file(at)
    return text === null ? null : (JSON.parse(text) as OriginIndex)
  }
  return { ...storage, heldAt, held: () => heldAt(LIST), raw: () => storage.file(LIST) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const sent = (from: string, md5: string) => ({ from, md5, size: 10, at: 100 })

describe('where the list of origins lives', () => {
  /* The folder that holds every folder the club delivers into — not the top of a share beside
     everything else somebody keeps there, and never inside a delivered folder, which a passenger's
     link opens. */
  it('is the folder that holds every folder delivered into', () => {
    expect(originsDirOf(FOLDERS)).toBe('/home/Photos/Skydive')
  })

  it('is one step above a club that delivers into a single folder', () => {
    expect(originsDirOf([YVERDON])).toBe('/home/Photos/Skydive')
  })

  /* nothing in common but the share, which is as far up as anything can be written */
  it('is the share when the folders share nothing else', () => {
    expect(originsDirOf(['/home/Photos/Skydive/Yverdon', '/home/Colombier'])).toBe('/home')
  })

  /* a montage's backups go into a destination like everything else, wherever that one is */
  it('counts every destination as a folder delivered into, a backup on another share included', () => {
    const manifest = {
      version: 2,
      createdAt: '2026-09-20',
      files: [],
      groups: [],
      destinations: [
        { name: 'yverdon', path: YVERDON },
        { name: 'Backup', path: '/usbshare2/Skydive/montages video originales' }
      ]
    }

    expect(deliveryFolders(manifest)).toEqual([
      YVERDON,
      '/usbshare2/Skydive/montages video originales'
    ])
  })

  it('is the share itself for a club delivering into one of its folders', () => {
    expect(originsDirOf(['/home/Skydive'])).toBe('/home')
  })
})

describe('what the storage already holds of a piece of footage', () => {
  it('is empty while nothing has been uploaded into the share', async () => {
    const storage = await startStorage('missing')
    try {
      expect(await readOriginIndex(storage.session, FOLDERS)).toEqual({
        version: 1,
        files: {}
      })
    } finally {
      await storage.close()
    }
  })

  /* the whole point: the same footage under a name nobody would have guessed */
  it('is the same bytes, under another name and in another folder', () => {
    const index: OriginIndex = {
      version: 1,
      files: { '/home/Photos/Skydive/Epagny/epagny_20260920_100250.mp4': sent('b699e6', 'abc') }
    }
    expect(alreadyUp(index, 'ABC')?.remotePath).toBe(
      '/home/Photos/Skydive/Epagny/epagny_20260920_100250.mp4'
    )
  })

  it('is not the same footage cut another way', () => {
    const index: OriginIndex = {
      version: 1,
      files: { [`${YVERDON}/a.mp4`]: sent('b699e6', 'abc') }
    }
    expect(alreadyUp(index, 'nowlonger')).toBeNull()
  })

  /* A folder SkyDock is pointed at may be full of footage from before it ever looked: those files
     are in the list with what they weigh and nothing else, and the ones worth asking the storage
     about are the ones that weigh what this file weighs. */
  it('is worth reading a file for only when the storage might already hold it', () => {
    const index: OriginIndex = {
      version: 1,
      files: {
        [`${YVERDON}/from_before.mp4`]: { size: 500, at: 1 },
        [`${YVERDON}/ours.mp4`]: sent('b699e6', 'abc')
      }
    }

    expect(worthReading(index, { from: 'b699e6', size: 9 })).toBe(true)
    expect(worthReading(index, { from: undefined, size: 500 })).toBe(true)
    expect(worthReading(index, { from: 'nothing-like-it', size: 9 })).toBe(false)
    expect(sameSizeUnknown(index, 500)).toEqual([`${YVERDON}/from_before.mp4`])
    /* one whose digest the storage has already been asked for is never asked about again */
    expect(sameSizeUnknown(index, 10)).toEqual([])
  })
})

describe('what an upload leaves behind', () => {
  it('adds its files and keeps every other — another machine’s included', async () => {
    const storage = await startStorage({
      version: 1,
      files: { '/home/Photos/Skydive/Colombier/one.mp4': sent('aaa', 'md5-a') }
    })
    try {
      await recordOrigins(storage.session, FOLDERS, [
        { remotePath: `${YVERDON}/two.mp4`, ...sent('bbb', 'md5-b') }
      ])

      expect(Object.keys(storage.held()!.files).sort()).toEqual([
        '/home/Photos/Skydive/Colombier/one.mp4',
        `${YVERDON}/two.mp4`
      ])
    } finally {
      await storage.close()
    }
  })

  it('writes every file of the job into the one list', async () => {
    const storage = await startStorage('missing')
    try {
      const written = await recordOrigins(storage.session, FOLDERS, [
        { remotePath: `${YVERDON}/two.mp4`, ...sent('bbb', 'md5-b') },
        { remotePath: '/usbshare2/Skydive/originals/Luc/rushes.zip', ...sent('ccc', 'md5-c') }
      ])

      /* one list, whichever disk the files themselves are on */
      expect(written).toBe(2)
      expect(Object.keys(storage.held()!.files).sort()).toEqual([
        '/home/Photos/Skydive/Yverdon/two.mp4',
        '/usbshare2/Skydive/originals/Luc/rushes.zip'
      ])
    } finally {
      await storage.close()
    }
  })

  /* The listing is what is there now; the list only remembers. A file somebody deleted over there
     by hand is forgotten once its folder is listed without it, or it would be called sent forever
     and never go up again (RULES, Network storage). */
  it('forgets a file the folder it was in, just listed, no longer holds', async () => {
    const storage = await startStorage({
      version: 1,
      files: {
        [`${YVERDON}/kept.mp4`]: sent('aaa', 'md5-a'),
        [`${YVERDON}/deleted_by_hand.mp4`]: sent('bbb', 'md5-b')
      }
    })
    try {
      await recordOrigins(storage.session, FOLDERS, [], {
        dirs: [YVERDON],
        paths: [`${YVERDON}/kept.mp4`]
      })

      expect(Object.keys(storage.held()!.files)).toEqual([`${YVERDON}/kept.mp4`])
    } finally {
      await storage.close()
    }
  })

  it('forgets nothing in a folder that was not listed', async () => {
    const storage = await startStorage({
      version: 1,
      files: { '/home/Photos/Skydive/Colombier/one.mp4': sent('aaa', 'md5-a') }
    })
    try {
      await recordOrigins(storage.session, FOLDERS, [], { dirs: [YVERDON], paths: [] })

      expect(Object.keys(storage.held()!.files)).toEqual(['/home/Photos/Skydive/Colombier/one.mp4'])
    } finally {
      await storage.close()
    }
  })

  /* a list that is there but cannot be read is an error, never an empty list: writing back over it
     would throw away every entry in it */
  it('refuses to write over a list it could not read', async () => {
    const storage = await startStorage('garbage')
    try {
      await expect(
        recordOrigins(storage.session, FOLDERS, [
          { remotePath: `${YVERDON}/two.mp4`, ...sent('bbb', 'md') }
        ])
      ).rejects.toThrow(/cannot be read/)
      expect(storage.raw()).toBe('{not json')
    } finally {
      await storage.close()
    }
  })

  it('refuses to write when the storage would not say what is there', async () => {
    const storage = await startStorage('missing', { listing: 'fails' })
    try {
      await expect(
        recordOrigins(storage.session, FOLDERS, [
          { remotePath: `${YVERDON}/two.mp4`, ...sent('bbb', 'md') }
        ])
      ).rejects.toThrow(/would not list/)
    } finally {
      await storage.close()
    }
  })
})

/* Where the lists live is worked out once and kept: a destination added later, whose folder sits
   somewhere else, must not move them — a list that moved would start again empty (RULES, Network
   storage). */
describe('where the lists stay', () => {
  const manifestWith = (paths: string[]): Manifest => ({
    version: 1,
    createdAt: '2026-09-25',
    files: [],
    groups: [],
    destinations: paths.map((p, i) => ({ name: `Place ${i}`, path: p }))
  })

  it('is fixed the first time there are places, and does not move when one is added', () => {
    const configDir = createTmpDir('skydock-lists-')
    saveNasSession({ hostname: 'h', username: 'u', sessionId: 'sid' }, configDir)

    settleListsDir(manifestWith(FOLDERS), configDir)
    settleListsDir(manifestWith([...FOLDERS, '/usbshare2/Skydive/Backup']), configDir)

    expect(loadNasSession(configDir)?.listsDir).toBe('/home/Photos/Skydive')
  })

  it('writes the list where it was fixed, whatever the folders now are', async () => {
    const storage = await startStorage({ version: 1, files: {} })
    try {
      const session = { ...storage.session, listsDir: '/home/Photos/Skydive' }
      await recordOrigins(
        session,
        [...FOLDERS, '/usbshare2/Skydive/Backup'],
        [{ remotePath: `${YVERDON}/two.mp4`, ...sent('bbb', 'md5-b') }]
      )

      expect(Object.keys(storage.held()!.files)).toEqual([`${YVERDON}/two.mp4`])
    } finally {
      await storage.close()
    }
  })

  it('finds a list where it was kept before its place was fixed, and moves it there', async () => {
    const storage = await startStorage({
      version: 1,
      files: { [`${YVERDON}/one.mp4`]: sent('aaa', 'md5-a') }
    })
    try {
      const session = { ...storage.session, listsDir: '/home/Photos' }
      expect(Object.keys((await readOriginIndex(session, FOLDERS)).files)).toEqual([
        `${YVERDON}/one.mp4`
      ])

      await recordOrigins(session, FOLDERS, [
        { remotePath: `${YVERDON}/two.mp4`, ...sent('bbb', 'md5-b') }
      ])

      expect(
        Object.keys(storage.heldAt('/home/Photos/skydock-origins.json')!.files).sort()
      ).toEqual([`${YVERDON}/one.mp4`, `${YVERDON}/two.mp4`])
      expect(storage.raw()).toBeNull()
    } finally {
      await storage.close()
    }
  })
})
