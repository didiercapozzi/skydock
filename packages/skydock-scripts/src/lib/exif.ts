import * as childProcess from 'node:child_process'
import { z } from 'zod'
import { PHOTO_EXTENSIONS_SET, VIDEO_EXTENSIONS_SET } from '../constants'
import { run } from '../tools'
import { jsonText } from './json'
import { checkExiftool, getExtension, parseExiftoolCsv } from '../utils'

type BuildExifOptions = {
  photoTags: string[]
  videoTags: string[]
  parse: (raw: string) => string | null
}

const EXIF_BATCH_SIZE = 500

const escapeShellArg = (value: string) => `"${value.replace(/(["$`\\])/g, '\\$1')}"`

const batches = (files: string[]) =>
  Array.from({ length: Math.ceil(files.length / EXIF_BATCH_SIZE) }, (_, i) =>
    files
      .slice(i * EXIF_BATCH_SIZE, (i + 1) * EXIF_BATCH_SIZE)
      .map(escapeShellArg)
      .join(' ')
  )

const isVideo = (file: string) => VIDEO_EXTENSIONS_SET.has(getExtension(file))

/* A video keeps its time in UTC, as the format says it should — but not every camera does: a GoPro
   writes the time on its clock, as a photo does, and a DJI writes UTC. So a video is read as UTC only
   when it comes off a camera known to write it, told by the maker it names itself, and turned into the
   time on this machine's clock; any other is read as it says. */
const UTC_MAKERS = /^DJI\b/i

const makersSchema = z.array(
  z.object({
    SourceFile: z.string(),
    Make: z.string().optional().catch(undefined),
    Encoder: z.string().optional().catch(undefined)
  })
)

const makersCommands = (files: string[]) =>
  batches(files.filter(isVideo)).map((batch) => `exiftool -j -q -Make -Encoder ${batch}`)

const readMakers = (json: string, into: Set<string>) => {
  const parsed = jsonText.pipe(makersSchema).safeParse(json)
  if (!parsed.success) return
  for (const file of parsed.data)
    if (UTC_MAKERS.test(file.Make ?? '') || UTC_MAKERS.test(file.Encoder ?? ''))
      into.add(file.SourceFile)
}

/* the exiftool command lines that read these files' tags, a batch at a time — photos and videos
   apart, since each keeps its capture date under different tags, and the videos kept in UTC apart
   from those kept on the camera's clock */
const exifCommands = (files: string[], options: BuildExifOptions, inUtc: Set<string>) => {
  const photos = files.filter((f) => PHOTO_EXTENSIONS_SET.has(getExtension(f)))
  const videos = files.filter(isVideo)
  return [
    [photos, options.photoTags, ''],
    [videos.filter((f) => !inUtc.has(f)), options.videoTags, ''],
    [videos.filter((f) => inUtc.has(f)), options.videoTags, '-api QuickTimeUTC=1 ']
  ].flatMap(([targets, tags, api]) =>
    tags.length === 0
      ? []
      : batches([...targets]).map(
          (batch) => `exiftool ${api}-s3 ${[...tags].join(' ')} -csv ${batch}`
        )
  )
}

const execSync = (line: string) =>
  childProcess.execSync(line, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })

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
  for (const line of makersCommands(files)) {
    try {
      readMakers(execSync(line), inUtc)
    } catch {}
  }
  for (const line of exifCommands(files, options, inUtc)) {
    try {
      readInto(map, execSync(line), options)
    } catch {}
  }
  return map
}

/* The same, without holding the thread: a card of hundreds of files is read while the board keeps
   answering, which is what a copy started by plugging a camera in needs. */
const readExifMap = async (files: string[], options: BuildExifOptions) => {
  const map = new Map<string, string>()
  if (!checkExiftool() || files.length === 0) return map
  const inUtc = new Set<string>()
  for (const line of makersCommands(files)) {
    const ran = await run(line)
    if (ran.ok) readMakers(ran.stdout, inUtc)
  }
  for (const line of exifCommands(files, options, inUtc)) {
    const ran = await run(line)
    if (ran.ok) readInto(map, ran.stdout, options)
  }
  return map
}

export { buildExifMap, checkExiftool, readExifMap }
