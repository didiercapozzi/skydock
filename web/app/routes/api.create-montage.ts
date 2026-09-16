import * as fs from 'node:fs'
import * as path from 'node:path'
import { ZipArchive } from 'archiver'
import { z } from 'zod'
import { getGroupProcessedDir, getOutputDir, isVideoFile, loadManifest } from '@skydock/scripts'
import { createMontageProject } from '../../../packages/skydock-scripts/src/montage'
import type { Route } from './+types/api.create-montage'

const searchParamsArgs = z.object({
  groupId: z.string()
})

const listFiles = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        return entry.isDirectory() ? listFiles(full) : [full]
      })
    : []

const zipFiles = async (zipPath: string, entries: { file: string; name: string }[]) => {
  if (entries.length === 0) return null
  const output = fs.createWriteStream(zipPath)
  const archive = new ZipArchive({ zlib: { level: 1 } })
  await new Promise<void>((resolve, reject) => {
    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)
    for (const entry of entries) archive.file(entry.file, { name: entry.name })
    archive.finalize()
  })
  return zipPath
}

const loader = async ({ request }: Route.LoaderArgs) => {
  const parsed = searchParamsArgs.safeParse({
    groupId: new URL(request.url).searchParams.get('groupId') ?? undefined
  })
  if (!parsed.success) return Response.json({ error: 'Missing groupId' }, { status: 400 })

  const outputDir = getOutputDir()
  const manifest = loadManifest(`${outputDir}/manifest.json`)
  if (!manifest) {
    return Response.json({ error: 'No manifest found. Run a scan first.' }, { status: 422 })
  }

  const group = manifest.groups.find((g) => g.id === parsed.data.groupId)
  if (!group) return Response.json({ error: 'Group not found.' }, { status: 404 })
  if (!group.processed) return Response.json({ error: 'Group not processed yet.' }, { status: 422 })

  const { dir: groupDir, baseName } = getGroupProcessedDir(outputDir, group)
  if (!fs.existsSync(groupDir)) {
    return Response.json({ error: 'Processed folder not found.' }, { status: 422 })
  }
  if (fs.readdirSync(groupDir).some((f) => f.endsWith('.kdenlive'))) {
    return Response.json({ error: 'Montage already created.' }, { status: 422 })
  }

  /* the processed copies are already renamed and cropped — the timeline just lays them out */
  const processed = listFiles(groupDir)
  const videos = processed.filter(isVideoFile).sort()
  const photos = processed.filter((f) => !isVideoFile(f)).sort()

  const title = group.passenger
    ? `${group.passenger.firstname} ${group.passenger.lastname}`.trim()
    : group.label

  const { projectPath, filmPath, template } = createMontageProject({
    groupDir,
    baseName,
    title,
    clips: videos.map((file) => ({ path: file }))
  })

  const photosZip = await zipFiles(
    path.join(groupDir, `${baseName}.photos.zip`),
    photos.map((file) => ({ file, name: path.basename(file) }))
  )

  /* the rushes are the originals the edit came from, kept off the passenger's folder */
  const rushes = group.files.filter((f) => isVideoFile(f.path) && fs.existsSync(f.path))
  const rushesZip = await zipFiles(
    path.join(groupDir, `${baseName}.rushes.zip`),
    rushes.map((f) => ({ file: f.path, name: f.filename }))
  )

  return { ok: true, projectPath, filmPath, template, photosZip, rushesZip, clips: videos.length }
}

export { loader, searchParamsArgs }
