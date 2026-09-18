// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { deleteTandem, resetTandem } from '../src/resetTandem'
import type { Manifest, ManifestFile, ManifestGroup } from '../src/types'
import { createTmpDir } from './fixtures'

/* Two ways back from a tandem. Reset starts it over from before processing and keeps every decision
   made about it; delete undoes it altogether and sends its jumps back to be sorted. Both take the
   whole passenger, because the passenger is one folder — and neither ever reaches past that folder. */

const CAMERA = Math.floor(new Date(2026, 7, 1, 9, 30, 0).getTime() / 1000)
/* the same clips, after somebody moved them an hour on a wrong camera clock */
const CORRECTED = CAMERA + 3600

let outputDir: string

const clip = (name: string, offset: number): ManifestFile => {
  const source = path.join(outputDir, 'original_files', '2026-08-01', name)
  fs.mkdirSync(path.dirname(source), { recursive: true })
  fs.writeFileSync(source, Buffer.alloc(16, offset))
  const camera = new Date((CAMERA + offset) * 1000)
  fs.utimesSync(source, camera, camera)
  return {
    path: source,
    size: 16,
    mtime: CORRECTED + offset,
    filename: name,
    id: name,
    cropStart: 1,
    cropEnd: 4,
    frame: { x: 0.1, y: 0, width: 0.9, height: 0.9 },
    processed: { path: '/x', size: 1, at: 1, source: { id: name, size: 16, mtime: 1 } }
  }
}

const luc = { firstname: 'Luc', lastname: 'Favre' }

const setup = () => {
  const a = clip('GX01.MP4', 0)
  const b = clip('GX02.MP4', 60)
  const c = clip('GX03.MP4', 7200)
  const groups: ManifestGroup[] = [
    {
      id: 'g1',
      label: 'jump',
      day: '01.08.2026',
      destination: 'Tandems',
      passenger: luc,
      processed: true,
      publish: { shareUrl: 'https://nas/s/1' },
      delivered: { at: 1 },
      files: [a]
    },
    /* a second jump of the same passenger, in the same folder */
    {
      id: 'g2',
      label: 'jump',
      day: '01.08.2026',
      destination: 'Tandems',
      passenger: luc,
      processed: true,
      files: [b]
    },
    {
      id: 'g3',
      label: 'jump',
      day: '01.08.2026',
      destination: 'Tandems',
      passenger: { firstname: 'Ana', lastname: 'Roth' },
      processed: true,
      files: [c]
    }
  ]
  const manifest: Manifest = {
    version: 1,
    createdAt: '2026-08-01',
    files: [a, b, c],
    groups,
    destinations: [{ name: 'Tandems' }]
  }
  const folder = (who: string) => path.join(outputDir, 'processed', 'Tandems', who)
  for (const who of ['Luc Favre', 'Ana Roth']) {
    fs.mkdirSync(path.join(folder(who), 'videos'), { recursive: true })
    fs.writeFileSync(path.join(folder(who), 'videos', 'copy.mp4'), 'copy')
    fs.writeFileSync(path.join(folder(who), 'edit.kdenlive'), '<mlt/>')
    fs.writeFileSync(path.join(folder(who), 'film.mp4'), 'film')
  }
  for (const id of ['g1', 'g2', 'g3']) {
    fs.mkdirSync(path.join(outputDir, 'proxies', 'cut', id), { recursive: true })
    fs.writeFileSync(path.join(outputDir, 'proxies', 'cut', id, 'cut.mp4'), 'cut')
  }
  return { manifest, folder }
}

beforeEach(() => {
  outputDir = createTmpDir('skydock-reset-')
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
})

describe('resetting a tandem', () => {
  it('deletes everything made from it — copies, edit, film and cut proxies', () => {
    const { manifest, folder } = setup()
    resetTandem(manifest, outputDir, 'g1')
    expect(fs.existsSync(folder('Luc Favre'))).toBe(false)
    expect(fs.existsSync(path.join(outputDir, 'proxies', 'cut', 'g1'))).toBe(false)
    expect(fs.existsSync(path.join(outputDir, 'proxies', 'cut', 'g2'))).toBe(false)
  })

  it('keeps every decision: the name, the place, the crops, the frames, the corrected times', () => {
    const { manifest } = setup()
    resetTandem(manifest, outputDir, 'g1')
    const g1 = manifest.groups.find((g) => g.id === 'g1')!
    expect(g1.passenger).toEqual(luc)
    expect(g1.destination).toBe('Tandems')
    expect(g1.files[0]).toMatchObject({ cropStart: 1, cropEnd: 4, mtime: CORRECTED })
    expect(g1.files[0]?.frame).toEqual({ x: 0.1, y: 0, width: 0.9, height: 0.9 })
  })

  it('takes it back to before processing, uploaded record and all', () => {
    const { manifest } = setup()
    resetTandem(manifest, outputDir, 'g1')
    for (const id of ['g1', 'g2']) {
      const g = manifest.groups.find((x) => x.id === id)!
      expect(g.processed).toBeUndefined()
      expect(g.delivered).toBeUndefined()
      expect(g.publish).toBeUndefined()
    }
    expect(manifest.files.find((f) => f.id === 'GX01.MP4')?.processed).toBeUndefined()
  })

  it('leaves another passenger, and the originals, exactly as they were', () => {
    const { manifest, folder } = setup()
    resetTandem(manifest, outputDir, 'g1')
    expect(fs.existsSync(path.join(folder('Ana Roth'), 'edit.kdenlive'))).toBe(true)
    expect(fs.existsSync(path.join(outputDir, 'proxies', 'cut', 'g3'))).toBe(true)
    expect(manifest.groups.find((g) => g.id === 'g3')?.processed).toBe(true)
    expect(fs.existsSync(manifest.files[0]!.path)).toBe(true)
  })
})

describe('deleting a tandem', () => {
  it('sends its jumps back to be sorted, with no name and nothing made from them', () => {
    const { manifest, folder } = setup()
    deleteTandem(manifest, outputDir, 'g1')
    for (const id of ['g1', 'g2']) {
      const g = manifest.groups.find((x) => x.id === id)!
      expect(g.destination).toBeUndefined()
      expect(g.passenger).toBeUndefined()
      expect(g.processed).toBeUndefined()
    }
    expect(fs.existsSync(folder('Luc Favre'))).toBe(false)
  })

  it('forgets the crops, the frames and the corrected times, on the jump and on the file', () => {
    const { manifest } = setup()
    deleteTandem(manifest, outputDir, 'g1')
    const ref = manifest.groups.find((g) => g.id === 'g1')!.files[0]!
    const file = manifest.files.find((f) => f.id === 'GX01.MP4')!
    for (const f of [ref, file]) {
      expect(f.cropStart).toBeUndefined()
      expect(f.cropEnd).toBeUndefined()
      expect(f.frame).toBeUndefined()
      /* back on the time the camera gave it */
      expect(f.mtime).toBe(CAMERA)
    }
  })

  it('leaves another passenger alone', () => {
    const { manifest, folder } = setup()
    deleteTandem(manifest, outputDir, 'g1')
    expect(manifest.groups.find((g) => g.id === 'g3')?.passenger?.firstname).toBe('Ana')
    expect(fs.existsSync(folder('Ana Roth'))).toBe(true)
  })

  it('refuses a jump that is not a named tandem', () => {
    const { manifest } = setup()
    manifest.groups.push({ id: 'g4', label: 'jump', day: '01.08.2026', files: [] })
    expect(() => deleteTandem(manifest, outputDir, 'g4')).toThrow(/named tandem/)
  })
})
