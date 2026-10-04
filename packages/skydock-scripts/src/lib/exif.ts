import * as childProcess from 'node:child_process'
import { z } from 'zod'
import { PHOTO_EXTENSIONS_SET, VIDEO_EXTENSIONS_SET } from '../constants'
import { run } from '../tools'
import { jsonText } from './json'
import { checkExiftool, exiftoolPath, getExtension, parseExiftoolCsv } from '../utils'

type BuildExifOptions = {
  photoTags: string[]
  videoTags: string[]
  parse: (raw: string) => string | null
}

const EXIF_BATCH_SIZE = 500

const batches = (files: string[]) =>
  Array.from({ length: Math.ceil(files.length / EXIF_BATCH_SIZE) }, (_, i) =>
    files.slice(i * EXIF_BATCH_SIZE, (i + 1) * EXIF_BATCH_SIZE)
  )

const isVideo = (file: string) => VIDEO_EXTENSIONS_SET.has(getExtension(file))

const UTC_MAKERS = /^DJI\b/i

const makersSchema = z.array(
  z.object({
    SourceFile: z.string(),
    Make: z.string().optional().catch(undefined),
    Encoder: z.string().optional().catch(undefined)
  })
)

const makersCommands = (files: string[]) =>
  batches(files.filter(isVideo)).map((batch) => ['-j', '-q', '-Make', '-Encoder', ...batch])

const readMakers = (json: string, into: Set<string>) => {
  const parsed = jsonText.pipe(makersSchema).safeParse(json)
  if (!parsed.success) return
  for (const file of parsed.data)
    if (UTC_MAKERS.test(file.Make ?? '') || UTC_MAKERS.test(file.Encoder ?? ''))
      into.add(file.SourceFile)
}

const exifCommands = (files: string[], options: BuildExifOptions, inUtc: Set<string>) => {
  const photos = files.filter((f) => PHOTO_EXTENSIONS_SET.has(getExtension(f)))
  const videos = files.filter(isVideo)
  const runs: { targets: string[]; tags: string[]; utc: boolean }[] = [
    { targets: photos, tags: options.photoTags, utc: false },
    { targets: videos.filter((f) => !inUtc.has(f)), tags: options.videoTags, utc: false },
    { targets: videos.filter((f) => inUtc.has(f)), tags: options.videoTags, utc: true }
  ]
  return runs.flatMap(({ targets, tags, utc }) =>
    tags.length === 0
      ? []
      : batches(targets).map((batch) => [
          ...(utc ? ['-api', 'QuickTimeUTC=1'] : []),
          '-s3',
          ...tags,
          '-csv',
          ...batch
        ])
  )
}

const execSync = (args: string[]) =>
  childProcess.execFileSync(exiftoolPath(), args, {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'ignore']
  })

const readInto = (map: Map<string, string>, csv: string, options: BuildExifOptions) => {
  for (const [file, raw] of parseExiftoolCsv(csv)) {
    const parsed = options.parse(raw)
    if (parsed) map.set(file, parsed)
  }
}

const buildExifMap = (files: string[], options: BuildExifOptions) => {
  const map = new Map<string, string>()
  if (!checkExiftool() || files.length === 0) return map
  const inUtc = new Set<string>()
  for (const args of makersCommands(files)) {
    try {
      readMakers(execSync(args), inUtc)
    } catch {}
  }
  for (const args of exifCommands(files, options, inUtc)) {
    try {
      readInto(map, execSync(args), options)
    } catch {}
  }
  return map
}

const readExifMap = async (files: string[], options: BuildExifOptions) => {
  const map = new Map<string, string>()
  if (!checkExiftool() || files.length === 0) return map
  const inUtc = new Set<string>()
  for (const args of makersCommands(files)) {
    const ran = await run(exiftoolPath(), args)
    if (ran.ok) readMakers(ran.stdout, inUtc)
  }
  for (const args of exifCommands(files, options, inUtc)) {
    const ran = await run(exiftoolPath(), args)
    if (ran.ok) readInto(map, ran.stdout, options)
  }
  return map
}

export { buildExifMap, checkExiftool, readExifMap }
