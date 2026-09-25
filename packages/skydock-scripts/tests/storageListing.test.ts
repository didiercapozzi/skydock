// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listNasFiles, StorageUnreadable } from '../src/nas'
import type { NasSession } from '../src/nas'
import { listRemoteFiles } from '../src/upload'
import type { Manifest } from '../src/types'
import { jsonResponse, stubFetch } from './fixtures'

/* What a folder on the storage holds is only ever decided on a listing that came back. A storage
   that did not answer, or turned the question down, is not a storage with nothing on it — taking it
   for one would make every file there look deleted (RULES, Network storage). */

const HOST = 'http://nas.local:5000'
const session: NasSession = { hostname: HOST, username: 'u', sessionId: 'sid' }

afterEach(() => vi.unstubAllGlobals())

describe('a folder on the storage, listed', () => {
  it('is what it holds, by name and size', async () => {
    stubFetch(() =>
      jsonResponse({
        success: true,
        data: {
          files: [
            { name: 'a.mp4', path: '/SkyDock/Yverdon/a.mp4', isdir: false, additional: { size: 7 } }
          ]
        }
      })
    )
    expect(await listNasFiles(HOST, 'sid', '/SkyDock/Yverdon')).toEqual([
      { name: 'a.mp4', path: '/SkyDock/Yverdon/a.mp4', size: 7, mtime: null }
    ])
  })

  it('is empty when the folder does not exist yet', async () => {
    stubFetch(() => jsonResponse({ success: false, error: { code: 408 } }))
    expect(await listNasFiles(HOST, 'sid', '/SkyDock/Yverdon')).toEqual([])
  })

  it('is not read at all when the storage turns the question down', async () => {
    stubFetch(() => jsonResponse({ success: false, error: { code: 119 } }))
    await expect(listNasFiles(HOST, 'sid', '/SkyDock/Yverdon')).rejects.toBeInstanceOf(
      StorageUnreadable
    )
  })

  it('is not read at all when the storage does not answer', async () => {
    stubFetch(() => {
      throw new Error('connect ETIMEDOUT')
    })
    await expect(listNasFiles(HOST, 'sid', '/SkyDock/Yverdon')).rejects.toBeInstanceOf(
      StorageUnreadable
    )
  })
})

/* The board demotes a file the storage no longer holds only for a folder that answered — a folder
   that did not is left out of what was checked, so nothing in it reads as gone. */
describe('what the storage holds, as the board reads it', () => {
  const manifest: Manifest = {
    version: 1,
    createdAt: '2026-09-25',
    files: [],
    groups: [],
    destinations: [
      { name: 'Yverdon', path: '/SkyDock/Yverdon' },
      { name: 'Epagny', path: '/SkyDock/Epagny' }
    ]
  }

  it('counts only the folders that answered as checked', async () => {
    stubFetch((url) =>
      url.includes('Epagny')
        ? jsonResponse({ success: false, error: { code: 119 } })
        : jsonResponse({ success: true, data: { files: [] } })
    )

    const seen = await listRemoteFiles(manifest, session)

    expect(seen.dirs).toContain('/SkyDock/Yverdon')
    expect(seen.dirs).not.toContain('/SkyDock/Epagny')
  })
})
