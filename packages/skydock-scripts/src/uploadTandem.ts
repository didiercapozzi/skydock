import * as fs from 'node:fs'
import * as path from 'node:path'
import { PHOTO_LEVEL, VIDEO_LEVEL, writeArchive } from './archive'
import type { ArchiveProgress } from './archive'
import type { CheckProgress, UploadProgress, UploadVerdict } from './publish'
import type { NasSession } from './nas'
import { filmNameOf, isTandem, photosNameOf, rushesNameOf, tandemArtifacts } from './tandem'
import type { Manifest, ManifestGroup } from './types'
import { targetForGroup, uploadTargets } from './upload'
import type { UploadTarget } from './upload'
import { isVideoFile, sizeOf } from './utils'

const SETTLE_MS = 1500

/* The editor writes the film under its final name while it renders, with no partial extension to
   look for — so the only way to tell a finished film from a growing one is to watch it. */
const settled = async (film: string) => {
  const before = sizeOf(film)
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
  const after = sizeOf(film)
  return before === after && after > 0
}

const resolveFilm = async (artifacts: ReturnType<typeof tandemArtifacts>, hasVideos: boolean) => {
  const canonical = path.join(artifacts.dir, filmNameOf(artifacts.baseName))
  if (!artifacts.film) {
    /* a tandem whose camera died is photos only, and must not dead-end on a film it never had */
    if (!hasVideos) return null
    if (artifacts.strayFilms.length === 0)
      throw new Error(
        `Render the film in kdenlive first — nothing named ${filmNameOf(artifacts.baseName)} in ${artifacts.dir}`
      )
    if (artifacts.strayFilms.length > 1)
      throw new Error(
        `Several films here — keep one and delete the rest: ${artifacts.strayFilms.join(', ')}`
      )
    /* a different name was typed into the render dialog; renaming our own output is not touching
       anything that came off a camera */
    fs.renameSync(path.join(artifacts.dir, artifacts.strayFilms[0]), canonical)
  }
  if (!(await settled(canonical)))
    throw new Error('The film is still being written — wait for the render to finish.')
  return canonical
}

const verdictFor = (files: UploadVerdict[], target: string) =>
  files.find((f) => f.localPath === target)

/* How the originals are kept, chosen once for the whole club. One zip is one object to move and
   cannot arrive half-copied; plain files can be browsed on the storage and one clip pulled out
   without unpacking the rest. Either way a copy of the film can go with them. */
type BackupOptions = { backupAs: 'zip' | 'folder'; filmToBackup: boolean }

const DEFAULT_BACKUP: BackupOptions = { backupAs: 'zip', filmToBackup: false }

/* Everything that happens once the edit is done: the two archives the passenger and the backup
   need, then two uploads that keep them apart. The manifest is not saved here — the caller owns
   that, because it runs long enough that the copy loaded before it started is stale. */
const uploadTandem = async ({
  outputDir,
  manifest,
  group,
  session,
  onArchive,
  onProgress,
  onCheck,
  backup = DEFAULT_BACKUP
}: {
  outputDir: string
  manifest: Manifest
  group: ManifestGroup
  session: NasSession
  backup?: BackupOptions
  onArchive?: (progress: ArchiveProgress & { name: string }) => void
  onProgress?: (progress: UploadProgress & { groupIds: string[] }) => void
  onCheck?: (progress: CheckProgress) => void
}) => {
  if (!isTandem(group))
    throw new Error('Only a tandem is uploaded this way — give it a passenger first.')
  if (!group.processed) throw new Error('Process this tandem before uploading it.')
  if (group.freed)
    throw new Error('This tandem lives only on the storage now — nothing here to upload.')
  const artifacts = tandemArtifacts(outputDir, group)
  if (!fs.existsSync(artifacts.dir)) throw new Error('Processed files not found. Process it again.')

  const backupFolder = session.backupFolder?.trim()
  if (!backupFolder) throw new Error('Choose a backup folder for the original videos.')
  const passenger = targetForGroup(group, outputDir, manifest, session.defaultFolder ?? null)
  if (!passenger.remoteDir)
    throw new Error('Choose a NAS folder for this tandem, or set a default upload folder.')
  /* the one misconfiguration that undoes the whole point of keeping the rushes apart */
  if (passenger.remoteDir === backupFolder)
    throw new Error('The backup folder is the passenger folder — choose a different one.')

  const videos = group.files.filter((f) => isVideoFile(f.path))
  const film = await resolveFilm(artifacts, videos.length > 0)

  const photosDir = path.join(artifacts.dir, 'photos')
  const photos = fs.existsSync(photosDir)
    ? fs
        .readdirSync(photosDir)
        .sort()
        .map((name) => ({ file: path.join(photosDir, name), name }))
    : []
  const photosZip = await writeArchive(
    path.join(artifacts.dir, photosNameOf(artifacts.baseName)),
    photos,
    { level: PHOTO_LEVEL, onProgress: (progress) => onArchive?.({ ...progress, name: 'photos' }) }
  )

  /* the rushes are the originals the edit came from, and they are the backup's business only */
  const originals = videos
    .filter((f) => fs.existsSync(f.path))
    .map((f) => ({ file: f.path, name: f.filename }))
  const filmCopy =
    backup.filmToBackup && film ? [{ file: film, name: filmNameOf(artifacts.baseName) }] : []
  const rushesZip =
    backup.backupAs === 'zip'
      ? await writeArchive(
          path.join(artifacts.dir, rushesNameOf(artifacts.baseName)),
          [...originals, ...filmCopy],
          {
            level: VIDEO_LEVEL,
            onProgress: (progress) => onArchive?.({ ...progress, name: 'rushes' })
          }
        )
      : null
  /* As plain files the originals go into a folder of their own, named like the archive would be,
     so one backup folder can hold every tandem without their clips running together. They are sent
     from wherever they sit, one target per folder, because they were never copied anywhere. */
  const backupDir = `${backupFolder}/${artifacts.baseName}`
  const plain =
    backup.backupAs === 'folder'
      ? [...originals.map((o) => o.file), ...filmCopy.map((f) => f.file)]
      : []
  const plainTargets: UploadTarget[] = [...new Set(plain.map((file) => path.dirname(file)))].map(
    (dir, index) => ({
      key: `backup:${group.id}:${index}`,
      label: `${passenger.label} originals`,
      localDir: dir,
      remoteDir: backupDir,
      destination: null,
      groupIds: [group.id],
      files: plain.filter((file) => path.dirname(file) === dir),
      share: false
    })
  )

  /* only what is the passenger's goes to the passenger: not the project, not the working folders,
     and above all not the rushes */
  const forPassenger = [film, photosZip].filter((f): f is string => f !== null)
  if (forPassenger.length === 0) throw new Error('Nothing to upload — no film and no photos.')
  const targets: UploadTarget[] = [{ ...passenger, files: forPassenger }]
  if (rushesZip)
    targets.push({
      key: `backup:${group.id}`,
      label: `${passenger.label} rushes`,
      localDir: artifacts.dir,
      remoteDir: backupFolder,
      destination: null,
      groupIds: [group.id],
      files: [rushesZip],
      share: false
    })
  targets.push(...plainTargets)

  const result = await uploadTargets({ outputDir, session, targets, onProgress, onCheck })
  const shareUrl = result.shareUrls.find((s) => s.target.key === passenger.key)?.shareUrl
  return {
    ...result,
    film,
    photosZip,
    rushesZip,
    /* what the tandem now records as its upload: where each parcel went, and the passenger's link */
    record: {
      at: Math.floor(Date.now() / 1000),
      shareUrl,
      film: film ? verdictFor(result.files, film) : undefined,
      photos: photosZip ? verdictFor(result.files, photosZip) : undefined,
      rushes: rushesZip ? verdictFor(result.files, rushesZip) : undefined,
      /* the film goes to the passenger too, so only what landed in the backup folder counts here */
      originals:
        plain.length > 0
          ? result.files.filter(
              (f) => plain.includes(f.localPath) && f.remotePath.startsWith(`${backupDir}/`)
            )
          : undefined
    }
  }
}

export { DEFAULT_BACKUP, uploadTandem }
export type { BackupOptions }
