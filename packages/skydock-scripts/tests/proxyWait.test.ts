// @vitest-environment node
import { describe, it, expect } from 'vitest'
import type { ProxyFact } from '../src/boardAnswer'
import { waitingForProxy } from '../src/proxyWait'
import type { ManifestFile } from '../src/types'

/* An editing project waits until every clip in it has its proxy, or has failed to get one — the
   editor opens on proxies, and a project made before them opens on the full clips (RULES, The
   editing project). */

const clip = (name: string): ManifestFile => ({
  id: name,
  path: `/o/${name}`,
  filename: name,
  size: 1,
  mtime: 1
})

const names = (files: ManifestFile[]) => files.map((f) => f.filename)

describe('the clips a project waits on', () => {
  it('is a clip whose proxy has not been made yet', () => {
    const facts: Record<string, ProxyFact> = { '/o/a.MP4': { state: 'none', play: '/o/a.MP4' } }
    expect(names(waitingForProxy([clip('a.MP4')], facts))).toEqual(['a.MP4'])
  })

  it('is not a clip whose proxy is made', () => {
    const facts: Record<string, ProxyFact> = { '/o/a.MP4': { state: 'ready', play: '/p/a.mp4' } }
    expect(waitingForProxy([clip('a.MP4')], facts)).toEqual([])
  })

  it('is not a clip that is its own proxy', () => {
    const facts: Record<string, ProxyFact> = { '/o/a.MP4': { state: 'own', play: '/o/a.MP4' } }
    expect(waitingForProxy([clip('a.MP4')], facts)).toEqual([])
  })

  /* tried and not made: settled, and the editor opens the clip as it is */
  it('is not a clip whose proxy could not be made', () => {
    const facts: Record<string, ProxyFact> = {
      '/o/a.MP4': { state: 'none', play: '/o/a.MP4', reason: 'ffmpeg gave up' }
    }
    expect(waitingForProxy([clip('a.MP4')], facts)).toEqual([])
  })

  /* a photo has no proxy to wait for, and so no fact */
  it('is not a photo', () => {
    expect(waitingForProxy([clip('G0062266.JPG')], {})).toEqual([])
  })
})
