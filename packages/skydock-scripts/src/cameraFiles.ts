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
  seenOnCamera
} from './cameraWatch'
import { alreadyThere, dayFoldersOf, freedAlready } from './copy'
import { idFromHash } from './fileId'
import { givenBack } from './kioCamera'
import { listBin } from './bin'
import { findMediaFiles, moveFile, mtimeOf } from './lib/fs'
import { publish } from './live'
import { recordTransfer } from './transfers'
import { loadManifest } from './manifest'
import { isNamedMontage } from './montageArtifacts'
import type { Manifest, ManifestFile, ManifestGroup } from './types'
import { getManifestPath, getTrashDir, isVideoFile, sizeOf } from './utils'

/* What is on a camera plugged in, and taking off it what is no longer wanted there (RULES, Seeing
   what is on a camera). A file leaves a camera only once it is proved to be on the storage, or its
   copy here to have been put in the bin — by its bytes, not its name, since every name changes on
   the way — only from a drive that is a camera, and never erased: it goes to the bin, like any file
   put aside. */

type Uploaded = NonNullable<ManifestFile['uploaded']>

/* What the records say puts a board file's content on the storage. A montage's original travels as
   itself — on its own, or inside a zip, under videos/ in one that says what it holds — and a photo of
   a montage, or any file of a dropzone, travels as the copy made from it. */
/* A file's name inside a zip: under its part's own folder in one that says what it holds, and at the
   top of an older one, which held one part only. */
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

/* every entry on the board, with the jump it is in — a loose file is in none */
const entriesOf = (manifest: Manifest) => [
  ...manifest.groups.flatMap((group) => group.files.map((file) => ({ file, group }))),
  ...manifest.files
    .filter((f) => !manifest.groups.some((g) => g.files.some((gf) => gf.id === f.id)))
    .map((file) => ({ file, group: undefined }))
]

/* What a camera file is on the board: the identity every file there is known by, taken from its content,
   by one read of it. */
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

/* every item answered, at most `limit` at a time, the answers in the order of the items */
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

/* The files put in the bin from Fresh files: copies of camera files nobody wanted. */
const binnedCopies = (trashDir: string) =>
  listBin(trashDir)
    .filter((batch) => batch.from === 'fresh')
    .flatMap((batch) => batch.files)

type Content = { id: string; md5: string }

/* What a file holds, read through once and remembered for as long as it keeps its size and its time:
   the camera page asks it of the same few files each time it opens. */
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

/* Whether a camera file's copy is in the bin, by its bytes and never its name, which the copy may
   have changed. Only a file of the bin of the very same size can be it, so only such a pair is ever
   read through — the rest of the card is not read at all. */
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

/* Whether the records say a board file is on the storage: it was freed once the storage held it, or its
   upload was checked by md5 on both sides when it went up (RULES, Uploading a montage). */
const onStorage = (file: ManifestFile, group: ManifestGroup | undefined) =>
  Boolean(file.freed || group?.freed) || claimsOf(file, group).length > 0

/* Where a camera file stands, read from the records — the same answer the page gives and a delete acts
   on, so what is offered is what can go. */
const standingOf = (
  manifest: Manifest | null,
  original: string | null,
  /* whether the records say this machine gave it back — asked the way its kind of camera asks it */
  given: (files: ManifestFile[]) => boolean
) => {
  const entries = manifest ? entriesOf(manifest) : []
  /* gone from here but given back: the copy passes it over by the same rule, so the page says so */
  if (!original)
    return given(entries.map(({ file: f }) => f)) ? ('stored' as const) : ('missing' as const)
  const mine = entries.filter(({ file: f }) => f.path === original)
  return mine.some(({ file: f, group }) => onStorage(f, group))
    ? ('stored' as const)
    : ('copied' as const)
}

const dcimOf = (mount: string) => path.join(mount, 'DCIM')

/* Each file on the camera, and whether it is already copied here and on the storage — copied read
   the way copying reads it, so what the page says is copied is what a copy would pass over. */
const listCamera = async (mount: string, outputDir: string, trashDir: string) => {
  const files = fs.existsSync(dcimOf(mount)) ? findMediaFiles(dcimOf(mount)) : []
  const folders = await dayFoldersOf(files, outputDir)
  const manifest = loadManifest(getManifestPath(outputDir))
  const binned = binnedBy(binnedCopies(trashDir), contentOf)
  const listed: CameraFile[] = []
  for (const file of files) {
    const stat = fs.statSync(file)
    const dir = folders.get(file) ?? ''
    const original = await alreadyThere(file, stat, dir)
    const state = standingOf(manifest, original, (files) => freedAlready(files, file, stat, dir))
    listed.push({
      path: file,
      name: path.relative(dcimOf(mount), file),
      size: stat.size,
      mtime: Math.floor(stat.mtimeMs / 1000),
      /* one not here any more may have been put in the bin, which only its bytes can tell */
      state: state === 'missing' && (await binned(file, stat.size)) ? 'binned' : state
    })
  }
  /* newest first, as every list of files is */
  return {
    camera: cameraName(mount),
    mount,
    over: overMtp(mount) ? ('mtp' as const) : ('drive' as const),
    deletable: true,
    looking: false,
    files: listed.sort((a, b) => b.mtime - a.mtime)
  }
}

/* A camera read through KDE, listed from what its copy found rather than by asking it again: the
   camera answers one question at a time, and a card of sixteen hundred clips is minutes of them. Every
   such camera is copied the moment it is plugged in, so what it holds is known as soon as the copy
   has been over it — and while the copy is still going, what it has been over so far is listed, and
   the page says there is more to come. */
const listCameraThroughKde = (camera: string, outputDir: string) => {
  const seen = seenOnCamera(camera)
  const manifest = loadManifest(getManifestPath(outputDir))
  const listed: CameraFile[] = seen.clips.map((clip) => ({
    path: clip.url,
    name: clip.url.slice(`${camera}/DCIM/`.length),
    size: clip.size,
    /* The camera's own time where it gives one. A GoPro over MTP gives none, and then the copy
       here, which was dated from the clip itself, is the next best; with neither, none. */
    mtime:
      clip.mtime ?? (clip.original && fs.existsSync(clip.original) ? mtimeOf(clip.original) : 0),
    /* its bytes cannot be read from here, so whether its copy went to the bin is not said */
    state: standingOf(manifest, clip.original, (files) => givenBack(files, clip.name, clip.size))
  }))
  return {
    camera: cameraName(camera),
    mount: camera,
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

/* All or nothing: every file asked for has to be on a camera plugged in now and, by what it contains, a
   file the records say is on the storage, or whose copy is in the bin — or nothing is touched and each
   file that is not is named. A file only copied here stays: until it is uploaded or put in the bin, the
   card is its other copy. */
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
  trashDir = getTrashDir(),
  mounts = mountedCameras(),
  writable = canWriteIn
}: {
  paths: string[]
  manifest: Manifest
  trashDir?: string
  mounts?: string[]
  /* whether a folder of the card can be written to — a seam for a test, since root can write anywhere */
  writable?: (dir: string) => boolean
}) => {
  if (paths.length === 0) throw new Error('Select at least one file on the camera.')
  if (cameraCopying())
    throw new Error('A camera is being copied — wait for it to finish, then delete.')
  /* by where the file really is, links followed, so nothing outside the card is ever reached */
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

  /* A card mounted read-only — as the camera folder is in the development container — cannot have a file
     taken off it, and finding that out at the last step would copy every file into the bin first. */
  const readOnly = paths.filter((file) => !writable(path.dirname(file)))
  if (readOnly.length > 0)
    throw new Error(
      `Nothing was deleted: the camera is mounted read-only here, so nothing can be taken off it from this app. Delete on the camera itself, or run SkyDock where the card can be written to.`
    )
  const entries = entriesOf(manifest)
  /* how far each file has got is said as it goes, for the row that shows it — a few times a second at
     most, since a clip is read in a thousand pieces */
  const lastSaid = new Map<string, { at: number; part: number; stage: string }>()
  const said = (
    file: string,
    stage: 'checking' | 'checked' | 'moving' | 'done' | 'failed',
    part: number
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
    publish({ kind: 'camera-delete', path: file, stage, part, size: sizeOf(file) })
  }
  /* its copy in the bin is the very file off the card: the same content, read through now */
  const binned = binnedBy(binnedCopies(trashDir), (file) => fingerprint(file).catch(() => null))
  /* Each file is its own: read through to know what it is, and — if the records say it is on the storage,
     or its copy is in the bin — moved into the bin at once, without waiting for the others. Several are
     read at a time, since the camera is slow to read; they are moved one at a time, since moving is
     reading the camera again and two at once only slow each other. A file that is not shown to be there
     stays on the card and is named. */
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
      said(file, 'failed', 0)
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
  /* every file is on the list from the start, waiting its turn, not only the few being read */
  for (const file of paths) said(file, 'checking', 0)
  const outcomes = await inParallel(paths, 4, handle)
  const went = outcomes.filter((o) => o.went)
  const stayed = outcomes.filter((o) => !o.went)
  /* nothing went: said as a refusal, so the page shows why */
  if (went.length === 0)
    throw new Error(`Nothing was deleted: ${stayed.map((o) => o.why).join('; ')}.`)
  return {
    count: went.length,
    bytes: went.reduce((n, o) => n + o.size, 0),
    bins: [...bins],
    /* the ones that stayed, and why — the others went all the same */
    stayed: stayed.map((o) => ({ file: o.file, why: o.why ?? '' })),
    outcomes
  }
}

/* what was asked, said as it ends and kept with the other transfers (RULES, Transfers): every file that
   went, and every file that stayed and why */
const deleteFromCameras = async (
  options: Parameters<typeof deleteNow>[0] & { outputDir?: string }
) => {
  const { outputDir, paths } = options
  const sizes = paths.map((file) => sizeOf(file))
  const keep = (
    state: 'done' | 'failed',
    items: { name: string; size: number; result: 'done' | 'failed' | 'left'; note?: string }[],
    reason?: string
  ) => {
    if (!outputDir || paths.length === 0) return
    try {
      recordTransfer(
        {
          kind: 'delete',
          label: cameraName(options.mounts?.[0] ?? paths[0]!.split('/DCIM/')[0]!),
          state,
          ...(reason ? { reason } : {}),
          items
        },
        outputDir
      )
    } catch {
      /* the history is a courtesy */
    }
  }
  try {
    const { outcomes, ...result } = await deleteNow(options)
    keep(
      'done',
      outcomes.map((o) => ({
        name: path.basename(o.file),
        size: o.size,
        result: o.went ? ('done' as const) : ('failed' as const),
        ...(o.why ? { note: o.why } : {})
      }))
    )
    return result
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    for (const file of paths)
      publish({ kind: 'camera-delete', path: file, stage: 'failed', part: 0 })
    keep(
      'failed',
      paths.map((file, at) => ({
        name: path.basename(file),
        size: sizes[at]!,
        result: 'left' as const
      })),
      why
    )
    throw e
  }
}

export { deleteFromCameras, listCameras }
