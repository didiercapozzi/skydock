import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { CameraFile } from './cameraEntry'
import {
  cameraCopying,
  cameraName,
  camerasSeenThroughKde,
  mountedCameras,
  overMtp,
  seenOnCamera,
  keyOfMount
} from './cameraWatch'
import { alreadyThere, dayFoldersOf, folderIndex, freedAlready } from './copy'
import { idFromHash } from './fileId'
import { givenBack } from './kioCamera'
import { listBin } from './bin'
import { findMediaFiles, moveFile, mtimeOf } from './lib/fs'
import { inJob, job } from './live'
import { loadManifest } from './manifest'
import { isNamedMontage } from './montageArtifacts'
import type { Manifest, ManifestFile, ManifestGroup } from './types'
import { getManifestPath, getTrashDir, isVideoFile, sizeOf } from './utils'

type Uploaded = NonNullable<ManifestFile['uploaded']>

const inZip = (record: Uploaded, part: 'videos' | 'photos', name: string) =>
  record.holds ? `${part}/${name}` : name

type Claim =
  | { kind: 'plain'; record: Uploaded }
  | { kind: 'zip'; record: Uploaded; name: string }
  | { kind: 'made'; record: Uploaded; name?: string; copy?: string }

const claimsOf = (file: ManifestFile, group: ManifestGroup | undefined): Claim[] => {
  const sent = group?.uploaded
  if (group && sent && isNamedMontage(group)) {
    if (isVideoFile(file.path)) {
      const plain = sent.originals?.find(
        (r) => r.localPath === file.path || path.basename(r.localPath) === file.filename
      )
      const rushes = sent.rushes
      return [
        ...(plain ? [{ kind: 'plain' as const, record: plain }] : []),
        ...(rushes
          ? [{ kind: 'zip' as const, record: rushes, name: inZip(rushes, 'videos', file.filename) }]
          : [])
      ]
    }
    const made = file.processed
    if (!made || made.source.id !== file.id) return []
    const name = path.basename(made.path)
    const loose = sent.photoFiles?.find((r) => path.basename(r.localPath) === name)
    return [
      ...(loose ? [{ kind: 'made' as const, record: loose }] : []),
      ...(sent.photos
        ? [
            {
              kind: 'made' as const,
              record: sent.photos,
              name: inZip(sent.photos, 'photos', name),
              copy: made.path
            }
          ]
        : [])
    ]
  }
  return file.uploaded &&
    file.processed &&
    file.uploaded.localPath === file.processed.path &&
    file.processed.source.id === file.id
    ? [{ kind: 'made', record: file.uploaded }]
    : []
}

const entriesOf = (manifest: Manifest) => {
  const grouped = new Set(manifest.groups.flatMap((group) => group.files.map((file) => file.id)))
  return [
    ...manifest.groups.flatMap((group) => group.files.map((file) => ({ file, group }))),
    ...manifest.files.filter((f) => !grouped.has(f.id)).map((file) => ({ file, group: undefined }))
  ]
}

const boardOf = (manifest: Manifest | null) => {
  const entries = manifest ? entriesOf(manifest) : []
  const byPath = new Map<string, typeof entries>()
  for (const entry of entries) {
    const held = byPath.get(entry.file.path) ?? []
    held.push(entry)
    byPath.set(entry.file.path, held)
  }
  const files = entries.map(({ file }) => file)
  return { files, byPath, inFolder: folderIndex(files) }
}

const fingerprint = (file: string, onBytes?: (read: number, total: number) => void) =>
  new Promise<{ id: string; md5: string }>((resolve, reject) => {
    const total = sizeOf(file)
    let read = 0
    const sha = crypto.createHash('sha256')
    const md5 = crypto.createHash('md5')
    fs.createReadStream(file, { highWaterMark: 1024 * 1024 })
      .on('data', (chunk) => {
        sha.update(chunk)
        md5.update(chunk)
        read += chunk.length
        onBytes?.(read, total)
      })
      .on('error', reject)
      .on('end', () => resolve({ id: idFromHash(sha), md5: md5.digest('hex') }))
  })

const inParallel = async <T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) => {
  const answers = new Array<R>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const at = next++
        answers[at] = await work(items[at]!)
      }
    })
  )
  return answers
}

const binnedCopies = (trashDir: string) =>
  listBin(trashDir)
    .filter((batch) => batch.from === 'fresh')
    .flatMap((batch) => batch.files)

type Content = { id: string; md5: string }

const known = new Map<string, Promise<Content | null>>()
const contentOf = (file: string) => {
  const stat = fs.statSync(file)
  const key = `${file}\0${stat.size}\0${stat.mtimeMs}`
  const found =
    known.get(key) ??
    fingerprint(file).catch(() => {
      known.delete(key)
      return null
    })
  known.set(key, found)
  return found
}

const binnedBy =
  (bin: ReturnType<typeof binnedCopies>, read: (file: string) => Promise<Content | null>) =>
  async (file: string, size: number) => {
    const alike = bin.filter((f) => f.size === size)
    if (alike.length === 0) return false
    const camera = await read(file)
    if (!camera) return false
    for (const f of alike) if ((await read(f.path))?.id === camera.id) return true
    return false
  }

const onStorage = (file: ManifestFile, group: ManifestGroup | undefined) =>
  Boolean(file.freed || group?.freed) || claimsOf(file, group).length > 0

const standingOf = (
  board: ReturnType<typeof boardOf>,
  original: string | null,
  given: (files: ManifestFile[]) => boolean
) => {
  if (!original) return given(board.files) ? ('stored' as const) : ('missing' as const)
  return (board.byPath.get(original) ?? []).some(({ file: f, group }) => onStorage(f, group))
    ? ('stored' as const)
    : ('copied' as const)
}

const dcimOf = (mount: string) => path.join(mount, 'DCIM')

const listCamera = async (mount: string, outputDir: string, trashDir: string) => {
  const files = fs.existsSync(dcimOf(mount)) ? findMediaFiles(dcimOf(mount)) : []
  const folders = await dayFoldersOf(files, outputDir)
  const board = boardOf(loadManifest(getManifestPath(outputDir)))
  const binned = binnedBy(binnedCopies(trashDir), contentOf)
  const listed: CameraFile[] = []
  for (const file of files) {
    const stat = fs.statSync(file)
    const dir = folders.get(file) ?? ''
    const original = await alreadyThere(file, stat, dir)
    const state = standingOf(board, original, () => freedAlready(board.inFolder, file, stat, dir))
    listed.push({
      path: file,
      name: path.relative(dcimOf(mount), file),
      size: stat.size,
      mtime: Math.floor(stat.mtimeMs / 1000),
      state: state === 'missing' && (await binned(file, stat.size)) ? 'binned' : state
    })
  }
  return {
    camera: cameraName(mount),
    mount,
    key: keyOfMount(mount),
    over: overMtp(mount) ? ('mtp' as const) : ('drive' as const),
    deletable: true,
    looking: false,
    files: listed.sort((a, b) => b.mtime - a.mtime)
  }
}

const listCameraThroughKde = (camera: string, outputDir: string) => {
  const seen = seenOnCamera(camera)
  const board = boardOf(loadManifest(getManifestPath(outputDir)))
  const listed: CameraFile[] = seen.clips.map((clip) => ({
    path: clip.url,
    name: clip.url.slice(`${camera}/DCIM/`.length),
    size: clip.size,
    mtime:
      clip.mtime ?? (clip.original && fs.existsSync(clip.original) ? mtimeOf(clip.original) : 0),
    state: standingOf(board, clip.original, (files) => givenBack(files, clip.name, clip.size))
  }))
  return {
    camera: cameraName(camera),
    mount: camera,
    key: keyOfMount(camera),
    over: 'mtp' as const,
    deletable: false,
    looking: !seen.done,
    files: listed.sort((a, b) => b.mtime - a.mtime)
  }
}

const listCameras = async (
  outputDir: string,
  mounts = mountedCameras(),
  trashDir = getTrashDir()
) =>
  Promise.all([
    ...mounts.map((mount) => listCamera(mount, outputDir, trashDir)),
    ...camerasSeenThroughKde().map((camera) => listCameraThroughKde(camera, outputDir))
  ])

const canWriteIn = (dir: string) => {
  try {
    fs.accessSync(dir, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

const deleteNow = async ({
  paths,
  manifest,
  deleting,
  trashDir = getTrashDir(),
  mounts = mountedCameras(),
  writable = canWriteIn
}: {
  paths: string[]
  manifest: Manifest
  deleting: ReturnType<typeof job>
  trashDir?: string
  mounts?: string[]
  writable?: (dir: string) => boolean
}) => {
  if (paths.length === 0) throw new Error('Select at least one file on the camera.')
  if (cameraCopying())
    throw new Error('A camera is being copied — wait for it to finish, then delete.')
  const real = (file: string) => {
    try {
      return fs.realpathSync(file)
    } catch {
      return null
    }
  }
  const cameraOf = (file: string) =>
    mounts.find((mount) => {
      const dcim = real(dcimOf(mount))
      return dcim !== null && (real(file) ?? '').startsWith(`${dcim}${path.sep}`)
    })
  const strangers = paths.filter((file) => !cameraOf(file))
  if (strangers.length > 0)
    throw new Error(
      `Nothing was deleted: ${strangers.map((f) => path.basename(f)).join(', ')} ${strangers.length === 1 ? 'is' : 'are'} not on a camera plugged in now.`
    )

  const readOnly = paths.filter((file) => !writable(path.dirname(file)))
  if (readOnly.length > 0)
    throw new Error(
      `Nothing was deleted: the camera is mounted read-only here, so nothing can be taken off it from this app. Delete on the camera itself, or run SkyDock where the card can be written to.`
    )
  const entries = entriesOf(manifest)
  const lastSaid = new Map<string, { at: number; part: number; stage: string }>()
  const said = (
    file: string,
    stage: 'checking' | 'checked' | 'moving' | 'done' | 'failed',
    part: number,
    note?: string
  ) => {
    const before = lastSaid.get(file)
    const now = Date.now()
    if (
      (stage === 'checking' || stage === 'moving') &&
      before?.stage === stage &&
      now - before.at < 150 &&
      part - before.part < 0.02
    )
      return
    lastSaid.set(file, { at: now, part, stage })
    const ended = stage === 'done' || stage === 'failed'
    deleting.row({
      key: file,
      at:
        stage === 'done'
          ? 'done'
          : stage === 'failed'
            ? 'failed'
            : part > 0 || stage !== 'checking'
              ? 'now'
              : 'later',
      part: ended ? undefined : part,
      phase: stage,
      ...(note ? { note } : {})
    })
    if (stage === 'done') deleting.step()
  }
  const binned = binnedBy(binnedCopies(trashDir), (file) => fingerprint(file).catch(() => null))
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const bins = new Set<string>()
  let queue: Promise<unknown> = Promise.resolve()
  const afterTheOthers = <T>(work: () => Promise<T>) => {
    const run = queue.then(work, work)
    queue = run.catch(() => undefined)
    return run
  }
  type Outcome = { file: string; size: number; went: boolean; why?: string }
  const handle = async (file: string): Promise<Outcome> => {
    const size = sizeOf(file)
    const name = path.basename(file)
    const refused = (why: string): Outcome => {
      said(file, 'failed', 0, why)
      return { file, size, went: false, why }
    }
    try {
      const camera = await fingerprint(file, (read, total) =>
        said(file, 'checking', total > 0 ? (read / total) * 0.5 : 0)
      )
      const mine = entries.filter(
        ({ file: f }) => f.id === camera.id || (f.copyOf !== undefined && f.copyOf === camera.id)
      )
      if (!mine.some(({ file: f, group }) => onStorage(f, group)) && !(await binned(file, size)))
        return refused(
          mine.length === 0
            ? `${name} is neither on the board nor in the bin — copy it and scan first`
            : `${name} is not uploaded yet, nor put in the bin`
        )
      said(file, 'checked', 0.5)
      return await afterTheOthers(async () => {
        const mount = cameraOf(file)!
        const bin = path.join(trashDir, `camera-${cameraName(mount)}-${stamp}`)
        said(file, 'moving', 0.5)
        await moveFile(file, path.join(bin, path.relative(mount, file)), (copied) =>
          said(file, 'moving', 0.5 + (size > 0 ? (copied / size) * 0.5 : 0.5))
        )
        bins.add(bin)
        said(file, 'done', 1)
        return { file, size, went: true }
      })
    } catch (e) {
      return refused(`${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  deleting.rows(paths.map((file) => ({ key: file, name: path.basename(file), size: sizeOf(file) })))
  const outcomes = await inParallel(paths, 4, handle)
  const went = outcomes.filter((o) => o.went)
  const stayed = outcomes.filter((o) => !o.went)
  if (went.length === 0)
    throw new Error(`Nothing was deleted: ${stayed.map((o) => o.why).join('; ')}.`)
  return {
    count: went.length,
    bytes: went.reduce((n, o) => n + o.size, 0),
    bins: [...bins],
    stayed: stayed.map((o) => ({ file: o.file, why: o.why ?? '' })),
    outcomes
  }
}

const deleteFromCameras = async (
  options: Omit<Parameters<typeof deleteNow>[0], 'deleting'> & { outputDir?: string }
) => {
  const { outputDir, paths } = options
  return inJob(
    {
      type: 'camera-delete',
      label: cameraName(options.mounts?.[0] ?? paths[0]?.split('/DCIM/')[0] ?? ''),
      total: paths.length,
      ...(outputDir && paths.length > 0 ? { record: { kind: 'delete' as const, outputDir } } : {})
    },
    async (deleting) => {
      const { outcomes: _outcomes, ...result } = await deleteNow({ ...options, deleting })
      return result
    }
  )
}

export { deleteFromCameras, listCamera, listCameraThroughKde, listCameras }
