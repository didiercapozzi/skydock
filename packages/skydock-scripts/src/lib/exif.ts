import * as childProcess from 'node:child_process'
import { PHOTO_EXTENSIONS_SET, VIDEO_EXTENSIONS_SET } from '../constants'
import { checkExiftool, getExtension, parseExiftoolCsv } from '../utils'

type BuildExifOptions = {
  photoTags: string[]
  videoTags: string[]
  parse: (raw: string) => string | null
}

const EXIF_BATCH_SIZE = 500

const escapeShellArg = (value: string) => `"${value.replace(/(["$`\\])/g, '\\$1')}"`

const buildExifMap = (files: string[], options: BuildExifOptions) => {
  const map = new Map<string, string>()

  if (!checkExiftool() || files.length === 0) return map

  const jpgFiles = files.filter((f) => PHOTO_EXTENSIONS_SET.has(getExtension(f)))
  const mp4Files = files.filter((f) => VIDEO_EXTENSIONS_SET.has(getExtension(f)))

  const run = (targets: string[], tags: string[]) => {
    if (targets.length === 0 || tags.length === 0) return
    for (let i = 0; i < targets.length; i += EXIF_BATCH_SIZE) {
      const batch = targets.slice(i, i + EXIF_BATCH_SIZE)
      try {
        const tagArgs = tags.join(' ')
        const fileArgs = batch.map(escapeShellArg).join(' ')
        const csv = childProcess.execSync(`exiftool -s3 ${tagArgs} -csv ${fileArgs}`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore']
        })
        for (const [file, raw] of parseExiftoolCsv(csv)) {
          const parsed = options.parse(raw)
          if (parsed) map.set(file, parsed)
        }
      } catch {}
    }
  }

  run(jpgFiles, options.photoTags)
  run(mp4Files, options.videoTags)

  return map
}

export { buildExifMap, checkExiftool }
