import { link, mkdir, copyFile, rm } from 'node:fs/promises'
import * as path from 'node:path'
import { PHOTO_LEVEL, VIDEO_LEVEL, writeArchive } from './archive'
import type { ArchiveProgress } from './archive'
import type { CheckProgress, PlanProgress, UploadProgress } from './publish'
import type { NasSession } from './nas'
import { originsOf } from './originEntry'
import { placeFolders } from './originIndex'
import { folderFor, stemFor } from './sendNames'
import { sendFiles } from './sending'
import type { SendItem } from './sending'
import type { Manifest, ManifestFile, SendPlan } from './types'
import { destBaseOf, uploadTargets } from './upload'
import type { UploadTarget } from './upload'
import { stopIfUploadCancelled } from './uploading'

type Reports = {
  onArchive?: (progress: ArchiveProgress & { name: string }) => void
  onProgress?: (progress: UploadProgress & { groupIds: string[] }) => void
  onCheck?: (progress: CheckProgress) => void
  onPlan?: (plan: PlanProgress) => void
}

const linkInto = async (file: string, to: string) => {
  await mkdir(path.dirname(to), { recursive: true })
  await rm(to, { force: true })
  await link(file, to).catch(() => copyFile(file, to))
  return to
}

const sendPlanned = async ({
  items,
  plan,
  folder,
  manifest,
  session,
  workDir,
  id,
  label,
  groupIds,
  shares,
  onArchive,
  onProgress,
  onCheck,
  onPlan
}: {
  items: SendItem[]
  plan: SendPlan
  folder: string
  manifest: Manifest
  session: NasSession
  workDir: string
  id: string
  label: string
  groupIds: string[]
  shares: (here: SendItem[]) => boolean
} & Reports) => {
  const destinations = [...new Set(items.flatMap((item) => plan.placed[item.key] ?? []))]
  const remoteOf = new Map<string, string>()
  for (const destination of destinations) {
    const base = destBaseOf(destination, manifest)
    if (!base) throw new Error(`Choose a NAS folder for ${destination} first.`)
    remoteOf.set(destination, plan.inRoot?.includes(destination) ? base : `${base}/${folder}`)
  }

  await mkdir(workDir, { recursive: true })
  const built = new Map<string, string[]>()
  for (const item of items) {
    stopIfUploadCancelled()
    if (item.zip) {
      const zip = await writeArchive(path.join(workDir, item.name), item.entries, {
        level: item.holds.every((part) => part === 'photos') ? PHOTO_LEVEL : VIDEO_LEVEL,
        onProgress: (progress) => onArchive?.({ ...progress, name: item.name })
      })
      built.set(item.key, zip ? [zip] : [])
    } else
      built.set(
        item.key,
        await Promise.all(
          item.entries.map((entry) => linkInto(entry.file, path.join(workDir, entry.name)))
        )
      )
  }

  const targets: UploadTarget[] = destinations.flatMap((destination) => {
    const remote = remoteOf.get(destination)!
    const here = items.filter((item) => (plan.placed[item.key] ?? []).includes(destination))
    const files = here.flatMap((item) => built.get(item.key) ?? [])
    const folders = [...new Set(files.map((file) => path.dirname(file)))].sort(
      (a, b) => Number(b === workDir) - Number(a === workDir)
    )
    return folders.map((sub) => {
      const inside = path.relative(workDir, sub)
      return {
        key: `send:${id}:${destination}:${path.basename(sub)}`,
        label: `${label} in ${destination}`,
        localDir: sub,
        remoteDir: inside === '' ? remote : `${remote}/${inside}`,
        destination,
        groupIds,
        files: files.filter((file) => path.dirname(file) === sub),
        share: sub === workDir && shares(here)
      }
    })
  })

  const result = await uploadTargets({
    session,
    targets,
    origins: originsOf(manifest),
    folders: placeFolders(manifest),
    onProgress,
    onCheck,
    onPlan
  })
  return { result, built, remoteOf }
}

const uploadFiles = async ({
  outputDir,
  manifest,
  files,
  name,
  session,
  plan,
  ...reports
}: {
  outputDir: string
  manifest: Manifest
  files: ManifestFile[]
  name: string
  session: NasSession
  plan: SendPlan
} & Reports) => {
  const all = await sendFiles(files, stemFor(name, files), plan.zips)
  if (all.length === 0) throw new Error('None of these files is on this machine any more.')
  const items = all.filter((item) => (plan.placed[item.key] ?? []).length > 0)
  if (items.length === 0) throw new Error('Put at least one thing in a destination.')
  const folder = folderFor(name, plan, 'files')
  const { result } = await sendPlanned({
    items,
    plan,
    folder,
    manifest,
    session,
    workDir: path.join(outputDir, '.send', folder),
    id: folder,
    label: name,
    groupIds: [],
    shares: () => false,
    ...reports
  })
  return result
}

export { sendPlanned, uploadFiles }
export type { Reports }
