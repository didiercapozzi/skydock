import { rename } from 'node:fs/promises'
import * as path from 'node:path'
import type { ArchiveProgress } from './archive'
import type { CheckProgress, PlanProgress, UploadProgress, UploadVerdict } from './publish'
import type { NasSession } from './nas'
import { projectFolderOf, sendItems } from './sending'
import type { SendItem } from './sending'
import { filmNameOf, isNamedMontage, montageArtifacts } from './montageArtifacts'
import type { Manifest, ManifestGroup, SendPart, SendPlan } from './types'
import { pathExists } from './lib/fs'
import { isVideoFile, sizeOf } from './utils'
import { passengerName } from './workspace'
import { sendPlanned } from './uploadItems'

const SETTLE_MS = 1500

const settled = async (film: string) => {
  const before = await sizeOf(film)
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
  const after = await sizeOf(film)
  return before === after && after > 0
}

const resolveFilm = async (
  artifacts: Awaited<ReturnType<typeof montageArtifacts>>,
  hasVideos: boolean
) => {
  const canonical = path.join(artifacts.dir, filmNameOf(artifacts.baseName))
  if (!artifacts.film) {
    if (!hasVideos) return null
    if (artifacts.strayFilms.length === 0)
      throw new Error(
        `Render the film in kdenlive first — nothing named ${filmNameOf(artifacts.baseName)} in ${artifacts.dir}`
      )
    if (artifacts.strayFilms.length > 1)
      throw new Error(
        `Several films here — keep one and delete the rest: ${artifacts.strayFilms.join(', ')}`
      )
    await rename(path.join(artifacts.dir, artifacts.strayFilms[0]), canonical)
  }
  if (!(await settled(canonical)))
    throw new Error('The film is still being written — wait for the render to finish.')
  return canonical
}

const readyOf = (dir: string) => path.join(dir, '.send')

const verdictIn = (files: UploadVerdict[], localPath: string, remoteDir: string) =>
  files.find((f) => f.localPath === localPath && f.remotePath.startsWith(`${remoteDir}/`))

const uploadMontage = async ({
  outputDir,
  manifest,
  group,
  session,
  plan,
  onArchive,
  onProgress,
  onCheck,
  onPlan
}: {
  outputDir: string
  manifest: Manifest
  group: ManifestGroup
  session: NasSession
  plan: SendPlan
  onArchive?: (progress: ArchiveProgress & { name: string }) => void
  onProgress?: (progress: UploadProgress & { groupIds: string[] }) => void
  onCheck?: (progress: CheckProgress) => void
  onPlan?: (plan: PlanProgress) => void
}) => {
  if (!isNamedMontage(group))
    throw new Error('Only a montage is uploaded this way — give it a name first.')
  if (!group.processed) throw new Error('Process this montage before uploading it.')
  if (group.freed)
    throw new Error('This montage lives only on the storage now — nothing here to upload.')
  const artifacts = await montageArtifacts(outputDir, group)
  if (!(await pathExists(artifacts.dir)))
    throw new Error('Processed files not found. Process it again.')

  const videos = group.files.filter((f) => isVideoFile(f.path))
  const film = await resolveFilm(artifacts, videos.length > 0)
  const items = (await sendItems(group, outputDir, plan.zips, film)).filter(
    (item) => (plan.placed[item.key] ?? []).length > 0
  )
  if (items.length === 0) throw new Error('Put at least one thing in a destination.')

  const ready = readyOf(artifacts.dir)
  const { result, built, remoteOf } = await sendPlanned({
    items,
    plan,
    folder: projectFolderOf(group, plan),
    manifest,
    session,
    workDir: ready,
    id: group.id,
    label: passengerName(group.passenger),
    groupIds: [group.id],
    shares: (here) => here.some((item) => item.holds.includes('film')),
    onArchive,
    onProgress,
    onCheck,
    onPlan
  })

  const firstRemote = (item: SendItem) => remoteOf.get((plan.placed[item.key] ?? [])[0]!)!
  const recordOf = (item: SendItem | undefined, file?: string) => {
    if (!item) return undefined
    const local = file ?? built.get(item.key)?.[0]
    const at = local ? path.dirname(local) : ready
    const remote = firstRemote(item) + (at === ready ? '' : `/${path.basename(at)}`)
    const verdict = local ? verdictIn(result.files, local, remote) : undefined
    return verdict && item.zip ? { ...verdict, holds: item.holds } : verdict
  }
  const zipHolding = (part: SendPart) => items.find((item) => item.zip && item.holds.includes(part))
  const looseOf = (part: SendPart) => items.find((item) => !item.zip && item.key === part)
  const eachFile = (part: SendPart) => {
    const item = looseOf(part)
    if (!item) return undefined
    return (built.get(item.key) ?? []).flatMap((file) => {
      const verdict = recordOf(item, file)
      return verdict ? [verdict] : []
    })
  }
  const sharing = result.shareUrls.find((s) => s.target.share)
  return {
    ...result,
    film,
    record: {
      at: Math.floor(Date.now() / 1000),
      shareUrl: sharing?.shareUrl,
      film: recordOf(looseOf('film')),
      photos: recordOf(zipHolding('photos')),
      rushes: recordOf(zipHolding('videos')),
      originals: eachFile('videos'),
      photoFiles: eachFile('photos'),
      sent: items.map((item) => ({
        name: item.name,
        holds: item.holds,
        to: (plan.placed[item.key] ?? []).map((destination) => remoteOf.get(destination)!),
        size: item.size,
        ...(item.zip ? { zip: true, contents: item.entries.map((entry) => entry.name) } : {})
      }))
    }
  }
}

export { uploadMontage }
