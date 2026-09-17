// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { saveManifest } from '@skydock/scripts'
import type { Manifest, ManifestFile, ManifestGroup } from '@skydock/scripts'
import { action } from '../../app/routes/api.manifest'
import { createTmpDir } from './fixtures'

/* Nearly every change the board makes goes through this one route, and none of it was covered.
   These drive the action the way the board does — a real request against a real manifest on disk —
   and read what came back, so a refusal that stops saying why, or a mutation that stops happening,
   is caught here rather than in front of a card of footage. */

type Refusal = { success: false; status: number; globalErrors?: string[] }
type Answer = { groups: ManifestGroup[]; looseFiles: ManifestFile[] }

const refusal = (res: unknown) => res as Refusal
const answer = (res: unknown) => res as Answer

const file = (over: Partial<ManifestFile> & { id: string }): ManifestFile => ({
  path: `/src/${over.id}.mp4`,
  size: 10,
  mtime: 1_754_000_000,
  filename: `${over.id}.mp4`,
  ...over
})

const group = (over: Partial<ManifestGroup> & { id: string }): ManifestGroup => ({
  label: 'yverdon',
  day: '01.08.2026',
  files: [],
  ...over
})

describe('api/manifest', () => {
  let tmpDir: string
  let previousOutputDir: string | undefined

  beforeEach(() => {
    tmpDir = createTmpDir('skydock-api-manifest-')
    previousOutputDir = process.env.SKYDOCK_OUTPUT_DIR
    process.env.SKYDOCK_OUTPUT_DIR = tmpDir
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    if (previousOutputDir === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
    else process.env.SKYDOCK_OUTPUT_DIR = previousOutputDir
  })

  const writeManifest = (groups: ManifestGroup[], files: ManifestFile[] = []) => {
    const manifest: Manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      files: files.length > 0 ? files : groups.flatMap((g) => g.files),
      groups,
      destinations: [{ name: 'Yverdon' }]
    }
    saveManifest(path.join(tmpDir, 'manifest.json'), manifest)
    return manifest
  }

  const send = async (body: Record<string, unknown>) =>
    await action({
      request: new Request('http://localhost/api/manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    } as Parameters<typeof action>[0])

  it('refuses everything before a scan has ever run', async () => {
    const res = refusal(await send({ intent: 'save-groups' }))
    expect(res.success).toBe(false)
    expect(res.globalErrors?.[0]).toContain('No manifest')
  })

  describe('merge-groups', () => {
    it('makes two jumps one, keeping every file', async () => {
      writeManifest([
        group({
          id: 'group_1',
          files: [file({ id: 'a' }), file({ id: 'b', mtime: 1_754_000_060 })]
        }),
        group({ id: 'group_2', files: [file({ id: 'c', mtime: 1_754_003_000 })] })
      ])

      const res = answer(
        await send({ intent: 'merge-groups', leftId: 'group_1', rightId: 'group_2' })
      )

      expect(res.groups).toHaveLength(1)
      expect(res.groups[0].files.map((f) => f.id)).toEqual(['a', 'b', 'c'])
    })

    /* two cameras on one jump, one of them on the wrong clock: the merged jump is put back on the
       time the right one says, and everything in it moves by the same amount */
    it('re-times the merged jump onto the anchor it was given', async () => {
      writeManifest([
        group({ id: 'group_1', files: [file({ id: 'a', mtime: 1_754_000_000 })] }),
        group({ id: 'group_2', files: [file({ id: 'c', mtime: 1_754_000_100 })] })
      ])

      const res = answer(
        await send({
          intent: 'merge-groups',
          leftId: 'group_1',
          rightId: 'group_2',
          anchorEpoch: 1_754_000_500
        })
      )

      const times = res.groups[0].files.map((f) => f.mtime).sort((x, y) => x - y)
      expect(times[0]).toBe(1_754_000_500)
      /* the gap between them is what it always was */
      expect(times[1] - times[0]).toBe(100)
    })

    it('needs both jumps named', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const res = refusal(await send({ intent: 'merge-groups', leftId: 'group_1' }))
      expect(res.globalErrors?.[0]).toContain('two group ids')
    })
  })

  describe('shift-group-time', () => {
    it('moves every file by the same amount, so the jump keeps its shape', async () => {
      writeManifest([
        group({
          id: 'group_1',
          files: [file({ id: 'a', mtime: 1_754_000_000 }), file({ id: 'b', mtime: 1_754_000_090 })]
        })
      ])

      const res = answer(
        await send({ intent: 'shift-group-time', groupId: 'group_1', anchorEpoch: 1_754_002_000 })
      )

      expect(res.groups[0].files.map((f) => f.mtime)).toEqual([1_754_002_000, 1_754_002_090])
    })

    it('refuses an anchor that is not a time', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const res = refusal(await send({ intent: 'shift-group-time', groupId: 'group_1' }))
      expect(res.globalErrors?.[0]).toContain('anchor')
    })

    it('refuses a jump that is not there', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const res = refusal(
        await send({ intent: 'shift-group-time', groupId: 'nope', anchorEpoch: 1_754_002_000 })
      )
      expect(res.globalErrors?.[0]).toContain('not found')
    })
  })

  describe('move-files', () => {
    it('re-files a file into another jump', async () => {
      writeManifest([
        group({ id: 'group_1', files: [file({ id: 'a' }), file({ id: 'b' })] }),
        group({ id: 'group_2', files: [file({ id: 'c' })] })
      ])

      const res = answer(
        await send({ intent: 'move-files', fileIds: ['b'], targetGroupId: 'group_2' })
      )

      const byId = Object.fromEntries(res.groups.map((g) => [g.id, g.files.map((f) => f.id)]))
      expect(byId.group_1).toEqual(['a'])
      expect(byId.group_2?.sort()).toEqual(['b', 'c'])
    })

    /* a file that leaves its jump is not the file that was processed and sent, so what was recorded
       about it goes with it — otherwise the board would show it as delivered from a folder it is no
       longer part of */
    it('drops what was recorded about a file that moves', async () => {
      const moved = file({
        id: 'b',
        processed: { path: '/out/b.mp4', size: 10, at: 1, source: { id: 'b', size: 10, mtime: 1 } },
        uploaded: { remotePath: '/nas/b.mp4', md5: 'x', size: 10, localPath: '/out/b.mp4', at: 1 }
      })
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' }), moved] })])

      const res = answer(
        await send({ intent: 'move-files', fileIds: ['b'], destination: 'Yverdon' })
      )

      const still = res.looseFiles.find((f) => f.id === 'b')
      expect(still?.processed).toBeUndefined()
      expect(still?.uploaded).toBeUndefined()
      expect(still?.destination).toBe('Yverdon')
    })

    it('needs at least one file', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const res = refusal(await send({ intent: 'move-files', fileIds: [] }))
      expect(res.globalErrors?.[0]).toContain('at least one file')
    })
  })

  describe('regroup-loose', () => {
    it('says so rather than pretending, when there is nothing loose to regroup', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' }), file({ id: 'b' })] })])
      const res = refusal(await send({ intent: 'regroup-loose' }))
      expect(res.globalErrors?.[0]).toContain('Nothing to regroup')
    })
  })

  describe('upload-group', () => {
    it('needs something to upload', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const res = refusal(await send({ intent: 'upload-group' }))
      expect(res.globalErrors?.[0]).toContain('needs a group or a destination')
    })

    /* the reason this route was worth covering at all: a tandem's files go to two different
       folders, and an upload sends one whole */
    it('refuses a tandem and says to deliver it instead', async () => {
      writeManifest([
        group({
          id: 'group_1',
          destination: 'Tandems',
          passenger: { firstname: 'Luc', lastname: 'Favre' },
          processed: true,
          files: [file({ id: 'a' })]
        })
      ])

      const res = refusal(await send({ intent: 'upload-group', groupId: 'group_1' }))

      expect(res.success).toBe(false)
      expect(res.globalErrors?.[0]).toContain('Deliver')
    })
  })

  describe('montage', () => {
    it('is only for a tandem', async () => {
      writeManifest([
        group({
          id: 'group_1',
          destination: 'Yverdon',
          processed: true,
          files: [file({ id: 'a' })]
        })
      ])
      const res = refusal(await send({ intent: 'montage', groupId: 'group_1' }))
      expect(res.success).toBe(false)
    })

    it('will not start one before the files have been prepared', async () => {
      writeManifest([
        group({
          id: 'group_1',
          destination: 'Tandems',
          passenger: { firstname: 'Luc', lastname: 'Favre' },
          files: [file({ id: 'a' })]
        })
      ])
      const res = refusal(await send({ intent: 'montage', groupId: 'group_1' }))
      expect(res.success).toBe(false)
    })
  })

  describe('open-montage', () => {
    it('has nothing to open before a montage was made', async () => {
      writeManifest([
        group({
          id: 'group_1',
          destination: 'Tandems',
          passenger: { firstname: 'Luc', lastname: 'Favre' },
          files: [file({ id: 'a' })]
        })
      ])
      const res = refusal(await send({ intent: 'open-montage', groupId: 'group_1' }))
      expect(res.globalErrors?.[0]).toContain('no project yet')
    })
  })

  describe('save-groups', () => {
    it('needs the list it is meant to save', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const res = refusal(await send({ intent: 'save-groups' }))
      expect(res.globalErrors?.[0]).toContain('needs groups')
    })

    /* a crop is saved onto the registry entry, and only the fields that were sent — a blind spread
       here would let a stale copy of everything else overwrite what the server knows */
    it('applies a crop to a lone file without touching the rest of it', async () => {
      const lone = file({ id: 'z', destination: 'Yverdon', size: 999 })
      writeManifest([], [lone])

      await send({
        intent: 'save-groups',
        groups: [],
        fileUpdates: [{ ...lone, size: 1, cropStart: 2, cropEnd: 8 }]
      })

      const res = answer(await send({ intent: 'save-groups', groups: [] }))
      const saved = res.looseFiles.find((f) => f.id === 'z')
      expect(saved?.cropStart).toBe(2)
      expect(saved?.cropEnd).toBe(8)
      /* size is what the disk measures, not something a form gets to rewrite */
      expect(saved?.size).toBe(999)
    })
  })
})
