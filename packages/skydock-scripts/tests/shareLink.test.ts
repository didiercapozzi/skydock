// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import { jsonResponse, stubFetch } from './fixtures'
import { createShareLink, ensureShareLink, removeShareLink, shareLinkFor } from '../src/nas'

/* A file on the storage can be handed out by a link of its own: anybody holding it fetches that one
   file. A link the storage already has is handed back rather than a second one made, an expired one
   is no link at all, and taking one away takes nothing off the storage — the link goes and the file
   stays (RULES, Network storage). */

const HOST = 'https://nas.local:5001'
const CLIP = '/SkyDock/Yverdon/yverdon_20260920_100250.mp4'

type Link = { id: string; url: string; path: string; status?: string }

/* a storage that holds the links it is given, makes new ones, and takes them away by their id */
const storageWith = (held: Link[]) => {
  const links = [...held]
  const asked: string[] = []
  stubFetch((url) => {
    const params = new URL(url, 'http://x').searchParams
    asked.push(`${params.get('method')} ${params.get('id') ?? params.get('path') ?? ''}`)
    if (params.get('api') !== 'SYNO.FileStation.Sharing') return jsonResponse({ success: true })
    if (params.get('method') === 'list')
      return jsonResponse({ success: true, data: { links, total: links.length } })
    if (params.get('method') === 'create') {
      const made = { id: 'new', url: '/sharing/new', path: params.get('path') ?? '' }
      links.push(made)
      return jsonResponse({ success: true, data: { links: [made] } })
    }
    if (params.get('method') === 'delete') {
      const id = params.get('id')
      const at = links.findIndex((l) => l.id === id)
      if (at !== -1) links.splice(at, 1)
      return jsonResponse({ success: true })
    }
    return jsonResponse({ success: false })
  })
  return { links: () => links, asked }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a file handed out by a link of its own', () => {
  it('is given one, and the storage keeps it', async () => {
    const storage = storageWith([])

    const url = await createShareLink(HOST, 'sid', CLIP)

    expect(url).toBe(`${HOST}/sharing/new`)
    expect(storage.links().map((l) => l.path)).toEqual([CLIP])
  })

  /* a second link to the same file is a second thing to keep track of and take away */
  it('is not given a second one when the storage already has a live one', async () => {
    const storage = storageWith([{ id: 'L1', url: '/sharing/abc', path: CLIP, status: 'valid' }])

    const url = await ensureShareLink(HOST, 'sid', CLIP)

    expect(url).toBe(`${HOST}/sharing/abc`)
    expect(storage.links()).toHaveLength(1)
    expect(storage.asked).not.toContain(`create ${CLIP}`)
  })

  /* an expired link would be handed out and simply fail, so it is no link at all */
  it('is given a new one when what the storage has has expired', async () => {
    const storage = storageWith([{ id: 'L1', url: '/sharing/old', path: CLIP, status: 'invalid' }])

    const url = await ensureShareLink(HOST, 'sid', CLIP)

    expect(url).toBe(`${HOST}/sharing/new`)
    expect(storage.links()).toHaveLength(2)
  })

  it('is found whole, with the id the storage knows it by', async () => {
    storageWith([{ id: 'L1', url: '/sharing/abc', path: CLIP, status: 'valid' }])

    expect(await shareLinkFor(HOST, 'sid', CLIP)).toEqual({
      id: 'L1',
      url: `${HOST}/sharing/abc`
    })
  })

  it('has no link when the storage holds none for it', async () => {
    storageWith([{ id: 'L1', url: '/sharing/abc', path: '/SkyDock/Yverdon/another.mp4' }])

    expect(await shareLinkFor(HOST, 'sid', CLIP)).toBeNull()
  })
})

describe('a link taken away', () => {
  /* the storage knows a link by its own id, never by what it points at */
  it('is asked for by its id, and the file stays where it is', async () => {
    const storage = storageWith([{ id: 'L1', url: '/sharing/abc', path: CLIP, status: 'valid' }])

    const gone = await removeShareLink(HOST, 'sid', 'L1')

    expect(gone).toBe(true)
    expect(storage.links()).toEqual([])
    expect(storage.asked).toContain('delete L1')
  })

  it('says so when the storage would not take it away', async () => {
    stubFetch(() => jsonResponse({ success: false, error: { code: 408 } }))

    expect(await removeShareLink(HOST, 'sid', 'L1')).toBe(false)
  })
})
