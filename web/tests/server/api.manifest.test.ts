import * as fs from 'node:fs'
import * as path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  EDIT_LOCKED,
  getGroupProcessedDir,
  loadManifestAsync,
  runUpload,
  saveManifest,
  uploadingNow,
  UPLOADED_LOCKED
} from '@skydock/scripts'
import { stopIfUploadCancelled } from '../../../packages/skydock-scripts/src/uploading'
import type { Manifest, ManifestFile, ManifestGroup } from '@skydock/scripts'
import { action } from '../../app/routes/api.manifest'
import { createTmpDir, routeArgs } from './fixtures'

type Refusal = { success: false; status: number; globalErrors?: string[] }
type Answer = {
  groups: ManifestGroup[]
  looseFiles: ManifestFile[]
  copied?: { files: number }
}

const refusal = (res: unknown) => res as Refusal
const answer = (res: unknown) => res as Answer
const idsByGroup = (res: Answer) =>
  Object.fromEntries(res.groups.map((g) => [g.id, g.files.map((f) => f.id)]))

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

describe('changes made on the board', () => {
  let tmpDir: string
  const previous: Record<string, string | undefined> = {}
  const keys = ['SKYDOCK_OUTPUT_DIR', 'SKYDOCK_CONFIG_DIR', 'SKYDOCK_TRASH_DIR']

  beforeEach(() => {
    tmpDir = createTmpDir('skydock-api-manifest-')
    for (const key of keys) previous[key] = process.env[key]
    process.env.SKYDOCK_OUTPUT_DIR = tmpDir
    process.env.SKYDOCK_CONFIG_DIR = tmpDir
    process.env.SKYDOCK_TRASH_DIR = path.join(tmpDir, '.trash')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  })

  const writeManifest = async (
    groups: ManifestGroup[],
    files: ManifestFile[] = [],
    version = 1
  ) => {
    const manifest: Manifest = {
      version,
      createdAt: new Date().toISOString(),
      files: files.length > 0 ? files : groups.flatMap((g) => g.files),
      groups,
      destinations: [{ name: 'Yverdon' }]
    }
    await saveManifest(path.join(tmpDir, 'manifest.json'), manifest)
    return manifest
  }

  const send = async (body: Record<string, unknown>) =>
    await action(
      routeArgs(
        new Request('http://localhost/api/manifest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
      )
    )

  describe('merging two jumps', () => {
    it('makes two jumps one, keeping every file', async () => {
      await writeManifest([
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

    it('re-times the merged jump onto the start it was given', async () => {
      await writeManifest([
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
      expect(times[1] - times[0]).toBe(100)
    })
  })

  describe('re-timing a jump', () => {
    it('moves every file by the same amount, so the jump keeps its shape', async () => {
      await writeManifest([
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
  })

  describe('moving files', () => {
    it('re-files a file into another jump', async () => {
      await writeManifest([
        group({ id: 'group_1', files: [file({ id: 'a' }), file({ id: 'b' })] }),
        group({ id: 'group_2', files: [file({ id: 'c' })] })
      ])

      const res = answer(
        await send({ intent: 'move-files', fileIds: ['b'], targetGroupId: 'group_2' })
      )

      const byId = idsByGroup(res)
      expect(byId.group_1).toEqual(['a'])
      expect(byId.group_2?.sort()).toEqual(['b', 'c'])
    })

    it('drops what was recorded about a file that moves', async () => {
      const moved = file({
        id: 'b',
        processed: { path: '/out/b.mp4', size: 10, at: 1, source: { id: 'b', size: 10, mtime: 1 } }
      })
      await writeManifest([group({ id: 'group_1', files: [file({ id: 'a' }), moved] })])

      const res = answer(
        await send({ intent: 'move-files', fileIds: ['b'], destination: 'Yverdon' })
      )

      const still = res.looseFiles.find((f) => f.id === 'b')
      expect(still?.processed).toBeUndefined()
      expect(still?.destination).toBe('Yverdon')
    })

    it('refuses a file that is on the storage', async () => {
      const up = file({
        id: 'b',
        uploaded: { remotePath: '/nas/b.mp4', md5: 'x', size: 10, localPath: '/out/b.mp4', at: 1 }
      })
      await writeManifest([group({ id: 'group_1', files: [file({ id: 'a' }), up] })])

      const res = refusal(
        await send({ intent: 'move-files', fileIds: ['b'], destination: 'Yverdon' })
      )

      expect(res.globalErrors?.[0]).toBe(UPLOADED_LOCKED)
      expect(
        (await loadManifestAsync(path.join(tmpDir, 'manifest.json')))?.groups[0]?.files
      ).toHaveLength(2)
    })
  })

  describe('uploading a dropzone', () => {
    it('refuses a montage, which is uploaded from its own page', async () => {
      await writeManifest([
        group({
          id: 'group_1',
          montageJump: true,
          passenger: { firstname: 'Luc', lastname: 'Favre' },
          processed: true,
          files: [file({ id: 'a' })]
        })
      ])

      const res = refusal(await send({ intent: 'upload-group', groupId: 'group_1' }))

      expect(res.success).toBe(false)
      expect(res.globalErrors?.[0]).toContain('from its own card')
    })
  })

  describe('an upload going', () => {
    const going = () =>
      runUpload({ key: 'montage:group_1', label: 'Luc Favre' }, async () => {
        for (;;) {
          stopIfUploadCancelled()
          await sleep(5)
        }
      })

    it('is stopped when cancelled, and the board hears once it has stopped', async () => {
      await writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const upload = going()
      upload.catch(() => undefined)

      const res = (await send({ intent: 'cancel-upload' })) as { uploadCancelled?: boolean }

      expect(res.uploadCancelled).toBe(true)
      expect(uploadingNow()).toBeNull()
      await expect(upload).rejects.toThrow(/Upload cancelled/)
    })

    it('has nothing to cancel when nothing is uploading', async () => {
      await writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const res = refusal(await send({ intent: 'cancel-upload' }))
      expect(res.globalErrors?.[0]).toContain('Nothing is being uploaded')
    })

    it('is waited for by a page that comes back to it', async () => {
      await writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const upload = going()
      upload.catch(() => undefined)
      const waiting = send({ intent: 'upload-wait' })
      let answered = false
      void waiting.then(() => (answered = true))
      await sleep(30)
      expect(answered).toBe(false)

      await send({ intent: 'cancel-upload' })

      expect(answer(await waiting).groups).toHaveLength(1)
    })
  })

  describe('the montage', () => {
    it('is only for a montage', async () => {
      await writeManifest([
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

    it('will not start one before the files have been processed', async () => {
      await writeManifest([
        group({
          id: 'group_1',
          montageJump: true,
          passenger: { firstname: 'Luc', lastname: 'Favre' },
          files: [file({ id: 'a' })]
        })
      ])
      const res = refusal(await send({ intent: 'montage', groupId: 'group_1' }))
      expect(res.success).toBe(false)
    })

    it('is made once: asked again for a montage that has a project, it is refused', async () => {
      await writeManifest([
        group({
          id: 'group_1',
          montageJump: true,
          passenger: { firstname: 'Luc', lastname: 'Favre' },
          processed: true,
          files: [file({ id: 'a' })]
        })
      ])
      const folder = path.join(tmpDir, 'processed', 'Montages', 'Luc Favre')
      fs.mkdirSync(folder, { recursive: true })
      fs.writeFileSync(path.join(folder, 'the edit.kdenlive'), '<mlt/>')

      const res = refusal(await send({ intent: 'montage', groupId: 'group_1' }))

      expect(res.globalErrors?.[0]).toContain('already has a project')
      expect(fs.readFileSync(path.join(folder, 'the edit.kdenlive'), 'utf-8')).toBe('<mlt/>')
    })

    it('waits while a clip is still getting its proxy, and says how many', async () => {
      const here = (id: string) => {
        const at = path.join(tmpDir, `${id}.mp4`)
        fs.writeFileSync(at, 'x')
        return file({ id, path: at })
      }
      await writeManifest([
        group({
          id: 'group_1',
          montageJump: true,
          passenger: { firstname: 'Luc', lastname: 'Favre' },
          processed: true,
          files: [here('a'), here('b')]
        })
      ])
      fs.mkdirSync(path.join(tmpDir, 'processed', 'Montages', 'Luc Favre', 'videos'), {
        recursive: true
      })

      const res = refusal(await send({ intent: 'montage', groupId: 'group_1' }))

      expect(res.globalErrors?.[0]).toContain('2 clips are still getting a proxy')
      expect(fs.readdirSync(path.join(tmpDir, 'processed', 'Montages', 'Luc Favre'))).toEqual([
        'videos'
      ])
    })
  })

  describe('preparing a montage that has an edit', () => {
    it('is allowed, and leaves its project where it is', async () => {
      await writeManifest([
        group({
          id: 'group_1',
          montageJump: true,
          passenger: { firstname: 'Luc', lastname: 'Favre' },
          processed: true,
          files: []
        })
      ])
      const folder = path.join(tmpDir, 'processed', 'Montages', 'Luc Favre')
      fs.mkdirSync(folder, { recursive: true })
      fs.writeFileSync(path.join(folder, 'luc.kdenlive'), '<mlt/>')

      const res = answer(await send({ intent: 'process', groupId: 'group_1' }))

      expect(res.groups).toHaveLength(1)
      expect(fs.readFileSync(path.join(folder, 'luc.kdenlive'), 'utf-8')).toBe('<mlt/>')
    })
  })

  describe('opening the project', () => {
    it('has nothing to open before a montage was made', async () => {
      await writeManifest([
        group({
          id: 'group_1',
          montageJump: true,
          passenger: { firstname: 'Luc', lastname: 'Favre' },
          files: [file({ id: 'a' })]
        })
      ])
      const res = refusal(await send({ intent: 'open-montage', groupId: 'group_1' }))
      expect(res.globalErrors?.[0]).toContain('no project yet')
    })
  })

  describe('freeing space', () => {
    it('refuses while the storage cannot be reached, and deletes nothing', async () => {
      await writeManifest([
        group({
          id: 'group_1',
          montageJump: true,
          passenger: { firstname: 'Luc', lastname: 'Favre' },
          processed: true,
          uploaded: { at: 1 },
          files: [file({ id: 'a' })]
        })
      ])
      const res = refusal(await send({ intent: 'free-montage', groupId: 'group_1' }))
      expect(res.globalErrors?.[0]).toContain('Connect the storage')
    })
  })

  describe('marking the email as sent', () => {
    const uploaded = (folder: string) =>
      group({
        id: 'group_1',
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        uploaded: {
          at: 1,
          film: {
            remotePath: `${folder}/luc.mp4`,
            md5: 'x',
            size: 1,
            localPath: '/p/luc.mp4',
            at: 1
          }
        },
        files: [file({ id: 'a' })]
      })
    const emailedOf = async () =>
      (await loadManifestAsync(path.join(tmpDir, 'manifest.json')))?.groups.find(
        (g) => g.id === 'group_1'
      )?.emailed

    it('is kept on the board while the storage cannot be reached, and taken back', async () => {
      await writeManifest([uploaded('/SkyDock/Passengers/Luc Favre')])
      const folder = '/SkyDock/Passengers/Luc Favre'

      await send({ intent: 'mark-emailed', emailed: { folder, to: 'luc@x.ch', sent: true } })
      expect(await emailedOf()).toMatchObject({ to: 'luc@x.ch' })

      await send({ intent: 'mark-emailed', emailed: { folder, sent: false } })
      expect(await emailedOf()).toBeUndefined()
    })

    it('refuses a montage that is nowhere', async () => {
      await writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const res = refusal(
        await send({
          intent: 'mark-emailed',
          emailed: { folder: '/SkyDock/Passengers/Nobody', sent: true }
        })
      )
      expect(res.globalErrors?.[0]).toContain('not on the board')
    })
  })

  describe('saving the board', () => {
    it('refuses a new dropzone named like the montages’ folder, whatever its case', async () => {
      await writeManifest([])

      const res = refusal(
        await send({
          intent: 'save-groups',
          groups: [],
          destinations: [{ name: 'Yverdon' }, { name: 'montages' }]
        })
      )

      expect(res.globalErrors?.[0]).toContain('montages are kept')
    })

    it('applies a crop to a lone file without touching the rest of it', async () => {
      const lone = file({ id: 'z', destination: 'Yverdon', size: 999 })
      await writeManifest([], [lone])

      await send({
        intent: 'save-groups',
        groups: [],
        fileUpdates: [{ ...lone, size: 1, cropStart: 2, cropEnd: 8 }]
      })

      const res = answer(await send({ intent: 'save-groups', groups: [] }))
      const saved = res.looseFiles.find((f) => f.id === 'z')
      expect(saved?.cropStart).toBe(2)
      expect(saved?.cropEnd).toBe(8)
      expect(saved?.size).toBe(999)
    })

    it('refuses a crop on a file that is on the storage, and changes nothing', async () => {
      const up = file({
        id: 'z',
        destination: 'Yverdon',
        cropStart: 2,
        uploaded: { remotePath: '/nas/z.mp4', md5: 'x', size: 10, localPath: '/out/z.mp4', at: 1 }
      })
      await writeManifest([], [up])

      const res = refusal(
        await send({ intent: 'save-groups', groups: [], fileUpdates: [{ ...up, cropStart: 5 }] })
      )

      expect(res.globalErrors?.[0]).toBe(UPLOADED_LOCKED)
      expect(
        (await loadManifestAsync(path.join(tmpDir, 'manifest.json')))?.files[0]?.cropStart
      ).toBe(2)
    })

    it('keeps a jump’s upload and link when a page that never saw them saves', async () => {
      const a = file({ id: 'a' })
      await writeManifest([
        group({
          id: 'group_1',
          files: [a],
          uploaded: { at: 5, shareUrl: 'https://nas/sharing/x' },
          publish: { shareUrl: 'https://nas/sharing/x' }
        })
      ])

      const res = answer(
        await send({ intent: 'save-groups', groups: [group({ id: 'group_1', files: [a] })] })
      )

      expect(res.groups[0]).toMatchObject({
        uploaded: { at: 5, shareUrl: 'https://nas/sharing/x' },
        publish: { shareUrl: 'https://nas/sharing/x' }
      })
    })

    it('saves an uploaded file sent back exactly as it is', async () => {
      const up = file({
        id: 'z',
        destination: 'Yverdon',
        cropStart: 2,
        uploaded: { remotePath: '/nas/z.mp4', md5: 'x', size: 10, localPath: '/out/z.mp4', at: 1 }
      })
      await writeManifest([], [up])

      const res = answer(await send({ intent: 'save-groups', groups: [], fileUpdates: [up] }))

      expect(res.looseFiles[0]?.cropStart).toBe(2)
    })
  })

  describe('a montage with an edit', () => {
    const luc = () =>
      group({
        id: 'group_1',
        montageJump: true,
        passenger: { firstname: 'Luc', lastname: 'Favre' },
        processed: true,
        files: [file({ id: 'a' }), file({ id: 'b', mtime: 1_754_000_060 })]
      })
    const other = () => group({ id: 'group_2', files: [file({ id: 'c', mtime: 1_754_003_000 })] })

    const projectPath = () => {
      const { dir, baseName } = getGroupProcessedDir(tmpDir, luc())
      return path.join(dir, `${baseName}.kdenlive`)
    }

    beforeEach(async () => {
      await writeManifest([luc(), other()])
      fs.mkdirSync(path.dirname(projectPath()), { recursive: true })
      fs.writeFileSync(projectPath(), '<mlt/>')
    })

    const refused = async (res: unknown) => {
      expect(refusal(res).globalErrors?.[0]).toBe(EDIT_LOCKED)
      expect((await loadManifestAsync(path.join(tmpDir, 'manifest.json')))?.groups[0]).toEqual(
        luc()
      )
    }

    it('refuses a crop on one of its clips', async () => {
      const cropped = luc()
      cropped.files[0] = { ...cropped.files[0]!, cropStart: 1, cropEnd: 3 }
      await refused(await send({ intent: 'save-groups', groups: [cropped, other()] }))
    })

    it('refuses a new name, which would move the folder the edit is in', async () => {
      await refused(
        await send({
          intent: 'save-groups',
          groups: [{ ...luc(), passenger: { firstname: 'Luc', lastname: 'Favrè' } }, other()]
        })
      )
    })

    it('refuses another jump joining that passenger', async () => {
      await refused(
        await send({
          intent: 'save-groups',
          groups: [
            luc(),
            {
              ...other(),
              montageJump: true,
              passenger: { firstname: 'Luc', lastname: 'Favre' }
            }
          ]
        })
      )
    })

    it('refuses files moving out of it or into it', async () => {
      await refused(await send({ intent: 'move-files', fileIds: ['a'], destination: 'Yverdon' }))
      await refused(await send({ intent: 'move-files', fileIds: ['c'], targetGroupId: 'group_1' }))
    })

    it('refuses re-timing and merging it', async () => {
      await refused(
        await send({ intent: 'shift-group-time', groupId: 'group_1', anchorEpoch: 1_754_009_000 })
      )
      await refused(await send({ intent: 'merge-groups', leftId: 'group_2', rightId: 'group_1' }))
    })

    it('lets it be prepared again', async () => {
      const res = answer(await send({ intent: 'process', groupId: 'group_1' }))
      expect(res.groups).toHaveLength(2)
    })

    it('still lets the rest of the board be saved around it', async () => {
      const res = answer(
        await send({
          intent: 'save-groups',
          groups: [luc(), { ...other(), destination: 'Yverdon' }]
        })
      )
      expect(res.groups.find((g) => g.id === 'group_2')?.destination).toBe('Yverdon')
    })

    it('can still be reset, which takes the edit with it and keeps the name and crops', async () => {
      const cropped = luc()
      cropped.files[0] = { ...cropped.files[0]!, cropStart: 1, cropEnd: 3 }
      await writeManifest([cropped, other()])
      const res = answer(await send({ intent: 'reset-montage', groupId: 'group_1' }))
      expect(fs.existsSync(projectPath())).toBe(false)
      const g = res.groups.find((x) => x.id === 'group_1')
      expect(g?.processed).toBeUndefined()
      expect(g?.passenger).toEqual({ firstname: 'Luc', lastname: 'Favre' })
      expect(g?.files[0]?.cropStart).toBe(1)
    })

    it('can be deleted, which sends its jump back to be sorted', async () => {
      const res = answer(await send({ intent: 'delete-montage', groupId: 'group_1' }))
      expect(fs.existsSync(projectPath())).toBe(false)
      const g = res.groups.find((x) => x.id === 'group_1')
      expect(g?.destination).toBeUndefined()
      expect(g?.passenger).toBeUndefined()
    })

    it('is lifted by deleting the project', async () => {
      fs.rmSync(projectPath())
      const cropped = luc()
      cropped.files[0] = { ...cropped.files[0]!, cropStart: 1, cropEnd: 3 }
      const res = answer(await send({ intent: 'save-groups', groups: [cropped, other()] }))
      expect(res.groups[0]?.files[0]?.cropStart).toBe(1)
    })
  })

  it('makes a jump in Fresh files from loose files picked by hand', async () => {
    await writeManifest([], [file({ id: 'a' }), file({ id: 'b', mtime: 1_754_000_060 })])

    const res = answer(await send({ intent: 'move-files', fileIds: ['a', 'b'], newGroup: true }))

    expect(res.groups).toHaveLength(1)
    expect(res.groups[0]?.destination).toBeUndefined()
    expect(res.groups[0]?.files.map((f) => f.id)).toEqual(['a', 'b'])
    expect(res.looseFiles).toHaveLength(0)
  })

  it('makes the jump with the name and the start it was given', async () => {
    await writeManifest([], [file({ id: 'a' }), file({ id: 'b', mtime: 1_754_000_060 })])

    const res = answer(
      await send({
        intent: 'move-files',
        fileIds: ['a', 'b'],
        newGroup: true,
        name: 'Sunset load',
        anchorEpoch: 1_754_100_000
      })
    )

    expect(res.groups[0]?.name).toBe('Sunset load')
    expect(res.groups[0]?.files.map((f) => f.mtime)).toEqual([1_754_100_000, 1_754_100_060])
  })

  describe('resetting Fresh files', () => {
    it('forgets the jumps made and named by hand, and the trims, leaving what is filed alone', async () => {
      await writeManifest([
        group({
          id: 'g1',
          name: 'Sunset load',
          files: [
            file({ id: 'a', cropStart: 1, cropEnd: 4 }),
            file({ id: 'b', mtime: 1_754_000_060 })
          ]
        }),
        group({
          id: 'g2',
          destination: 'Yverdon',
          files: [file({ id: 'c', cropStart: 2, cropEnd: 3 })]
        })
      ])

      const res = (await send({ intent: 'reset-fresh', resetWhat: 'everything' })) as Answer & {
        reset: { files: number; jumps: number; what: string }
      }

      expect(res.reset).toEqual({ files: 2, jumps: 1, what: 'everything' })
      const fresh = res.groups.find((g) => !g.destination)
      expect(fresh?.name).toBeUndefined()
      expect(fresh?.files[0]?.cropStart).toBeUndefined()
      expect(res.groups.find((g) => g.destination === 'Yverdon')?.files[0]?.cropStart).toBe(2)
    })
  })

  describe('copying files into another jump', () => {
    const two = () =>
      writeManifest([
        group({ id: 'g1', files: [file({ id: 'a' }), file({ id: 'b' })] }),
        group({ id: 'g2', files: [file({ id: 'c', mtime: 1_754_007_200 })] })
      ])

    it('leaves them where they were and gives the other jump copies of its own', async () => {
      await two()

      const res = answer(await send({ intent: 'copy-files', fileIds: ['a'], targetGroupId: 'g2' }))

      const byId = idsByGroup(res)
      expect(byId.g1).toEqual(['a', 'b'])
      expect(byId.g2).toEqual(['a~1', 'c'])
      expect(res.groups[1]?.files[0]).toMatchObject({ copyOf: 'a', path: '/src/a.mp4' })
    })

    it('says so when the jump already holds them', async () => {
      await two()
      await send({ intent: 'copy-files', fileIds: ['a'], targetGroupId: 'g2' })

      const again = refusal(
        await send({ intent: 'copy-files', fileIds: ['a'], targetGroupId: 'g2' })
      )

      expect(again.globalErrors?.[0]).toContain('already holds')
    })

    it('ends a copy that is sent back, leaving the original in its jump', async () => {
      await two()
      await send({ intent: 'copy-files', fileIds: ['a'], targetGroupId: 'g2' })

      const res = answer(await send({ intent: 'move-files', fileIds: ['a~1'] }))

      expect(res.looseFiles).toEqual([])
      const byId = idsByGroup(res)
      expect(byId).toEqual({ g1: ['a', 'b'], g2: ['c'] })
    })
  })

  describe('making a montage', () => {
    const board = () =>
      writeManifest([
        group({ id: 'fresh', files: [file({ id: 'a' }), file({ id: 'b' })] }),
        group({
          id: 'yv',
          destination: 'Yverdon',
          files: [file({ id: 'c', mtime: 1_754_007_200, cropStart: 3 })]
        })
      ])

    it('moves files still in Fresh files into a montage of that name', async () => {
      await board()

      const res = answer(
        await send({ intent: 'make-montage', fileIds: ['a', 'b'], name: 'Luc Favre' })
      )

      const made = res.groups.find((g) => g.montageJump)
      expect(made?.passenger).toEqual({ firstname: 'Luc', lastname: 'Favre' })
      expect(made?.files.map((f) => f.id)).toEqual(['a', 'b'])
      expect(res.groups.find((g) => g.id === 'fresh')).toBeUndefined()
    })

    it('copies files a dropzone holds, adjusted as they are, and leaves the dropzone its own', async () => {
      await board()

      const res = answer(
        await send({ intent: 'make-montage', fileIds: ['c'], name: 'Boogie 2026' })
      )

      const made = res.groups.find((g) => g.montageJump)
      expect(res.copied?.files).toBe(1)
      expect(made?.files).toMatchObject([{ copyOf: 'c', cropStart: 3 }])
      expect(res.groups.find((g) => g.id === 'yv')?.files.map((f) => f.id)).toEqual(['c'])
    })

    it('joins a montage that has the name already, however it is written', async () => {
      await board()
      await send({ intent: 'make-montage', fileIds: ['a'], name: 'Luc Favre' })

      const res = answer(await send({ intent: 'make-montage', fileIds: ['c'], name: 'luc favre' }))

      const jumps = res.groups.filter((g) => g.montageJump)
      expect(jumps).toHaveLength(2)
      expect(jumps[1]?.passenger).toEqual(jumps[0]?.passenger)
    })

    it('asks for a name', async () => {
      await board()
      const res = refusal(await send({ intent: 'make-montage', fileIds: ['a'], name: '  ' }))
      expect(res.globalErrors?.[0]).toContain('name')
    })
  })

  describe('deleting a jump', () => {
    it('removes the jump and leaves every file loose in Fresh files', async () => {
      await writeManifest([
        group({ id: 'g1', files: [file({ id: 'a' }), file({ id: 'b' })] }),
        group({ id: 'g2', files: [file({ id: 'c' })] })
      ])

      const res = answer(await send({ intent: 'delete-jump', groupId: 'g1' }))

      expect(res.groups.map((g) => g.id)).toEqual(['g2'])
      expect(res.looseFiles.map((f) => f.id).sort()).toEqual(['a', 'b'])
      expect(res.looseFiles.every((f) => !f.destination)).toBe(true)
    })

    it('keeps the crop a file had in the jump', async () => {
      await writeManifest(
        [group({ id: 'g1', files: [file({ id: 'a', cropStart: 2, cropEnd: 5 })] })],
        [file({ id: 'a' })]
      )

      const res = answer(await send({ intent: 'delete-jump', groupId: 'g1' }))

      expect(res.looseFiles[0]).toMatchObject({ id: 'a', cropStart: 2, cropEnd: 5 })
    })

    it('takes a filed jump back to Fresh files too', async () => {
      await writeManifest([group({ id: 'g1', destination: 'Yverdon', files: [file({ id: 'a' })] })])

      const res = answer(await send({ intent: 'delete-jump', groupId: 'g1' }))

      expect(res.groups).toHaveLength(0)
      expect(res.looseFiles[0]?.destination).toBeUndefined()
    })

    it('refuses a jump that has been uploaded', async () => {
      const up = file({
        id: 'a',
        uploaded: { remotePath: '/x/a.mp4', md5: 'm', size: 10, localPath: '/p/a.mp4', at: 1 }
      })
      await writeManifest([group({ id: 'g1', files: [up] })])

      const res = refusal(await send({ intent: 'delete-jump', groupId: 'g1' }))

      expect(res.success).toBe(false)
      expect(res.globalErrors?.[0]).toContain('uploaded')
    })
  })

  describe('re-timing one file', () => {
    it('refuses an uploaded file', async () => {
      const up = file({
        id: 'a',
        uploaded: { remotePath: '/x/a.mp4', md5: 'm', size: 10, localPath: '/p/a.mp4', at: 1 }
      })
      await writeManifest([group({ id: 'g1', files: [up] })])

      const res = refusal(
        await send({ intent: 'retime-file', fileIds: ['a'], anchorEpoch: 1_754_003_600 })
      )

      expect(res.success).toBe(false)
      expect(res.globalErrors?.[0]).toContain('uploaded')
    })

    it('refuses more than one file at a time', async () => {
      await writeManifest([group({ id: 'g1', files: [file({ id: 'a' }), file({ id: 'b' })] })])

      const res = refusal(
        await send({ intent: 'retime-file', fileIds: ['a', 'b'], anchorEpoch: 1_754_003_600 })
      )

      expect(res.globalErrors?.[0]).toBe('Correct one file at a time.')
    })

    it('moves that file alone', async () => {
      const grouped = [file({ id: 'a' }), file({ id: 'b', mtime: 1_754_000_060 })]
      await writeManifest(
        [group({ id: 'g1', files: grouped })],
        [...grouped, file({ id: 'c', mtime: 1_754_000_120 })]
      )

      const res = answer(
        await send({ intent: 'retime-file', fileIds: ['a'], anchorEpoch: 1_754_003_600 })
      )

      const times = Object.fromEntries(
        [...res.groups.flatMap((g) => g.files), ...res.looseFiles].map((f) => [f.id, f.mtime])
      )
      expect(times).toEqual({ a: 1_754_003_600, b: 1_754_000_060, c: 1_754_000_120 })
    })
  })

  describe('putting unsorted files in the bin', () => {
    const onDisk = (id: string) => {
      const p = path.join(tmpDir, 'original_files', '2026-08-01', `${id}.MP4`)
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, id)
      return file({ id, path: p, filename: `${id}.MP4` })
    }

    it('takes the file off the board and moves it out of the originals', async () => {
      const a = onDisk('a')
      const b = onDisk('b')
      await writeManifest([group({ id: 'g1', files: [a, b] })])

      const res = answer(await send({ intent: 'trash-unsorted', fileIds: ['a'] }))

      expect(res.groups[0]?.files.map((f) => f.id)).toEqual(['b'])
      expect(fs.existsSync(a.path)).toBe(false)
      const bins = fs.readdirSync(path.join(tmpDir, '.trash'))
      expect(fs.existsSync(path.join(tmpDir, '.trash', bins[0]!, '2026-08-01', 'a.MP4'))).toBe(true)
    })
  })
  describe('a mark on a jump', () => {
    const marked = () =>
      writeManifest([
        group({
          id: 'g1',
          files: [file({ id: 'a', moments: { exit: 38, opening: 94, canopy: 97, landing: 185 } })]
        })
      ])

    it('is moved to where the footage says it should be', async () => {
      await marked()

      const res = answer(
        await send({
          intent: 'set-moment',
          fileIds: ['a'],
          moment: { which: 'opening', seconds: 95.5 }
        })
      )

      expect(res.groups[0]?.files[0]?.moments?.opening).toBe(95.5)
      expect(res.groups[0]?.files[0]?.moments?.canopy).toBe(97)
      const saved = await loadManifestAsync(path.join(tmpDir, 'manifest.json'))
      expect(saved?.files[0]?.moments?.opening).toBe(95.5)
    })

    it('is refused where it would put the jump out of order', async () => {
      await marked()

      const res = refusal(
        await send({
          intent: 'set-moment',
          fileIds: ['a'],
          moment: { which: 'opening', seconds: 20 }
        })
      )

      expect(res.success).toBe(false)
      expect(res.globalErrors?.[0]).toContain('door, opening, canopy, ground')
      const saved = await loadManifestAsync(path.join(tmpDir, 'manifest.json'))
      expect(saved?.files[0]?.moments?.opening).toBe(94)
    })

    it('is put back where the camera measured it', async () => {
      await marked()
      await send({
        intent: 'set-moment',
        fileIds: ['a'],
        moment: { which: 'opening', seconds: 95 }
      })
      await send({ intent: 'set-moment', fileIds: ['a'], moment: { which: 'exit', seconds: 40 } })

      const res = answer(await send({ intent: 'reset-moments', fileIds: ['a'] }))

      expect(res.groups[0]?.files[0]?.moments).toEqual({
        exit: 38,
        opening: 94,
        canopy: 97,
        landing: 185
      })
      expect(res.groups[0]?.files[0]?.foundMoments).toBeUndefined()
      const saved = await loadManifestAsync(path.join(tmpDir, 'manifest.json'))
      expect(saved?.files[0]?.moments?.exit).toBe(38)
    })

    it('is forgotten on request, in development', async () => {
      await marked()
      await send({ intent: 'set-moment', fileIds: ['a'], moment: { which: 'exit', seconds: 40 } })

      const res = answer(await send({ intent: 'redo-moments', fileIds: ['a'] }))

      expect(res.groups[0]?.files[0]?.moments).toBeUndefined()
      const saved = await loadManifestAsync(path.join(tmpDir, 'manifest.json'))
      expect(saved?.files[0]?.moments).toBeUndefined()
      expect(saved?.files[0]?.foundMoments).toBeUndefined()
    })

    it('has nothing to go back to when none was moved', async () => {
      await marked()

      const res = refusal(await send({ intent: 'reset-moments', fileIds: ['a'] }))

      expect(res.success).toBe(false)
    })
  })

  describe('removing a place', () => {
    it('is refused while anything there is on the storage', async () => {
      await writeManifest([
        group({
          id: 'group_1',
          destination: 'Yverdon',
          files: [
            file({
              id: 'a',
              destination: 'Yverdon',
              uploaded: {
                remotePath: '/home/Yverdon/a.mp4',
                md5: 'abc',
                size: 10,
                localPath: '/src/a.mp4',
                at: 1_754_000_100
              }
            })
          ]
        })
      ])

      const res = refusal(await send({ intent: 'remove-destination', destination: 'Yverdon' }))

      expect(res.success).toBe(false)
      expect(res.globalErrors?.[0]).toContain('on the storage')
      const saved = await loadManifestAsync(path.join(tmpDir, 'manifest.json'))
      expect(saved?.groups[0]?.destination).toBe('Yverdon')
    })

    it('takes Passengers off like any other place', async () => {
      await writeManifest(
        [group({ id: 'group_1', destination: 'Passengers', files: [file({ id: 'a' })] })],
        [],
        2
      )

      const res = answer(await send({ intent: 'remove-destination', destination: 'Passengers' }))

      expect(res.groups[0]?.destination).toBeUndefined()
    })

    it('is refused for a place that is not there', async () => {
      await writeManifest([])

      const res = refusal(await send({ intent: 'remove-destination', destination: 'Colombier' }))

      expect(res.success).toBe(false)
      expect(res.globalErrors?.[0]).toContain('no longer on the board')
    })
  })

  describe('a look at the board', () => {
    it('answers with the record as it is now and writes nothing', async () => {
      await writeManifest([group({ id: 'g1', files: [file({ id: 'a' })] })])
      const manifestPath = path.join(tmpDir, 'manifest.json')
      const before = fs.statSync(manifestPath).mtimeMs

      const res = answer(await send({ intent: 'look-at-board' }))

      expect(res.groups.map((g) => g.id)).toEqual(['g1'])
      expect(fs.statSync(manifestPath).mtimeMs).toBe(before)
    })

    it('shows what somebody else changed in the record', async () => {
      await writeManifest([group({ id: 'g1' })])
      await writeManifest([group({ id: 'g1' }), group({ id: 'g2' })])

      const res = answer(await send({ intent: 'look-at-board' }))

      expect(res.groups.map((g) => g.id)).toEqual(['g1', 'g2'])
    })
  })
})
