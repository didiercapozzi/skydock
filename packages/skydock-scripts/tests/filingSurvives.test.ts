// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifest, saveManifest } from '../src/manifest'
import { reclusterGroups } from '../src/clustering'
import { containCrop, fitRatio } from '../src/frameCrop'
import type { Manifest, ManifestFile } from '../src/types'
import { createTmpDir } from './fixtures'

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
        destination: 'Yverdon',
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        files: list
      }
    ],
    destinations: [{ name: 'Yverdon' }]
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
  it('keeps every rectangle a drag can produce', () => {
    for (const at of [0, 0.003, 0.1, 0.3333333333, 0.5, 0.9999999, 1]) {
      const frame = containCrop({ x: at, y: at, width: 1 - at, height: 1 - at })
      saveManifest(manifestPath, filed({ frame }))
      const back = loadManifest(manifestPath)
      expect(back?.groups, `a rectangle at ${at} lost the jumps`).toHaveLength(1)
      expect(back?.groups[0].destination, `a rectangle at ${at} lost the filing`).toBe('Yverdon')
    }
  })

  it('keeps a rectangle fitted to any of the offered shapes', () => {
    for (const ratio of [16 / 9, 9 / 16, 1, 4 / 5, 2, 1440 / 2560]) {
      const frame = fitRatio(ratio, 3840, 2160)
      saveManifest(manifestPath, filed({ frame }))
      expect(loadManifest(manifestPath)?.groups[0].destination, `shape ${ratio}`).toBe('Yverdon')
    }
  })
})

describe('a manifest saved with a mark no longer kept', () => {
  it('still loads, and loses only the mark', () => {
    saveManifest(manifestPath, filed())
    const groupsPath = path.join(outputDir, 'groups.json')
    const saved = JSON.parse(fs.readFileSync(groupsPath, 'utf8'))
    const list = Array.isArray(saved) ? saved : saved.groups
    list[0].paid = true
    fs.writeFileSync(
      groupsPath,
      JSON.stringify(Array.isArray(saved) ? list : { ...saved, groups: list })
    )

    const back = loadManifest(manifestPath)

    expect(back?.groups).toHaveLength(1)
    expect(back?.groups[0].destination).toBe('Yverdon')
    expect(back?.groups[0]).not.toHaveProperty('paid')
  })
})

describe('the saved jumps, when they cannot be read', () => {
  const corrupt = (mutate: (raw: { groups: unknown[] }) => void) => {
    saveManifest(manifestPath, filed())
    const groupsPath = path.join(outputDir, 'groups.json')
    const raw = JSON.parse(fs.readFileSync(groupsPath, 'utf-8'))
    mutate(raw)
    fs.writeFileSync(groupsPath, JSON.stringify(raw))
  }

  it('keeps the jumps when a fraction is a hair out of range', () => {
    corrupt((raw) => {
      const group = raw.groups[0] as { files: { frame?: unknown }[] }
      group.files[0].frame = { x: 0, y: 0, width: 1.0000000000000002, height: 1 }
    })

    const back = loadManifest(manifestPath)
    expect(back?.groups).toHaveLength(1)
    expect(back?.groups[0].destination).toBe('Yverdon')
    expect(back?.groups[0].passenger?.lastname).toBe('Favre')
  })

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

  it('never lets a rescan mint fresh jumps out of filed ones', () => {
    corrupt((raw) => {
      const group = raw.groups[0] as { files: { frame?: unknown }[] }
      group.files[0].frame = { x: -0.0001, y: 0, width: 1, height: 1 }
    })

    let loaded: Manifest | null = null
    try {
      loaded = loadManifest(manifestPath)
    } catch {
      return
    }
    reclusterGroups(loaded!)
    expect(loaded!.groups.map((g) => g.destination)).toEqual(['Yverdon'])
    expect(loaded!.groups.map((g) => g.passenger?.lastname)).toEqual(['Favre'])
  })
})
