// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  EDIT_LOCKED,
  getGroupProcessedDir,
  loadManifest,
  runUpload,
  saveManifest,
  uploadingNow,
  UPLOADED_LOCKED
} from '@skydock/scripts'
import { stopIfUploadCancelled } from '../../../packages/skydock-scripts/src/uploading'
import type { Manifest, ManifestFile, ManifestGroup } from '@skydock/scripts'
import { action } from '../../app/routes/api.manifest'
import { createTmpDir, routeArgs } from './fixtures'

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

describe('changes made on the board', () => {
  let tmpDir: string
  let previousOutputDir: string | undefined

  beforeEach(() => {
    tmpDir = createTmpDir('skydock-api-manifest-')
    previousOutputDir = process.env.SKYDOCK_OUTPUT_DIR
    process.env.SKYDOCK_OUTPUT_DIR = tmpDir
    process.env.SKYDOCK_CONFIG_DIR = tmpDir
    process.env.SKYDOCK_TRASH_DIR = path.join(tmpDir, '.trash')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    if (previousOutputDir === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
    else process.env.SKYDOCK_OUTPUT_DIR = previousOutputDir
  })

  const writeManifest = (groups: ManifestGroup[], files: ManifestFile[] = [], version = 1) => {
    const manifest: Manifest = {
      version,
      createdAt: new Date().toISOString(),
      files: files.length > 0 ? files : groups.flatMap((g) => g.files),
      groups,
      destinations: [{ name: 'Yverdon' }]
    }
    saveManifest(path.join(tmpDir, 'manifest.json'), manifest)
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

  it('refuses everything before a scan has ever run', async () => {
    const res = refusal(await send({ intent: 'save-groups' }))
    expect(res.success).toBe(false)
    expect(res.globalErrors?.[0]).toContain('No manifest')
  })

  describe('merging two jumps', () => {
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
    it('re-times the merged jump onto the start it was given', async () => {
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

    it('needs two jumps', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const res = refusal(await send({ intent: 'merge-groups', leftId: 'group_1' }))
      expect(res.globalErrors?.[0]).toContain('two group ids')
    })
  })

  describe('re-timing a jump', () => {
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

    it('refuses a start that is not a time', async () => {
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

  describe('moving files', () => {
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

    /* a file that leaves its jump is not the file that was processed, so what was recorded about
       it goes with it — otherwise the board would show a copy made for a folder it is no longer
       part of */
    it('drops what was recorded about a file that moves', async () => {
      const moved = file({
        id: 'b',
        processed: { path: '/out/b.mp4', size: 10, at: 1, source: { id: 'b', size: 10, mtime: 1 } }
      })
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' }), moved] })])

      const res = answer(
        await send({ intent: 'move-files', fileIds: ['b'], destination: 'Yverdon' })
      )

      const still = res.looseFiles.find((f) => f.id === 'b')
      expect(still?.processed).toBeUndefined()
      expect(still?.destination).toBe('Yverdon')
    })

    /* uploaded is the end of editing: the page hides the tick, and this is the rule behind it */
    it('refuses a file that is on the storage', async () => {
      const up = file({
        id: 'b',
        uploaded: { remotePath: '/nas/b.mp4', md5: 'x', size: 10, localPath: '/out/b.mp4', at: 1 }
      })
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' }), up] })])

      const res = refusal(
        await send({ intent: 'move-files', fileIds: ['b'], destination: 'Yverdon' })
      )

      expect(res.globalErrors?.[0]).toBe(UPLOADED_LOCKED)
      expect(loadManifest(path.join(tmpDir, 'manifest.json'))?.groups[0]?.files).toHaveLength(2)
    })

    it('needs at least one file', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const res = refusal(await send({ intent: 'move-files', fileIds: [] }))
      expect(res.globalErrors?.[0]).toContain('at least one file')
    })
  })

  describe('regrouping loose files', () => {
    it('says so rather than pretending, when there is nothing loose to regroup', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' }), file({ id: 'b' })] })])
      const res = refusal(await send({ intent: 'regroup-loose' }))
      expect(res.globalErrors?.[0]).toContain('Nothing to regroup')
    })
  })

  describe('uploading a dropzone', () => {
    it('needs something to upload', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const res = refusal(await send({ intent: 'upload-group' }))
      expect(res.globalErrors?.[0]).toContain('needs a group or a destination')
    })

    /* the reason this route was worth covering at all: a montage's files go to two different
       folders, and an upload sends one whole */
    it('refuses a montage, which is uploaded from its own page', async () => {
      writeManifest([
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

  /* One upload at a time, going on whatever page asked for it, and stoppable at any moment from any
     page (RULES, Uploading). */
  describe('an upload going', () => {
    /* an upload that runs until it is cancelled */
    const going = () =>
      runUpload({ key: 'montage:group_1', label: 'Luc Favre' }, async () => {
        for (;;) {
          stopIfUploadCancelled()
          await new Promise((resolve) => setTimeout(resolve, 5))
        }
      })

    it('is stopped when cancelled, and the board hears once it has stopped', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const upload = going()
      upload.catch(() => undefined)

      const res = (await send({ intent: 'cancel-upload' })) as { uploadCancelled?: boolean }

      expect(res.uploadCancelled).toBe(true)
      expect(uploadingNow()).toBeNull()
      await expect(upload).rejects.toThrow(/Upload cancelled/)
    })

    it('has nothing to cancel when nothing is uploading', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const res = refusal(await send({ intent: 'cancel-upload' }))
      expect(res.globalErrors?.[0]).toContain('Nothing is being uploaded')
    })

    it('is waited for by a page that comes back to it', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const upload = going()
      upload.catch(() => undefined)
      const waiting = send({ intent: 'upload-wait' })
      let answered = false
      void waiting.then(() => (answered = true))
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(answered).toBe(false)

      await send({ intent: 'cancel-upload' })

      expect(answer(await waiting).groups).toHaveLength(1)
    })
  })

  describe('the montage', () => {
    it('is only for a montage', async () => {
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

    it('will not start one before the files have been processed', async () => {
      writeManifest([
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

    /* an edit somebody has been working on is never written over */
    it('is made once: asked again for a montage that has a project, it is refused', async () => {
      writeManifest([
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

    /* The editor opens on proxies, and a project made before them opens on the full clips: it
       waits until each clip has its proxy, or has failed to get one (RULES, The editing project). */
    it('waits while a clip is still getting its proxy, and says how many', async () => {
      writeManifest([
        group({
          id: 'group_1',
          montageJump: true,
          passenger: { firstname: 'Luc', lastname: 'Favre' },
          processed: true,
          files: [file({ id: 'a' }), file({ id: 'b' })]
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

  /* A trim corrected after the montage was made is no use until the copies are made again, and
     preparing writes the copies and nothing else — the project sits beside them (RULES, The editing project). */
  describe('preparing a montage that has an edit', () => {
    it('is allowed, and leaves its project where it is', async () => {
      writeManifest([
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
      writeManifest([
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
    /* the proof is the storage's own checksum, so without it nothing is deleted */
    it('refuses while the storage cannot be reached, and deletes nothing', async () => {
      writeManifest([
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
      expect(res.globalErrors?.[0]).toContain('Connect the NAS')
    })
  })

  describe('marking the email as sent', () => {
    /* the list is kept on the storage, so saying the email went needs the storage */
    it('refuses while the storage cannot be reached', async () => {
      writeManifest([group({ id: 'group_1', files: [file({ id: 'a' })] })])
      const res = refusal(
        await send({
          intent: 'mark-emailed',
          emailed: { folder: '/SkyDock/Passengers/Luc Favre', sent: true }
        })
      )
      expect(res.globalErrors?.[0]).toContain('Connect the NAS')
    })
  })

  describe('saving the board', () => {
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

    /* uploaded is the end of editing, whatever the page sends (RULES, File status) */
    it('refuses a crop on a file that is on the storage, and changes nothing', async () => {
      const up = file({
        id: 'z',
        destination: 'Yverdon',
        cropStart: 2,
        uploaded: { remotePath: '/nas/z.mp4', md5: 'x', size: 10, localPath: '/out/z.mp4', at: 1 }
      })
      writeManifest([], [up])

      const res = refusal(
        await send({ intent: 'save-groups', groups: [], fileUpdates: [{ ...up, cropStart: 5 }] })
      )

      expect(res.globalErrors?.[0]).toBe(UPLOADED_LOCKED)
      expect(loadManifest(path.join(tmpDir, 'manifest.json'))?.files[0]?.cropStart).toBe(2)
    })

    it('saves an uploaded file sent back exactly as it is', async () => {
      const up = file({
        id: 'z',
        destination: 'Yverdon',
        cropStart: 2,
        uploaded: { remotePath: '/nas/z.mp4', md5: 'x', size: 10, localPath: '/out/z.mp4', at: 1 }
      })
      writeManifest([], [up])

      const res = answer(await send({ intent: 'save-groups', groups: [], fileUpdates: [up] }))

      expect(res.looseFiles[0]?.cropStart).toBe(2)
    })
  })

  /* Once there is an edit, the montage is frozen: its project points at the copies by path and at
     times inside them, and lives in the folder the name makes. Whatever the page sends, nothing
     that would move any of that gets through — and deleting the project is what lifts it. */
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

    beforeEach(() => {
      writeManifest([luc(), other()])
      fs.mkdirSync(path.dirname(projectPath()), { recursive: true })
      fs.writeFileSync(projectPath(), '<mlt/>')
    })

    const refused = (res: unknown) => {
      expect(refusal(res).globalErrors?.[0]).toBe(EDIT_LOCKED)
      /* and nothing about it changed on disk */
      expect(loadManifest(path.join(tmpDir, 'manifest.json'))?.groups[0]).toEqual(luc())
    }

    it('refuses a crop on one of its clips', async () => {
      const cropped = luc()
      cropped.files[0] = { ...cropped.files[0]!, cropStart: 1, cropEnd: 3 }
      refused(await send({ intent: 'save-groups', groups: [cropped, other()] }))
    })

    it('refuses a new name, which would move the folder the edit is in', async () => {
      refused(
        await send({
          intent: 'save-groups',
          groups: [{ ...luc(), passenger: { firstname: 'Luc', lastname: 'Favrè' } }, other()]
        })
      )
    })

    it('refuses another jump joining that passenger', async () => {
      refused(
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
      refused(await send({ intent: 'move-files', fileIds: ['a'], destination: 'Yverdon' }))
      refused(await send({ intent: 'move-files', fileIds: ['c'], targetGroupId: 'group_1' }))
    })

    /* what would rename its copies or take one away, which the project calls them by */
    it('refuses re-timing and merging it', async () => {
      refused(
        await send({ intent: 'shift-group-time', groupId: 'group_1', anchorEpoch: 1_754_009_000 })
      )
      refused(await send({ intent: 'merge-groups', leftId: 'group_2', rightId: 'group_1' }))
    })

    /* but not preparing it again: that writes the copies under the same names and leaves the
       project beside them, which is how a trim corrected afterwards reaches the footage */
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

    /* resetting is the way to start the edit over, so the lock never stands in its way */
    it('can still be reset, which takes the edit with it and keeps the name and crops', async () => {
      const cropped = luc()
      cropped.files[0] = { ...cropped.files[0]!, cropStart: 1, cropEnd: 3 }
      writeManifest([cropped, other()])
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

  /* RULES, Merging and making jumps by hand */
  it('makes a jump in Fresh files from loose files picked by hand', async () => {
    writeManifest([], [file({ id: 'a' }), file({ id: 'b', mtime: 1_754_000_060 })])

    const res = answer(await send({ intent: 'move-files', fileIds: ['a', 'b'], newGroup: true }))

    expect(res.groups).toHaveLength(1)
    expect(res.groups[0]?.destination).toBeUndefined()
    expect(res.groups[0]?.files.map((f) => f.id)).toEqual(['a', 'b'])
    expect(res.looseFiles).toHaveLength(0)
  })

  /* the camera was on the wrong clock and the jump has a name: both are set as it is made, and the
     gap between the files is kept */
  it('makes the jump with the name and the start it was given', async () => {
    writeManifest([], [file({ id: 'a' }), file({ id: 'b', mtime: 1_754_000_060 })])

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

  /* RULES, Jumps: Fresh files put back as a scan would first have left them */
  describe('resetting Fresh files', () => {
    it('forgets the jumps made and named by hand, and the trims, leaving what is filed alone', async () => {
      writeManifest([
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

    it('keeps the jump, its name and its trims when only the times are reset', async () => {
      writeManifest([
        group({
          id: 'g1',
          name: 'Sunset load',
          files: [
            file({ id: 'a', cropStart: 1, cropEnd: 4 }),
            file({ id: 'b', mtime: 1_754_000_060 })
          ]
        })
      ])

      const res = answer(await send({ intent: 'reset-fresh', resetWhat: 'times' }))

      expect(res.groups[0]).toMatchObject({ id: 'g1', name: 'Sunset load' })
      expect(res.groups[0]?.files[0]).toMatchObject({ cropStart: 1, cropEnd: 4 })
    })

    it('says so when there is nothing in Fresh files', async () => {
      writeManifest([group({ id: 'g2', destination: 'Yverdon', files: [file({ id: 'c' })] })])
      const res = refusal(await send({ intent: 'reset-fresh' }))
      expect(res.globalErrors?.[0]).toContain('nothing in Fresh files')
    })
  })

  /* RULES, Jumps: a clip two jumps share is copied into the second, not moved */
  describe('copying files into another jump', () => {
    const two = () =>
      writeManifest([
        group({ id: 'g1', files: [file({ id: 'a' }), file({ id: 'b' })] }),
        group({ id: 'g2', files: [file({ id: 'c', mtime: 1_754_007_200 })] })
      ])

    it('leaves them where they were and gives the other jump copies of its own', async () => {
      two()

      const res = answer(await send({ intent: 'copy-files', fileIds: ['a'], targetGroupId: 'g2' }))

      const byId = Object.fromEntries(res.groups.map((g) => [g.id, g.files.map((f) => f.id)]))
      expect(byId.g1).toEqual(['a', 'b'])
      expect(byId.g2).toEqual(['a~1', 'c'])
      expect(res.groups[1]?.files[0]).toMatchObject({ copyOf: 'a', path: '/src/a.mp4' })
    })

    it('says so when the jump already holds them', async () => {
      two()
      await send({ intent: 'copy-files', fileIds: ['a'], targetGroupId: 'g2' })

      const again = refusal(
        await send({ intent: 'copy-files', fileIds: ['a'], targetGroupId: 'g2' })
      )

      expect(again.globalErrors?.[0]).toContain('already holds')
    })

    it('ends a copy that is sent back, leaving the original in its jump', async () => {
      two()
      await send({ intent: 'copy-files', fileIds: ['a'], targetGroupId: 'g2' })

      const res = answer(await send({ intent: 'move-files', fileIds: ['a~1'] }))

      expect(res.looseFiles).toEqual([])
      const byId = Object.fromEntries(res.groups.map((g) => [g.id, g.files.map((f) => f.id)]))
      expect(byId).toEqual({ g1: ['a', 'b'], g2: ['c'] })
    })
  })

  /* RULES, Making a montage: moved from Fresh files, copied from anywhere else */
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
      board()

      const res = answer(
        await send({ intent: 'make-montage', fileIds: ['a', 'b'], name: 'Luc Favre' })
      )

      const made = res.groups.find((g) => g.montageJump)
      expect(made?.passenger).toEqual({ firstname: 'Luc', lastname: 'Favre' })
      expect(made?.files.map((f) => f.id)).toEqual(['a', 'b'])
      expect(res.groups.find((g) => g.id === 'fresh')).toBeUndefined()
    })

    it('copies files a dropzone holds, adjusted as they are, and leaves the dropzone its own', async () => {
      board()

      const res = answer(
        await send({ intent: 'make-montage', fileIds: ['c'], name: 'Boogie 2026' })
      )

      const made = res.groups.find((g) => g.montageJump)
      expect(made?.files[0]).toMatchObject({ copyOf: 'c', cropStart: 3 })
      expect(res.groups.find((g) => g.id === 'yv')?.files.map((f) => f.id)).toEqual(['c'])
    })

    it('joins a montage that has the name already, however it is written', async () => {
      board()
      await send({ intent: 'make-montage', fileIds: ['a'], name: 'Luc Favre' })

      const res = answer(await send({ intent: 'make-montage', fileIds: ['c'], name: 'luc favre' }))

      const jumps = res.groups.filter((g) => g.montageJump)
      expect(jumps.map((g) => g.passenger)).toEqual([
        { firstname: 'Luc', lastname: 'Favre' },
        { firstname: 'Luc', lastname: 'Favre' }
      ])
    })

    it('asks for a name', async () => {
      board()
      const res = refusal(await send({ intent: 'make-montage', fileIds: ['a'], name: '  ' }))
      expect(res.globalErrors?.[0]).toContain('name')
    })
  })

  /* RULES, Jumps: a jump deleted, its files kept, loose in Fresh files */
  describe('deleting a jump', () => {
    it('removes the jump and leaves every file loose in Fresh files', async () => {
      writeManifest([
        group({ id: 'g1', files: [file({ id: 'a' }), file({ id: 'b' })] }),
        group({ id: 'g2', files: [file({ id: 'c' })] })
      ])

      const res = answer(await send({ intent: 'delete-jump', groupId: 'g1' }))

      expect(res.groups.map((g) => g.id)).toEqual(['g2'])
      expect(res.looseFiles.map((f) => f.id).sort()).toEqual(['a', 'b'])
      expect(res.looseFiles.every((f) => !f.destination)).toBe(true)
    })

    it('keeps the crop a file had in the jump', async () => {
      writeManifest(
        [group({ id: 'g1', files: [file({ id: 'a', cropStart: 2, cropEnd: 5 })] })],
        [file({ id: 'a' })]
      )

      const res = answer(await send({ intent: 'delete-jump', groupId: 'g1' }))

      expect(res.looseFiles[0]).toMatchObject({ id: 'a', cropStart: 2, cropEnd: 5 })
    })

    it('takes a filed jump back to Fresh files too', async () => {
      writeManifest([group({ id: 'g1', destination: 'Yverdon', files: [file({ id: 'a' })] })])

      const res = answer(await send({ intent: 'delete-jump', groupId: 'g1' }))

      expect(res.groups).toHaveLength(0)
      expect(res.looseFiles[0]?.destination).toBeUndefined()
    })

    it('refuses a jump that has been uploaded', async () => {
      const up = file({
        id: 'a',
        uploaded: { remotePath: '/x/a.mp4', md5: 'm', size: 10, localPath: '/p/a.mp4', at: 1 }
      })
      writeManifest([group({ id: 'g1', files: [up] })])

      const res = refusal(await send({ intent: 'delete-jump', groupId: 'g1' }))

      expect(res.success).toBe(false)
      expect(res.globalErrors?.[0]).toContain('uploaded')
    })
  })

  /* RULES, Times and dates: one file corrected on its own */
  describe('re-timing one file', () => {
    it('moves that file alone', async () => {
      writeManifest([
        group({ id: 'g1', files: [file({ id: 'a' }), file({ id: 'b', mtime: 1_754_000_060 })] })
      ])

      const res = answer(
        await send({ intent: 'retime-file', fileIds: ['a'], anchorEpoch: 1_754_003_600 })
      )

      const files = res.groups[0]?.files ?? []
      expect(files.find((f) => f.id === 'a')?.mtime).toBe(1_754_003_600)
      expect(files.find((f) => f.id === 'b')?.mtime).toBe(1_754_000_060)
    })

    it('refuses an uploaded file', async () => {
      const up = file({
        id: 'a',
        uploaded: { remotePath: '/x/a.mp4', md5: 'm', size: 10, localPath: '/p/a.mp4', at: 1 }
      })
      writeManifest([group({ id: 'g1', files: [up] })])

      const res = refusal(
        await send({ intent: 'retime-file', fileIds: ['a'], anchorEpoch: 1_754_003_600 })
      )

      expect(res.success).toBe(false)
      expect(res.globalErrors?.[0]).toContain('uploaded')
    })

    it('refuses more than one file at a time', async () => {
      writeManifest([group({ id: 'g1', files: [file({ id: 'a' }), file({ id: 'b' })] })])

      const res = refusal(
        await send({ intent: 'retime-file', fileIds: ['a', 'b'], anchorEpoch: 1_754_003_600 })
      )

      expect(res.success).toBe(false)
    })
  })

  /* RULES, Putting files in the bin: only from Fresh files, moved and never erased */
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
      writeManifest([group({ id: 'g1', files: [a, b] })])

      const res = answer(await send({ intent: 'trash-unsorted', fileIds: ['a'] }))

      expect(res.groups[0]?.files.map((f) => f.id)).toEqual(['b'])
      expect(fs.existsSync(a.path)).toBe(false)
      const bins = fs.readdirSync(path.join(tmpDir, '.trash'))
      expect(fs.existsSync(path.join(tmpDir, '.trash', bins[0]!, '2026-08-01', 'a.MP4'))).toBe(true)
    })

    it('refuses a file that has been filed, and leaves it where it is', async () => {
      const a = onDisk('a')
      writeManifest([group({ id: 'g1', destination: 'Yverdon', files: [a] })])

      const res = refusal(await send({ intent: 'trash-unsorted', fileIds: ['a'] }))

      expect(res.success).toBe(false)
      expect(res.globalErrors?.[0]).toContain('Fresh files')
      expect(fs.existsSync(a.path)).toBe(true)
    })

    it('refuses when nothing was picked', async () => {
      writeManifest([group({ id: 'g1', files: [onDisk('a')] })])

      const res = refusal(await send({ intent: 'trash-unsorted', fileIds: [] }))

      expect(res.success).toBe(false)
    })
  })
  /* A jump's marks are what a cut is built on, and the camera is a starting point rather than a
     verdict (RULES, Where the jump is in a clip). */
  describe('a mark on a jump', () => {
    const marked = () =>
      writeManifest([
        group({
          id: 'g1',
          files: [file({ id: 'a', moments: { exit: 38, opening: 94, canopy: 97, landing: 185 } })]
        })
      ])

    it('is moved to where the footage says it should be', async () => {
      marked()

      const res = answer(
        await send({
          intent: 'set-moment',
          fileIds: ['a'],
          moment: { which: 'opening', seconds: 95.5 }
        })
      )

      expect(res.groups[0]?.files[0]?.moments?.opening).toBe(95.5)
      /* and the rest of the jump is left as it was */
      expect(res.groups[0]?.files[0]?.moments?.canopy).toBe(97)
      const saved = loadManifest(path.join(tmpDir, 'manifest.json'))
      expect(saved?.files[0]?.moments?.opening).toBe(95.5)
    })

    /* A canopy that opens before the plane was left is one of the two marks being wrong, and only
       the person moving them knows which — so it is refused rather than quietly sorted. */
    it('is refused where it would put the jump out of order', async () => {
      marked()

      const res = refusal(
        await send({
          intent: 'set-moment',
          fileIds: ['a'],
          moment: { which: 'opening', seconds: 20 }
        })
      )

      expect(res.success).toBe(false)
      expect(res.globalErrors?.[0]).toContain('door, opening, canopy, ground')
      const saved = loadManifest(path.join(tmpDir, 'manifest.json'))
      expect(saved?.files[0]?.moments?.opening).toBe(94)
    })
  })

  /* A place taken off the board: what was filed there comes back to Fresh files, and nothing is
     deleted (RULES, Places). */
  describe('removing a place', () => {
    it('takes it off the board and puts its jumps back in Fresh files', async () => {
      writeManifest([group({ id: 'group_1', destination: 'Yverdon', files: [file({ id: 'a' })] })])

      const res = answer(await send({ intent: 'remove-destination', destination: 'Yverdon' }))

      expect(res.groups).toHaveLength(1)
      expect(res.groups[0].destination).toBeUndefined()
      const saved = loadManifest(path.join(tmpDir, 'manifest.json'))
      expect(saved?.destinations).toEqual([])
    })

    it('puts the loose files filed there back in Fresh files, loose', async () => {
      writeManifest([], [file({ id: 'a', destination: 'Yverdon' })])

      const res = answer(await send({ intent: 'remove-destination', destination: 'Yverdon' }))

      expect(res.looseFiles).toHaveLength(1)
      expect(res.looseFiles[0].destination).toBeUndefined()
    })

    /* uploaded is the end of editing: unfiling one would leave the board and the storage disagreeing */
    it('is refused while anything there is on the storage', async () => {
      writeManifest([
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
      const saved = loadManifest(path.join(tmpDir, 'manifest.json'))
      expect(saved?.groups[0]?.destination).toBe('Yverdon')
    })

    /* Passengers is a place like any other now; the montages are not a place at all */
    it('takes Passengers off like any other place', async () => {
      writeManifest(
        [group({ id: 'group_1', destination: 'Passengers', files: [file({ id: 'a' })] })],
        [],
        2
      )

      const res = answer(await send({ intent: 'remove-destination', destination: 'Passengers' }))

      expect(res.groups[0]?.destination).toBeUndefined()
    })

    it('is refused for a place that is not there', async () => {
      writeManifest([])

      const res = refusal(await send({ intent: 'remove-destination', destination: 'Colombier' }))

      expect(res.success).toBe(false)
      expect(res.globalErrors?.[0]).toContain('no longer on the board')
    })
  })
})
