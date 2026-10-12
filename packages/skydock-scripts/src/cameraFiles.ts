import { access, constants, realpath } from 'node:fs/promises'
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
import { alreadyThere, dayFoldersOf, folderIndex, freedAlready, givenBack, namesIn } from './copy'
import { computeFileId } from './fileId'
import { listBin } from './bin'
import { findMediaFilesAsync, moveFile, statOrNull } from './lib/fs'
import { inJob, job } from './live'
import { loadManifestAsync } from './manifest'
import { messageOf } from './lib/words'
import { isNamedMontage } from './montageArtifacts'
import type { Manifest, ManifestFile, ManifestGroup } from './types'
import { getManifestPath, getTrashDir, isVideoFile, mapWithLimit } from './utils'

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

const binnedCopies = async (trashDir: string) =>
  (await listBin(trashDir))
    .filter((batch) => batch.from === 'fresh')
    .flatMap((batch) => batch.files)

const known = new Map<string, Promise<string | null>>()
const contentOf = async (file: string) => {
  const stat = await statOrNull(file)
  if (!stat) return null
  const key = `${file}\0${stat.size}\0${stat.mtimeMs}`
  const found =
    known.get(key) ??
    computeFileId(file).catch(() => {
      known.delete(key)
      return null
    })
  known.set(key, found)
  return found
}

const binnedBy =
  (bin: Awaited<ReturnType<typeof binnedCopies>>, read: (file: string) => Promise<string | null>) =>
  async (file: string, size: number) => {
    const alike = bin.filter((f) => f.size === size)
    if (alike.length === 0) return false
    const camera = await read(file)
    if (!camera) return false
    for (const f of alike) if ((await read(f.path)) === camera) return true
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

const LISTING_PARALLEL = 16
const DELETING_PARALLEL = 4

const secondsOf = (stat: { mtimeMs: number }) => Math.floor(stat.mtimeMs / 1000)

const listCamera = async (mount: string, outputDir: string, trashDir: string) => {
  const files = await findMediaFilesAsync(dcimOf(mount))
  const folders = await dayFoldersOf(files, outputDir)
  const board = boardOf(await loadManifestAsync(getManifestPath(outputDir)))
  const binned = binnedBy(await binnedCopies(trashDir), contentOf)
  const names = new Map<string, Promise<string[]>>()
  const namesOnce = (dir: string) => {
    const found = names.get(dir) ?? namesIn(dir)
    names.set(dir, found)
    return found
  }
  const listed = (
    await mapWithLimit(files, LISTING_PARALLEL, async (file) => {
      const stat = await statOrNull(file)
      if (!stat) return null
      const dir = folders.get(file) ?? ''
      const original = await alreadyThere(file, stat, dir, namesOnce)
      const state = standingOf(board, original, () => freedAlready(board.inFolder, file, stat, dir))
      return {
        path: file,
        name: path.relative(dcimOf(mount), file),
        size: stat.size,
        mtime: secondsOf(stat),
        state: state === 'missing' && (await binned(file, stat.size)) ? ('binned' as const) : state
      }
    })
  ).filter((file): file is CameraFile => file !== null)
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

const listCameraThroughKde = async (camera: string, outputDir: string) => {
  const seen = seenOnCamera(camera)
  const board = boardOf(await loadManifestAsync(getManifestPath(outputDir)))
  const listed: CameraFile[] = await mapWithLimit(seen.clips, LISTING_PARALLEL, async (clip) => {
    const stat =
      typeof clip.mtime !== 'number' && clip.original ? await statOrNull(clip.original) : null
    return {
      path: clip.url,
      name: clip.url.slice(`${camera}/DCIM/`.length),
      size: clip.size,
      mtime: clip.mtime ?? (stat ? secondsOf(stat) : 0),
      state: standingOf(board, clip.original, (files) => givenBack(files, clip.name, clip.size))
    }
  })
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

const canWriteIn = (dir: string) =>
  access(dir, constants.W_OK).then(
    () => true,
    () => false
  )

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
  writable?: (dir: string) => Promise<boolean>
}) => {
  if (paths.length === 0) throw new Error('Select at least one file on the camera.')
  if (cameraCopying())
    throw new Error('A camera is being copied — wait for it to finish, then delete.')
  const dcims = await Promise.all(
    mounts.map(async (mount) => ({ mount, dcim: await realpath(dcimOf(mount)).catch(() => null) }))
  )
  const sizes = new Map<string, number>()
  const mountOf = new Map<string, string>()
  await mapWithLimit(paths, LISTING_PARALLEL, async (file) => {
    sizes.set(file, (await statOrNull(file))?.size ?? 0)
    const real = await realpath(file).catch(() => null)
    const found = dcims.find(
      ({ dcim }) => dcim !== null && real !== null && real.startsWith(`${dcim}${path.sep}`)
    )
    if (found) mountOf.set(file, found.mount)
  })
  const strangers = paths.filter((file) => !mountOf.has(file))
  if (strangers.length > 0)
    throw new Error(
      `Nothing was deleted: ${strangers.map((f) => path.basename(f)).join(', ')} ${strangers.length === 1 ? 'is' : 'are'} not on a camera plugged in now.`
    )

  const readOnly = (
    await Promise.all(
      paths.map(async (file) => ((await writable(path.dirname(file))) ? null : file))
    )
  ).filter((file) => file !== null)
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
  const binned = binnedBy(await binnedCopies(trashDir), (file) =>
    computeFileId(file).catch(() => null)
  )
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
    const size = sizes.get(file) ?? 0
    const name = path.basename(file)
    const refused = (why: string): Outcome => {
      said(file, 'failed', 0, why)
      return { file, size, went: false, why }
    }
    try {
      const camera = await computeFileId(file, (read) =>
        said(file, 'checking', size > 0 ? (read / size) * 0.5 : 0)
      )
      const mine = entries.filter(
        ({ file: f }) => f.id === camera || (f.copyOf !== undefined && f.copyOf === camera)
      )
      if (mine.length === 0 && !(await binned(file, size)))
        return refused(`${name} is neither on the board nor in the bin — copy it and scan first`)
      said(file, 'checked', 0.5)
      return await afterTheOthers(async () => {
        const mount = mountOf.get(file)!
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
      return refused(`${name}: ${messageOf(e)}`)
    }
  }
  deleting.rows(
    paths.map((file) => ({ key: file, name: path.basename(file), size: sizes.get(file) ?? 0 }))
  )
  const outcomes = await mapWithLimit(paths, DELETING_PARALLEL, handle)
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
