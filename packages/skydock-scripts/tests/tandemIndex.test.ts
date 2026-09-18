// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as http from 'node:http'
import { entryOfTandem, readTandemIndex, updateTandemIndex, upsert } from '../src/tandemIndex'
import type { TandemIndex } from '../src/tandemEntry'
import type { NasSession } from '../src/nas'
import type { ManifestGroup } from '../src/types'

/* The storage's own list of tandems. Read off the storage, changed one entry at a time, written back
   — and never written over when it could not be read, since that would lose every other entry. */

const DIR = '/SkyDock/Tandems'

/* A storage that hands over the list it holds and keeps whatever list is uploaded to it. Downloads go
   through fetch, uploads through a plain http request, the same as the app. */
const startStorage = async (
  initial: TandemIndex | 'missing' | 'garbage',
  { listing = 'works' }: { listing?: 'works' | 'fails' } = {}
) => {
  let held: string | null =
    initial === 'missing' ? null : initial === 'garbage' ? '{not json' : JSON.stringify(initial)
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8')
      /* the file part of the multipart upload: everything between its headers and the boundary */
      const file = /filename="skydock-tandems\.json"[^\r]*\r\n[^\r]*\r\n\r\n([\s\S]*?)\r\n--/.exec(
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
          data: { files: held === null ? [] : [{ name: 'skydock-tandems.json', isdir: false }] }
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
    held: () => (held === null ? null : (JSON.parse(held) as TandemIndex)),
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

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

describe('the storage’s list of tandems', () => {
  it('is empty while nothing has been uploaded into the folder', async () => {
    const storage = await startStorage('missing')
    try {
      expect(await readTandemIndex(storage.session, DIR)).toEqual({ version: 1, tandems: [] })
    } finally {
      await storage.close()
    }
  })

  it('changes one tandem and keeps every other — another machine’s included', async () => {
    const storage = await startStorage({
      version: 1,
      tandems: [entry(`${DIR}/Ana Roth`, 'Ana', 100)]
    })
    try {
      await updateTandemIndex(storage.session, DIR, (index) =>
        upsert(index, entry(`${DIR}/Luc Favre`, 'Luc', 200))
      )
      await updateTandemIndex(storage.session, DIR, (index) => {
        index.tandems.find((t) => t.folder === `${DIR}/Luc Favre`)!.emailed = {
          at: 300,
          to: 'luc@x.ch'
        }
      })
      const held = storage.held()!
      expect(held.tandems.map((t) => t.firstname)).toEqual(['Luc', 'Ana'])
      expect(held.tandems[0]?.emailed).toEqual({ at: 300, to: 'luc@x.ch' })
    } finally {
      await storage.close()
    }
  })

  /* the storage says a missing file with a 502 page — a list that is not there yet is still just
     a list to start */
  it('starts the list when there is none yet, however the storage says a file is missing', async () => {
    const storage = await startStorage('missing')
    try {
      await updateTandemIndex(storage.session, DIR, (index) =>
        upsert(index, entry(`${DIR}/Luc Favre`, 'Luc', 200))
      )
      expect(storage.held()?.tandems.map((t) => t.firstname)).toEqual(['Luc'])
    } finally {
      await storage.close()
    }
  })

  it('never takes a folder it could not list for one with no list in it', async () => {
    const storage = await startStorage(
      { version: 1, tandems: [entry(`${DIR}/Ana Roth`, 'Ana', 100)] },
      { listing: 'fails' }
    )
    try {
      await expect(
        updateTandemIndex(storage.session, DIR, (index) =>
          upsert(index, entry(`${DIR}/Luc Favre`, 'Luc', 200))
        )
      ).rejects.toThrow(/would not list/)
      expect(storage.held()?.tandems.map((t) => t.firstname)).toEqual(['Ana'])
    } finally {
      await storage.close()
    }
  })

  it('refuses to write over a list it cannot read, rather than lose what is in it', async () => {
    const storage = await startStorage('garbage')
    try {
      await expect(
        updateTandemIndex(storage.session, DIR, (index) =>
          upsert(index, entry(`${DIR}/Luc`, 'Luc', 1))
        )
      ).rejects.toThrow(/cannot be read/)
    } finally {
      await storage.close()
    }
  })
})

describe('a tandem’s entry', () => {
  it('comes from what its upload recorded: its folder, its link, its film and its backup', () => {
    const group: ManifestGroup = {
      id: 'g1',
      label: 'jump',
      day: '01.08.2026',
      destination: 'Tandems',
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
    const listed = entryOfTandem(group)!
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

  it('does not exist for a tandem that was never uploaded', () => {
    expect(
      entryOfTandem({ id: 'g', label: 'j', day: '01.08.2026', files: [] } as ManifestGroup)
    ).toBeNull()
  })
})
