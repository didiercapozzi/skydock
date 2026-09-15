import * as fs from 'node:fs'
import * as path from 'node:path'
import * as stream from 'node:stream'
import type { Route } from './+types/api.import-file'
import {
  buildGroupBaseName,
  computeFileId,
  getExtension,
  getOutputDir,
  isVideoFile,
  loadManifest,
  parseDayEpoch,
  saveManifest,
  walkFiles
} from '@skydock/scripts'

const isPhotoFile = (filename: string) => {
  const ext = getExtension(filename)
  return ['jpg', 'jpeg', 'png', 'dng', 'raw', 'tif', 'tiff', 'heic', 'heif'].includes(ext)
}

const formatStamp = (ms: number) => {
  const d = new Date(ms)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}${mo}${da}_${h}${mi}${s}`
}

const action = async ({ request }: Route.ActionArgs) => {
  const url = new URL(request.url)
  const groupId = url.searchParams.get('groupId')
  const filename = url.searchParams.get('filename')
  const day = url.searchParams.get('day')

  if (!groupId || !filename) {
    return Response.json({ error: 'Missing groupId or filename' }, { status: 400 })
  }

  const ext = getExtension(filename)
  if (!ext) {
    return Response.json({ error: 'Unsupported file type' }, { status: 400 })
  }
  if (!isVideoFile(filename) && !isPhotoFile(filename)) {
    return Response.json({ error: 'Unsupported file type' }, { status: 400 })
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

  if (!request.body) {
    return Response.json({ error: 'No file data' }, { status: 400 })
  }

  if (group.processed === true) {
    if (group.files.length === 0) {
      return Response.json({ error: 'Group has no files.' }, { status: 422 })
    }

    const dayEpoch = parseDayEpoch(group.day) ?? Math.min(...group.files.map((f) => f.mtime))
    const baseName = buildGroupBaseName(group.passenger, group.label, dayEpoch)

    const processedDir = path.join(outputDir, 'processed')
    const groupDirs = fs.readdirSync(processedDir).filter((d) => d.startsWith(baseName))
    if (groupDirs.length === 0) {
      return Response.json(
        { error: 'Processed folder not found. Process the group again.' },
        { status: 422 }
      )
    }
    const groupDir = path.join(processedDir, groupDirs[0])

    const type = isVideoFile(filename) ? 'videos' : 'photos'
    const typeDir = path.join(groupDir, type)
    fs.mkdirSync(typeDir, { recursive: true })

    const now = Date.now()
    const stamp = formatStamp(now)
    const usedNames = new Set(walkFiles(typeDir).map((f) => path.basename(f)))
    let targetName = `${baseName}_${stamp}.${ext}`
    let counter = 1
    while (usedNames.has(targetName)) {
      targetName = `${baseName}_${stamp}_${counter}.${ext}`
      counter++
    }

    const dest = path.join(typeDir, targetName)

    const nodeReadable = stream.Readable.fromWeb(
      request.body as import('node:stream/web').ReadableStream
    )
    const fileStream = fs.createWriteStream(dest)

    try {
      await new Promise<void>((resolve, reject) => {
        nodeReadable.on('error', reject)
        fileStream.on('error', reject)
        fileStream.on('finish', resolve)
        nodeReadable.pipe(fileStream)
      })
    } catch (err) {
      try {
        fs.unlinkSync(dest)
      } catch {}
      const msg = err instanceof Error ? err.message : 'Write failed'
      return Response.json({ error: msg }, { status: 500 })
    }

    const stat = fs.statSync(dest)
    return { ok: true, filename: targetName, path: dest, size: stat.size, type }
  }

  const targetDay = day || group.day
  const targetDate = targetDay.replace(/\./g, '-')
  const originalDir = path.join(outputDir, 'original_files', targetDate)
  fs.mkdirSync(originalDir, { recursive: true })

  const now = Date.now()
  const stamp = formatStamp(now)
  const usedNames = new Set(fs.readdirSync(originalDir).filter((f) => f.endsWith(`.${ext}`)))
  let targetName = `${path.basename(filename, `.${ext}`)}_${stamp}.${ext}`
  let counter = 1
  while (usedNames.has(targetName)) {
    targetName = `${path.basename(filename, `.${ext}`)}_${stamp}_${counter}.${ext}`
    counter++
  }

  const dest = path.join(originalDir, targetName)

  const nodeReadable = stream.Readable.fromWeb(
    request.body as import('node:stream/web').ReadableStream
  )
  const fileStream = fs.createWriteStream(dest)

  try {
    await new Promise<void>((resolve, reject) => {
      nodeReadable.on('error', reject)
      fileStream.on('error', reject)
      fileStream.on('finish', resolve)
      nodeReadable.pipe(fileStream)
    })
  } catch (err) {
    try {
      fs.unlinkSync(dest)
    } catch {}
    const msg = err instanceof Error ? err.message : 'Write failed'
    return Response.json({ error: msg }, { status: 500 })
  }

  const stat = fs.statSync(dest)
  const fileId = await computeFileId(dest)
  const relPath = path.relative(path.join(outputDir, 'original_files'), dest)

  const existingFile = manifest.files.find((f) => f.id === fileId)
  if (!existingFile) {
    manifest.files.push({
      path: relPath,
      size: stat.size,
      mtime: Math.floor(stat.mtimeMs / 1000),
      filename: targetName,
      id: fileId
    })
  }

  const fileRef = group.files.find((f) => f.id === fileId)
  if (!fileRef) {
    group.files.push({
      path: relPath,
      size: stat.size,
      mtime: Math.floor(stat.mtimeMs / 1000),
      filename: targetName,
      id: fileId
    })
  }

  saveManifest(manifestPath, manifest)

  return { ok: true, filename: targetName, path: dest, size: stat.size, type: 'file', manifest }
}

export { action }
