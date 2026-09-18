// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NasSession } from '../src/nas'
import {
  listStorageFolder,
  openStorageFile,
  storageDirOf,
  withinStorage
} from '../src/storageFolder'
import type { Manifest, ManifestGroup } from '../src/types'
import { nasStubs, stubFetch } from './fixtures'

/* A dropzone and a tandem are connected to their folder on the storage: what is up there is listed
   and played from the board, whether or not any of it is still on this machine. Read-only. */

const session: NasSession = {
  hostname: 'https://nas.local:5001',
  username: 'u',
  sessionId: 'sid',
  defaultFolder: '/SkyDock',
  backupFolder: '/Backup'
}

const luc: ManifestGroup = {
  id: 'g1',
  label: 'g1',
  day: '01.08.2026',
  destination: 'Tandems',
  passenger: { firstname: 'Luc', lastname: 'Favre' },
  files: []
}

const manifest = (groups: ManifestGroup[] = [luc]): Manifest => ({
  version: 1,
  createdAt: 'x',
  files: [],
  groups,
  destinations: [{ name: 'Tandems' }, { name: 'Yverdon' }, { name: 'Colombier', path: '/Club/Col' }]
})

afterEach(() => vi.unstubAllGlobals())

describe('where a place’s folder is on the storage', () => {
  it('is, for a dropzone, the folder its days are uploaded into', () => {
    expect(storageDirOf(manifest(), '/SkyDock', { destination: 'Yverdon' })).toBe(
      '/SkyDock/Yverdon'
    )
  })

  it('is the dropzone’s own folder when it was given one', () => {
    expect(storageDirOf(manifest(), '/SkyDock', { destination: 'Colombier' })).toBe('/Club/Col')
  })

  it('is, for a tandem, the passenger’s folder under Tandems', () => {
    expect(storageDirOf(manifest(), '/SkyDock', { groupId: 'g1' }, '/out')).toBe(
      '/SkyDock/Tandems/Luc Favre'
    )
  })

  /* the default folder may be changed after the upload; the tandem is still where it was sent */
  it('is, for a tandem already uploaded, the folder it actually went to', () => {
    const sent = {
      remotePath: '/Old/Tandems/Luc Favre/luc.mp4',
      md5: 'x',
      size: 1,
      localPath: '/l',
      at: 1
    }
    const uploaded = manifest([{ ...luc, uploaded: { at: 1, film: sent } }])
    expect(storageDirOf(uploaded, '/SkyDock', { groupId: 'g1' }, '/out')).toBe(
      '/Old/Tandems/Luc Favre'
    )
  })

  it('is nowhere while no folder has been chosen', () => {
    expect(storageDirOf(manifest(), null, { destination: 'Yverdon' })).toBeNull()
  })
})

describe('what a folder on the storage holds', () => {
  it('lists its files, the films and clips first, saying what each is', async () => {
    const stub = nasStubs({
      files: {
        '/SkyDock/Tandems/Luc Favre': [
          { name: 'luc_favre.photos.zip', size: 30 },
          { name: 'b.jpg', size: 20 },
          { name: 'luc_favre.mp4', size: 10 }
        ]
      }
    })
    stubFetch((url) => stub(url) ?? new Response('{}'))

    const files = await listStorageFolder(session, '/SkyDock/Tandems/Luc Favre')

    expect(files.map((f) => [f.kind, f.name])).toEqual([
      ['video', 'luc_favre.mp4'],
      ['photo', 'b.jpg'],
      ['other', 'luc_favre.photos.zip']
    ])
  })

  it('is empty, not an error, for a folder nothing was uploaded into yet', async () => {
    const stub = nasStubs({ files: {} })
    stubFetch((url) => stub(url) ?? new Response('{}'))
    expect(await listStorageFolder(session, '/SkyDock/Yverdon')).toEqual([])
  })
})

describe('a file played off the storage', () => {
  it('is only ever one inside a folder SkyDock uploads into', () => {
    const m = manifest()
    expect(withinStorage(m, session, '/SkyDock/Tandems/Luc Favre/luc.mp4')).toBe(true)
    expect(withinStorage(m, session, '/Club/Col/day.mp4')).toBe(true)
    expect(withinStorage(m, session, '/Backup/luc.rushes.zip')).toBe(true)
    expect(withinStorage(m, session, '/homes/someone/private.mp4')).toBe(false)
    expect(withinStorage(m, session, '/SkyDock/../homes/someone/private.mp4')).toBe(false)
    /* a folder whose name merely starts the same is not inside it */
    expect(withinStorage(m, session, '/SkyDockOther/x.mp4')).toBe(false)
  })

  /* a film is scrubbed without being downloaded whole: the part asked for is the part fetched */
  it('asks the storage for the part the player asked for', async () => {
    const asked: { url: string; range: string | null }[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      asked.push({ url, range: new Headers(init?.headers).get('range') })
      return new Response('part', { status: 206 })
    })

    const answer = await openStorageFile(
      session,
      '/SkyDock/Tandems/Luc Favre/luc.mp4',
      'bytes=100-199'
    )

    expect(answer.status).toBe(206)
    expect(asked[0]?.range).toBe('bytes=100-199')
    const params = new URL(asked[0]!.url).searchParams
    expect(params.get('api')).toBe('SYNO.FileStation.Download')
    expect(params.get('mode')).toBe('open')
    expect(params.get('path')).toBe('["/SkyDock/Tandems/Luc Favre/luc.mp4"]')
  })
})
