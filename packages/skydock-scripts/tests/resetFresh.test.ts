// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyFiles, deleteJump, moveFiles } from '../src/moveFiles'
import { resetFresh, resetFreshTimes } from '../src/resetFresh'
import type { Manifest, ManifestFile } from '../src/types'
import { createTmpDir, execSyncMock, makeFfmpegMock } from './fixtures'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: (await import('./fixtures')).execSyncMock }
})

/* Two ways back to how the cameras left things. A file sent back to be sorted is on the time its
   camera gave it again — a corrected time was only ever for the jump it was in. And Fresh files as a
   whole can be reset, as a scan would first have left them, when starting over beats undoing.
   Real files, whose own timestamps stand in for the camera's clock. */

const CAMERA = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)
/* what somebody set the jump to, a day and an hour on */
const CORRECTED = CAMERA + 90_000

let dir: string

const original = (name: string, offset: number, over: Partial<ManifestFile> = {}): ManifestFile => {
  const target = path.join(dir, 'original_files', name)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, Buffer.alloc(8, offset))
  const shot = new Date((CAMERA + offset) * 1000)
  fs.utimesSync(target, shot, shot)
  return { id: name, path: target, filename: name, size: 8, mtime: CORRECTED + offset, ...over }
}

/* one hand-named jump in Fresh files, re-timed, trimmed; one jump filed to Yverdon */
const board = (): Manifest => {
  const a = original('a.MP4', 0, { cropStart: 1, cropEnd: 5 })
  const b = original('b.MP4', 60, { rotation: 90 })
  const far = original('far.MP4', 7200)
  const y1 = original('y1.MP4', 20_000, { cropStart: 2, cropEnd: 3 })
  const y2 = original('y2.MP4', 20_060)
  return {
    version: 1,
    createdAt: 'x',
    files: [a, b, far, y1, y2].map((f) => ({ ...f })),
    groups: [
      {
        id: 'group_1',
        label: 'group_1',
        name: 'Sunset load',
        day: '02.08.2026',
        files: [a, b, far]
      },
      {
        id: 'group_2',
        label: 'group_2',
        day: '02.08.2026',
        destination: 'Yverdon',
        files: [y1, y2]
      }
    ]
  }
}

beforeEach(() => {
  dir = createTmpDir('skydock-reset-')
  execSyncMock.mockImplementation(makeFfmpegMock())
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('a file sent back to be sorted', () => {
  it('is on the time its camera gave it again', () => {
    const manifest = board()

    moveFiles(manifest, new Set(['a.MP4']), { destination: null })

    expect(manifest.files.find((f) => f.id === 'a.MP4')?.mtime).toBe(CAMERA)
  })

  it('keeps its trim, which is about the clip and not about the jump', () => {
    const manifest = board()

    moveFiles(manifest, new Set(['a.MP4']), { destination: null })

    expect(manifest.files.find((f) => f.id === 'a.MP4')).toMatchObject({ cropStart: 1, cropEnd: 5 })
  })

  it('is, for every file of a jump that is deleted', () => {
    const manifest = board()

    deleteJump(manifest, 'group_1')

    expect(
      manifest.files.filter((f) => f.id !== 'y1.MP4' && f.id !== 'y2.MP4').map((f) => f.mtime)
    ).toEqual([CAMERA, CAMERA + 60, CAMERA + 7200])
  })

  /* moved into another jump, or filed to a place, it is still somewhere its time was decided for */
  it('keeps the time it was given when it goes to another jump or to a place instead', () => {
    const manifest = board()

    moveFiles(manifest, new Set(['a.MP4']), { targetGroupId: 'group_2' })
    moveFiles(manifest, new Set(['b.MP4']), { destination: 'Yverdon' })

    expect(manifest.files.find((f) => f.id === 'a.MP4')?.mtime).toBe(CORRECTED)
    expect(manifest.files.find((f) => f.id === 'b.MP4')?.mtime).toBe(CORRECTED + 60)
  })

  it('keeps the time it has when its original is not there to be asked', () => {
    const manifest = board()
    fs.rmSync(manifest.files[0]!.path)

    moveFiles(manifest, new Set(['a.MP4']), { destination: null })

    expect(manifest.files.find((f) => f.id === 'a.MP4')?.mtime).toBe(CORRECTED)
  })
})

describe('resetting Fresh files', () => {
  it('puts every file back on its camera time, with no trim or turn', () => {
    const manifest = board()

    resetFresh(manifest)

    const a = manifest.files.find((f) => f.id === 'a.MP4')
    expect(a?.mtime).toBe(CAMERA)
    expect(a?.cropStart).toBeUndefined()
    expect(manifest.files.find((f) => f.id === 'b.MP4')?.rotation).toBeUndefined()
  })

  it('makes the jumps again by the gap rule alone, forgetting the ones made and named by hand', () => {
    const manifest = board()

    expect(resetFresh(manifest)).toEqual({ files: 3, jumps: 1 })

    const fresh = manifest.groups.filter((g) => !g.destination)
    expect(fresh.map((g) => g.files.map((f) => f.id))).toEqual([['a.MP4', 'b.MP4']])
    expect(fresh[0]?.name).toBeUndefined()
    /* two hours from the rest, it is loose, as a scan would have left it */
    expect(manifest.groups.some((g) => g.files.some((f) => f.id === 'far.MP4'))).toBe(false)
  })

  it('ends the copies brought into Fresh files, which no scan ever made', () => {
    const manifest = board()
    copyFiles(manifest, new Set(['y1.MP4']), 'group_1')

    resetFresh(manifest)

    expect(manifest.files.some((f) => f.copyOf)).toBe(false)
  })

  /* somebody's work: only what is still to be sorted is reset */
  it('touches nothing filed to a dropzone or a passenger', () => {
    const manifest = board()
    const before = JSON.stringify(manifest.groups.find((g) => g.id === 'group_2'))

    resetFresh(manifest)

    expect(JSON.stringify(manifest.groups.find((g) => g.id === 'group_2'))).toBe(before)
    expect(manifest.files.find((f) => f.id === 'y1.MP4')).toMatchObject({
      mtime: CORRECTED + 20_000,
      cropStart: 2
    })
  })

  it('never touches an original', () => {
    const manifest = board()
    const originals = () => fs.readdirSync(path.join(dir, 'original_files')).sort()
    const before = originals()

    resetFresh(manifest)

    expect(originals()).toEqual(before)
  })

  it('has nothing to do when Fresh files is empty', () => {
    const manifest = board()
    manifest.groups[0]!.destination = 'Yverdon'

    expect(resetFresh(manifest)).toBeNull()
  })
})

/* When the mistake was a correction, only the times go back: everything else that was decided stays. */
describe('resetting only the times of Fresh files', () => {
  it('puts every file back on its camera time', () => {
    const manifest = board()

    expect(resetFreshTimes(manifest)).toEqual({ files: 3, jumps: 1 })

    expect(manifest.files.find((f) => f.id === 'a.MP4')?.mtime).toBe(CAMERA)
    expect(manifest.groups[0]?.files.map((f) => f.mtime)).toEqual([
      CAMERA,
      CAMERA + 60,
      CAMERA + 7200
    ])
  })

  it('keeps the jump, its name, and every trim and turn', () => {
    const manifest = board()

    resetFreshTimes(manifest)

    const jump = manifest.groups[0]
    expect(jump).toMatchObject({ id: 'group_1', name: 'Sunset load' })
    expect(jump?.files.map((f) => f.id)).toEqual(['a.MP4', 'b.MP4', 'far.MP4'])
    expect(jump?.files[0]).toMatchObject({ cropStart: 1, cropEnd: 5 })
    expect(jump?.files[1]?.rotation).toBe(90)
  })

  it('files the jump under the day its files were really shot', () => {
    const manifest = board()

    resetFreshTimes(manifest)

    expect(manifest.groups[0]?.day).toBe('01.08.2026')
  })

  it('touches nothing filed to a dropzone or a passenger', () => {
    const manifest = board()

    resetFreshTimes(manifest)

    expect(manifest.files.find((f) => f.id === 'y1.MP4')?.mtime).toBe(CORRECTED + 20_000)
  })
})
