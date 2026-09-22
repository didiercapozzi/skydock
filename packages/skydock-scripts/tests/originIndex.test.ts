// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as http from 'node:http'
import {
  deliveryFolders,
  originsDirOf,
  placeFolders,
  readOriginIndex,
  recordOrigins
} from '../src/originIndex'
import { alreadyUp, sameSizeUnknown, worthReading } from '../src/originEntry'
import type { OriginIndex } from '../src/originEntry'
import type { NasSession } from '../src/nas'

/* Where every file on the storage came from. Read off the storage, added to one upload at a time,
   written back — and never written over when it could not be read, since that would lose every
   other entry (RULES, Network storage). */

const YVERDON = '/home/Photos/Skydive/Yverdon'
/* the club's own folders: its dropzones, and the one the passengers' folders sit in */
const FOLDERS = [YVERDON, '/home/Photos/Skydive/Tandems', '/home/Photos/Skydive/Epagny']

/* A storage that hands over the list it holds and keeps whatever list is uploaded to it, as the
   list of tandems is tested against. */
const startStorage = async (
  initial: OriginIndex | 'missing' | 'garbage',
  { listing = 'works' }: { listing?: 'works' | 'fails' } = {}
) => {
  let held: string | null =
    initial === 'missing' ? null : initial === 'garbage' ? '{not json' : JSON.stringify(initial)
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8')
      const file = /filename="skydock-origins\.json"[^\r]*\r\n[^\r]*\r\n\r\n([\s\S]*?)\r\n--/.exec(
        body
      )
      if (file) held = file[1]!
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  vi.stubGlobal(
    'fetch',
    vi.fn(async (target: string) => {
      const params = new URL(target).searchParams
      const json = (value: unknown) =>
        new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
      if (params.get('api') === 'SYNO.FileStation.List') {
        if (listing === 'fails') return json({ success: false, error: { code: 119 } })
        return json({
          success: true,
          data: { files: held === null ? [] : [{ name: 'skydock-origins.json', isdir: false }] }
        })
      }
      if (params.get('api') === 'SYNO.FileStation.Download') {
        /* what a Synology behind its own proxy answers for a file that is not there */
        if (held === null)
          return new Response('<!DOCTYPE html><html>Bad Gateway</html>', { status: 502 })
        return new Response(held)
      }
      throw new Error(`unexpected ${target}`)
    })
  )
  const session: NasSession = { hostname: url, username: 'u', sessionId: 'sid' }
  return {
    session,
    held: () => (held === null ? null : (JSON.parse(held) as OriginIndex)),
    raw: () => held,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
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

  /* A backup folder is often on another disk altogether, and letting it have a say would drag the
     list to the top of a share, where nobody would look for it. */
  it('is not dragged away by a backup folder on another share', () => {
    const manifest = {
      version: 1,
      createdAt: '2026-09-20',
      files: [],
      groups: [],
      destinations: [
        { name: 'yverdon', path: YVERDON },
        { name: 'Tandems', path: '/home/Photos/Skydive/Tandems' }
      ]
    }
    const session: NasSession = {
      hostname: 'h',
      username: 'u',
      sessionId: 's',
      backupFolder: '/usbshare2/Skydive/tandems video originales'
    }

    expect(originsDirOf(placeFolders(manifest))).toBe('/home/Photos/Skydive')
    /* it is still looked at, and what is in it still goes in the list */
    expect(deliveryFolders(manifest, session)).toContain(
      '/usbshare2/Skydive/tandems video originales'
    )
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
