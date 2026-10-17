import { z } from 'zod'
import { PHOTO_EXTENSIONS_SET, VIDEO_EXTENSIONS_SET } from '../constants'
import { run } from '../tools'
import { jsonText } from './json'
import { exiftoolPath, getExtension, hasCommand, parseExiftoolCsv } from '../utils'

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

const videosSchema = z.array(z.object({ SourceFile: z.string() }).catchall(z.unknown()))

const videoCommands = (files: string[], options: BuildExifOptions) =>
  options.videoTags.length === 0
    ? []
    : batches(files.filter(isVideo)).map((batch) => [
        '-j',
        '-q',
        '-Make',
        '-Encoder',
        ...options.videoTags,
        ...batch
      ])

const readVideos = (
  json: string,
  options: BuildExifOptions,
  into: Map<string, string>,
  inUtc: Set<string>
) => {
  const parsed = jsonText.pipe(videosSchema).safeParse(json)
  if (!parsed.success) return
  for (const { SourceFile: file, ...tags } of parsed.data) {
    if (UTC_MAKERS.test(String(tags.Make ?? '')) || UTC_MAKERS.test(String(tags.Encoder ?? ''))) {
      inUtc.add(file)
      continue
    }
    const raw = options.videoTags
      .map((tag) => tags[tag.slice(1)])
      .find((value) => typeof value === 'string' && /^\d{4}:\d{2}:\d{2}/.test(value))
    const found = typeof raw === 'string' ? options.parse(raw) : null
    if (found) into.set(file, found)
  }
}

const exifCommands = (files: string[], options: BuildExifOptions, inUtc: Set<string>) => {
  const photos = files.filter((f) => PHOTO_EXTENSIONS_SET.has(getExtension(f)))
  const runs: { targets: string[]; tags: string[]; utc: boolean }[] = [
    { targets: photos, tags: options.photoTags, utc: false },
    {
      targets: files.filter(isVideo).filter((f) => inUtc.has(f)),
      tags: options.videoTags,
      utc: true
    }
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

const readInto = (map: Map<string, string>, csv: string, options: BuildExifOptions) => {
  for (const [file, raw] of parseExiftoolCsv(csv)) {
    const parsed = options.parse(raw)
    if (parsed) map.set(file, parsed)
  }
}

const readExifMap = async (files: string[], options: BuildExifOptions) => {
  const map = new Map<string, string>()
  if (files.length === 0 || !(await hasCommand('exiftool'))) return map
  const inUtc = new Set<string>()
  for (const args of videoCommands(files, options)) {
    const ran = await run(await exiftoolPath(), args)
    if (ran.ok) readVideos(ran.stdout, options, map, inUtc)
  }
  for (const args of exifCommands(files, options, inUtc)) {
    const ran = await run(await exiftoolPath(), args)
    if (ran.ok) readInto(map, ran.stdout, options)
  }
  return map
}

export { readExifMap }
