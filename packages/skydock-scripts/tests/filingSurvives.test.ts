// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifest, saveManifest } from '../src/manifest'
import { reclusterGroups } from '../src/clustering'
import { containCrop, fitRatio } from '../src/frameCrop'
import type { Manifest, ManifestFile } from '../src/types'
import { createTmpDir } from './fixtures'

/* Where a jump is filed and who it belongs to survives being written down and read back, whatever
   the crop on it: losing it means a day's sorting done again. */

let outputDir: string
let manifestPath: string

const files = (): ManifestFile[] =>
  [0, 1, 2].map((i) => ({
    path: path.join(outputDir, `GX0${i}.MP4`),
    size: 10,
    mtime: 1_760_000_000 + i * 60,
    filename: `GX0${i}.MP4`,
    id: `v${i}`
  }))

const filed = (extra: Partial<ManifestFile> = {}): Manifest => {
  const list = files().map((f, i) => (i === 0 ? { ...f, ...extra } : f))
  return {
    version: 1,
    createdAt: '2026-09-17',
    files: list,
    groups: [
      {
        id: 'jump_7',
        label: 'jump_7',
        day: '17.09.2026',
        destination: 'Tandems',
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        files: list
      }
    ],
    destinations: [{ name: 'Tandems' }]
  }
}

beforeEach(() => {
  outputDir = createTmpDir('skydock-filing-')
  manifestPath = path.join(outputDir, 'manifest.json')
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
})

describe('filing survives being written down and read back', () => {
  /* The seam nothing covered: the cropper's arithmetic was tested on its own and the schema was
     tested by nothing. A rectangle a drag can really produce has to make the round trip. */
  it('keeps every rectangle a drag can produce', () => {
    for (const at of [0, 0.003, 0.1, 0.3333333333, 0.5, 0.9999999, 1]) {
      const frame = containCrop({ x: at, y: at, width: 1 - at, height: 1 - at })
      saveManifest(manifestPath, filed({ frame }))
      const back = loadManifest(manifestPath)
      expect(back?.groups, `a rectangle at ${at} lost the jumps`).toHaveLength(1)
      expect(back?.groups[0].destination, `a rectangle at ${at} lost the filing`).toBe('Tandems')
    }
  })

  it('keeps a rectangle fitted to any of the offered shapes', () => {
    for (const ratio of [16 / 9, 9 / 16, 1, 4 / 5, 2, 1440 / 2560]) {
      const frame = fitRatio(ratio, 3840, 2160)
      saveManifest(manifestPath, filed({ frame }))
      expect(loadManifest(manifestPath)?.groups[0].destination, `shape ${ratio}`).toBe('Tandems')
    }
  })
})

describe('a tandem uploaded before the record was called uploaded', () => {
  it('is still read as uploaded', () => {
    saveManifest(manifestPath, filed())
    const groupsPath = path.join(outputDir, 'groups.json')
    const stored = JSON.parse(fs.readFileSync(groupsPath, 'utf-8'))
    stored.groups[0].delivered = { at: 1, shareUrl: 'https://nas/sharing/abc' }
    fs.writeFileSync(groupsPath, JSON.stringify(stored))

    const read = loadManifest(manifestPath)!
    expect(read.groups[0]?.uploaded).toEqual({ at: 1, shareUrl: 'https://nas/sharing/abc' })

    /* and written back under its name, so the old one does not live on */
    saveManifest(manifestPath, read)
    expect(fs.readFileSync(groupsPath, 'utf-8')).not.toContain('delivered')
  })
})

describe('the saved jumps, when they cannot be read', () => {
  /* Returning "no jumps" for a file that plainly holds some is the worst answer available: the
     next scan re-clusters from nothing, mints new ids and files nothing, and a day of sorting is
     gone with no message. Refusing is recoverable; quietly agreeing is not. */
  const corrupt = (mutate: (raw: { groups: unknown[] }) => void) => {
    saveManifest(manifestPath, filed())
    const groupsPath = path.join(outputDir, 'groups.json')
    const raw = JSON.parse(fs.readFileSync(groupsPath, 'utf-8'))
    mutate(raw)
    fs.writeFileSync(groupsPath, JSON.stringify(raw))
  }

  /* The guarantee is that the jumps survive — not that anything in particular is thrown. A
     fraction a hair out of range is an ordinary result of dividing pixels by pixels, so it is
     pulled back into range and the filing is kept. */
  it('keeps the jumps when a fraction is a hair out of range', () => {
    corrupt((raw) => {
      const group = raw.groups[0] as { files: { frame?: unknown }[] }
      group.files[0].frame = { x: 0, y: 0, width: 1.0000000000000002, height: 1 }
    })

    const back = loadManifest(manifestPath)
    expect(back?.groups).toHaveLength(1)
    expect(back?.groups[0].destination).toBe('Tandems')
    expect(back?.groups[0].passenger?.lastname).toBe('Favre')
  })

  /* Where it truly cannot be understood, refusing is the answer: the file is still on disk and can
     be looked at, while "no jumps" invites the next scan to throw the sorting away. */
  it('are never read as jumps when they are shaped like something else', () => {
    saveManifest(manifestPath, filed())
    fs.writeFileSync(path.join(outputDir, 'groups.json'), JSON.stringify({ groups: 'banana' }))

    expect(() => loadManifest(manifestPath)).toThrow(/jumps file/)
  })

  it('are never read as no jumps at all when the file is unreadable', () => {
    saveManifest(manifestPath, filed())
    fs.writeFileSync(path.join(outputDir, 'groups.json'), '{ this is not json')

    expect(() => loadManifest(manifestPath)).toThrow()
  })

  /* the whole point: whatever goes wrong, a rescan must not quietly unfile everything */
  it('never lets a rescan mint fresh jumps out of filed ones', () => {
    corrupt((raw) => {
      const group = raw.groups[0] as { files: { frame?: unknown }[] }
      group.files[0].frame = { x: -0.0001, y: 0, width: 1, height: 1 }
    })

    let loaded: Manifest | null = null
    try {
      loaded = loadManifest(manifestPath)
    } catch {
      /* refusing is the right answer too, and leaves nothing to re-cluster */
      return
    }
    reclusterGroups(loaded!)
    expect(loaded!.groups.map((g) => g.destination)).toEqual(['Tandems'])
    expect(loaded!.groups.map((g) => g.passenger?.lastname)).toEqual(['Favre'])
  })
})
