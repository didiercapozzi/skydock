// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import { jsonResponse, stubFetch } from './fixtures'
import { createShareLink, ensureShareLink, removeShareLink, shareLinkFor } from '../src/nas'

const HOST = 'https://nas.local:5001'
const CLIP = '/SkyDock/Yverdon/yverdon_20260920_100250.mp4'

type Link = { id: string; url: string; path: string; status?: string }

const storageWith = (held: Link[]) => {
  const links = [...held]
  stubFetch((url) => {
    const params = new URL(url, 'http://x').searchParams
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
  return { links: () => links }
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

  it('is not given a second one when the storage already has a live one', async () => {
    const storage = storageWith([{ id: 'L1', url: '/sharing/abc', path: CLIP, status: 'valid' }])

    const url = await ensureShareLink(HOST, 'sid', CLIP)

    expect(url).toBe(`${HOST}/sharing/abc`)
    expect(storage.links()).toHaveLength(1)
  })

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
  it('is asked for by its id, and the file stays where it is', async () => {
    const storage = storageWith([{ id: 'L1', url: '/sharing/abc', path: CLIP, status: 'valid' }])

    const gone = await removeShareLink(HOST, 'sid', 'L1')

    expect(gone).toBe(true)
    expect(storage.links()).toEqual([])
  })

  it('says so when the storage would not take it away', async () => {
    stubFetch(() => jsonResponse({ success: false, error: { code: 408 } }))

    expect(await removeShareLink(HOST, 'sid', 'L1')).toBe(false)
  })
})
