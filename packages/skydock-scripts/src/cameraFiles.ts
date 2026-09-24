import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Unzip, UnzipInflate } from 'fflate'
import type { CameraFile } from './cameraEntry'
import {
  cameraCopying,
  cameraName,
  camerasSeenThroughKde,
  mountedCameras,
  overMtp
} from './cameraWatch'
import { alreadyThere, dayFoldersOf, freedAlready } from './copy'
import { ID_HEX_LENGTH } from './fileId'
import { kioReader } from './kio'
import { clipsUnder, givenBack, hereAlready, statEach } from './kioCamera'
import { findMediaFiles, hashFile, moveFile } from './lib/fs'
import { loadManifest } from './manifest'
import { dsmFileMd5 } from './nas'
import type { NasSession } from './nas'
import { isTandem } from './tandem'
import type { Manifest, ManifestFile, ManifestGroup } from './types'
import { getManifestPath, getTrashDir, isVideoFile } from './utils'

/* What is on a camera plugged in, and taking off it what is already safe on the storage (RULES,
   Seeing what is on a camera). A file leaves a camera only once the storage is proved to hold it —
   by its bytes, not its name, since every name changes on the way — only from a drive that is a
   camera, and never erased: it goes to the bin, like any file put aside. */

type Uploaded = NonNullable<ManifestFile['uploaded']>

/* What the records say puts a board file's content on the storage. A tandem's original travels as
   itself — alone in the backup folder, or inside the backup zip under its own name — and a photo of a
   tandem, or any file of a dropzone, travels as the copy made from it. */
type Claim =
  | { kind: 'plain'; record: Uploaded }
  | { kind: 'zip'; record: Uploaded; name: string }
  | { kind: 'made'; record: Uploaded; name?: string; copy?: string }

const claimsOf = (file: ManifestFile, group: ManifestGroup | undefined): Claim[] => {
  const sent = group?.uploaded
  if (group && sent && isTandem(group)) {
    if (isVideoFile(file.path)) {
      const plain = sent.originals?.find((r) => r.localPath === file.path)
      return [
        ...(plain ? [{ kind: 'plain' as const, record: plain }] : []),
        ...(sent.rushes ? [{ kind: 'zip' as const, record: sent.rushes, name: file.filename }] : [])
      ]
    }
    const made = file.processed
    return sent.photos && made && made.source.id === file.id
      ? [{ kind: 'made', record: sent.photos, name: path.basename(made.path), copy: made.path }]
      : []
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

/* The md5 of each entry of a zip, read out of it — what a camera file is held against when it went
   to the storage inside a backup. */
const zipEntryHashes = async (zipPath: string) => {
  const hashes = new Map<string, string>()
  const unzip = new Unzip()
  unzip.register(UnzipInflate)
  unzip.onfile = (entry) => {
    const hash = crypto.createHash('md5')
    entry.ondata = (error, chunk, final) => {
      if (error) return
      hash.update(chunk)
      if (final) hashes.set(entry.name, hash.digest('hex'))
    }
    entry.start()
  }
  for await (const chunk of fs.createReadStream(zipPath)) unzip.push(chunk, false)
  unzip.push(new Uint8Array(0), true)
  return hashes
}

/* One read of the camera file gives both what it is on the board — the identity every file there is
   known by, taken from its content — and the checksum the storage can be asked for. */
const fingerprint = (file: string) =>
  new Promise<{ id: string; md5: string }>((resolve, reject) => {
    const sha = crypto.createHash('sha256')
    const md5 = crypto.createHash('md5')
    fs.createReadStream(file)
      .on('data', (chunk) => {
        sha.update(chunk)
        md5.update(chunk)
      })
      .on('error', reject)
      .on('end', () =>
        resolve({ id: sha.digest('hex').slice(0, ID_HEX_LENGTH), md5: md5.digest('hex') })
      )
  })

/* Each proof asks the same few questions of the storage and of the zips here; asked once each. */
const prover = (session: NasSession) => {
  const remote = new Map<string, Promise<string | null>>()
  const local = new Map<string, Promise<string | null>>()
  const zips = new Map<string, Promise<Map<string, string>>>()
  const once = <T>(cache: Map<string, Promise<T>>, key: string, ask: () => Promise<T>) => {
    const known = cache.get(key) ?? ask()
    cache.set(key, known)
    return known
  }
  const onStorage = async (record: Uploaded) =>
    (
      await once(remote, record.remotePath, () =>
        dsmFileMd5(session.hostname, session.sessionId, record.remotePath)
      )
    )?.toLowerCase() === record.md5.toLowerCase()
  const hashHere = (file: string) =>
    once(local, file, () => (fs.existsSync(file) ? hashFile(file) : Promise.resolve(null)))
  /* the zip here is the one that went up, byte for byte, and the storage still holds it */
  const zipSent = async (record: Uploaded) =>
    (await hashHere(record.localPath)) === record.md5 && (await onStorage(record))
  const entryHash = async (record: Uploaded, name: string) =>
    fs.existsSync(record.localPath)
      ? (await once(zips, record.localPath, () => zipEntryHashes(record.localPath))).get(name)
      : undefined

  return async (claim: Claim, camera: { md5: string }) => {
    if (claim.kind === 'plain') return claim.record.md5 === camera.md5 && onStorage(claim.record)
    if (claim.kind === 'zip')
      return (await entryHash(claim.record, claim.name)) === camera.md5 && zipSent(claim.record)
    /* the copy made from this very file: on the storage as sent, and — inside a zip — the zip's
       entry is that copy, byte for byte, while the copy is still here to say so */
    if (!claim.name) return onStorage(claim.record)
    if (!(await zipSent(claim.record))) return false
    const inZip = await entryHash(claim.record, claim.name)
    const copy = claim.copy ? await hashHere(claim.copy) : null
    return inZip !== undefined && (copy === null || copy === inZip)
  }
}

/* Where a camera file stands, read the cheap way — by the records, not by reading it through — so
   the page can say it at once. Deleting proves it again, the expensive way. */
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
  return mine.some(({ file: f, group }) => f.freed || claimsOf(f, group).length > 0)
    ? ('stored' as const)
    : ('copied' as const)
}

const dcimOf = (mount: string) => path.join(mount, 'DCIM')

/* Each file on the camera, and whether it is already copied here and on the storage — copied read
   the way copying reads it, so what the page says is copied is what a copy would pass over. */
const listCamera = async (mount: string, outputDir: string) => {
  const files = fs.existsSync(dcimOf(mount)) ? findMediaFiles(dcimOf(mount)) : []
  const folders = await dayFoldersOf(files, outputDir)
  const manifest = loadManifest(getManifestPath(outputDir))
  const listed: CameraFile[] = []
  for (const file of files) {
    const stat = fs.statSync(file)
    const dir = folders.get(file) ?? ''
    const original = await alreadyThere(file, stat, dir)
    listed.push({
      path: file,
      name: path.relative(dcimOf(mount), file),
      size: stat.size,
      mtime: Math.floor(stat.mtimeMs / 1000),
      state: standingOf(manifest, original, (files) => freedAlready(files, file, stat, dir))
    })
  }
  /* newest first, as every list of files is */
  return {
    camera: cameraName(mount),
    mount,
    over: overMtp(mount) ? ('mtp' as const) : ('drive' as const),
    deletable: true,
    files: listed.sort((a, b) => b.mtime - a.mtime)
  }
}

/* A camera read through KDE, listed the same way: each clip by where it is on the camera, how big it
   is and when it was written, and how far it has got — judged by the same records as a card's. */
const listCameraThroughKde = async (camera: string, outputDir: string) => {
  const reader = await kioReader()
  if (!reader)
    return {
      camera: cameraName(camera),
      mount: camera,
      over: 'mtp' as const,
      deletable: false,
      files: []
    }
  const clips = await clipsUnder(reader, `${camera}/DCIM`)
  const said = await statEach(reader, clips)
  const here = hereAlready(outputDir)
  const manifest = loadManifest(getManifestPath(outputDir))
  const listed: CameraFile[] = clips.map((clip, at) => {
    const file = said[at]
    const size = file?.size ?? 0
    const original = file ? here.find(clip.name, file) : null
    return {
      path: clip.url,
      name: clip.url.slice(`${camera}/DCIM/`.length),
      size,
      /* The camera's own time where it gives one. A GoPro over MTP gives none, and then the copy
         here, which was dated from the clip itself, is the next best; with neither, none. */
      mtime: file?.mtime ?? (original ? Math.floor(fs.statSync(original).mtimeMs / 1000) : 0),
      state: standingOf(manifest, original, (files) => givenBack(files, clip.name, size))
    }
  })
  return {
    camera: cameraName(camera),
    mount: camera,
    over: 'mtp' as const,
    deletable: false,
    files: listed.sort((a, b) => b.mtime - a.mtime)
  }
}

const listCameras = async (outputDir: string, mounts = mountedCameras()) =>
  Promise.all([
    ...mounts.map((mount) => listCamera(mount, outputDir)),
    ...camerasSeenThroughKde().map((camera) => listCameraThroughKde(camera, outputDir))
  ])

/* All or nothing: every file asked for has to be on a camera plugged in now and proved to be on the
   storage, or nothing is touched and each file that is not is named. */
const deleteFromCameras = async ({
  paths,
  manifest,
  session,
  trashDir = getTrashDir(),
  mounts = mountedCameras()
}: {
  paths: string[]
  manifest: Manifest
  session: NasSession
  trashDir?: string
  mounts?: string[]
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

  const proves = prover(session)
  const entries = entriesOf(manifest)
  const problems: string[] = []
  for (const file of paths) {
    const camera = await fingerprint(file)
    const mine = entries.filter(
      ({ file: f }) => f.id === camera.id || (f.copyOf !== undefined && f.copyOf === camera.id)
    )
    const claims = mine.flatMap(({ file: f, group }) => claimsOf(f, group))
    const name = path.basename(file)
    if (mine.length === 0) problems.push(`${name} is not on the board — copy it and scan first`)
    else if (claims.length === 0) problems.push(`${name} is not uploaded yet`)
    else {
      let proved = false
      for (const claim of claims) if (!proved) proved = await proves(claim, camera)
      if (!proved) problems.push(`${name} could not be matched with what the storage holds`)
    }
  }
  if (problems.length > 0) throw new Error(`Nothing was deleted: ${problems.join('; ')}.`)

  /* one folder per camera and per time, keeping each file where it sat on the card */
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  let bytes = 0
  const bins = new Set<string>()
  for (const file of paths) {
    const mount = cameraOf(file)!
    const bin = path.join(trashDir, `camera-${cameraName(mount)}-${stamp}`)
    bins.add(bin)
    bytes += fs.statSync(file).size
    await moveFile(file, path.join(bin, path.relative(mount, file)))
  }
  return { count: paths.length, bytes, bins: [...bins] }
}

export { deleteFromCameras, listCameras }
