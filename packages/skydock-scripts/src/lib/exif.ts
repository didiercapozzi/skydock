import * as childProcess from 'node:child_process'
import { PHOTO_EXTENSIONS_SET, VIDEO_EXTENSIONS_SET } from '../constants'
import { checkExiftool, getExtension, parseExiftoolCsv } from '../utils'

type BuildExifOptions = {
  photoTags: string[]
  videoTags: string[]
  parse: (raw: string) => string | null
}

const buildExifMap = (files: string[], options: BuildExifOptions): Map<string, string> => {
  const map = new Map<string, string>()

  if (!checkExiftool() || files.length === 0) return map

  const jpgFiles = files.filter((f) => PHOTO_EXTENSIONS_SET.has(getExtension(f)))
  const mp4Files = files.filter((f) => VIDEO_EXTENSIONS_SET.has(getExtension(f)))

  const run = (targets: string[], tags: string[]) => {
    if (targets.length === 0 || tags.length === 0) return
    try {
      const tagArgs = tags.join(' ')
      const fileArgs = targets.map((f) => `"${f}"`).join(' ')
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

  run(jpgFiles, options.photoTags)
  run(mp4Files, options.videoTags)

  return map
}

export { buildExifMap, checkExiftool }
