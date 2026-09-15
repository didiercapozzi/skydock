import * as fs from 'node:fs'
import * as path from 'node:path'
import { ZipArchive } from 'archiver'
import type { Route } from './+types/api.create-montage'
import { z } from 'zod'
import { getGroupProcessedDir, getOutputDir, loadManifest, walkFiles } from '@skydock/scripts'

const searchParamsArgs = z.object({
  groupId: z.string()
})

const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url)
  const groupId = url.searchParams.get('groupId')

  if (!groupId) {
    return Response.json({ error: 'Missing groupId' }, { status: 400 })
  }

  const outputDir = getOutputDir()
  const manifestPath = `${outputDir}/manifest.json`
  const manifest = loadManifest(manifestPath)
  if (!manifest) {
    return Response.json({ error: 'No manifest found. Run a scan first.' }, { status: 422 })
  }

  const group = manifest.groups.find((g) => g.id === groupId)
  if (!group) {
    return Response.json({ error: 'Group not found.' }, { status: 404 })
  }

  if (!group.processed) {
    return Response.json({ error: 'Group not processed yet.' }, { status: 422 })
  }

  const { dir: groupDir } = getGroupProcessedDir(outputDir, group)
  if (!fs.existsSync(groupDir)) {
    return Response.json({ error: 'Processed folder not found.' }, { status: 422 })
  }

  // Check if .kdenlive file already exists (reprocess protection)
  const kdenliveFiles = fs.readdirSync(groupDir).filter((f) => f.endsWith('.kdenlive'))
  if (kdenliveFiles.length > 0) {
    return Response.json({ error: 'Montage already created.' }, { status: 422 })
  }

  // Create a simple kdenlive project file
  const kdenliveContent = `<?xml version="1.0" encoding="utf-8"?>
<kdenlive>
  <westley>
    <playlist>
      <entry producer="black" in="0" out="150000"/>
    </playlist>
    <tractor>
      <track producer="playlist0"/>
    </tractor>
  </westley>
  <mlt>
    <profile description="HD 1080p" width="1920" height="1080" progressive="1" sample_aspect_num="1" sample_aspect_den="1" display_aspect_num="16" display_aspect_den="9" frame_rate_num="30" frame_rate_den="1"/>
    <producer id="black" mlt_service="colour" resource="black" length="150000"/>
  </mlt>
</kdenlive>`

  const kdenlivePath = path.join(groupDir, `${group.label.replace(/\s+/g, '_')}.kdenlive`)
  fs.writeFileSync(kdenlivePath, kdenliveContent, 'utf-8')

  // Create a zip of rushes (original videos)
  const zipPath = path.join(groupDir, `${group.label.replace(/\s+/g, '_')}_rushes.zip`)
  const output = fs.createWriteStream(zipPath)
  const archive = new ZipArchive({ zlib: { level: 1 } })

  await new Promise<void>((resolve, reject) => {
    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)

    // Add all files from the processed folder to the zip
    for (const file of walkFiles(groupDir)) {
      const relativePath = path.relative(groupDir, file)
      archive.file(file, { name: relativePath })
    }

    archive.finalize()
  })

  return { ok: true, kdenlivePath, zipPath }
}

export { loader, searchParamsArgs }
