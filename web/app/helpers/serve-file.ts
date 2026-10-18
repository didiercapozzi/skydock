import { createReadStream } from 'node:fs'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { z } from 'zod'

const rangeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative()
})

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.mts': 'video/mp2t',
  '.m4v': 'video/x-m4v',
  '.3gp': 'video/3gpp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.dng': 'image/dng',
  '.raw': 'image/x-raw',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac'
}

const streamFile = (
  filePath: string,
  contentType: string,
  fileSize: number,
  range?: { start: number; end: number } | null
) => {
  const readable = Readable.toWeb(
    createReadStream(filePath, range ?? undefined)
  ) as ReadableStream<Uint8Array>

  const status = range ? 206 : 200
  const headers: Record<string, string> = {
    'Accept-Ranges': 'bytes',
    'Content-Length': String(range ? range.end - range.start + 1 : fileSize),
    'Content-Type': contentType
  }
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${fileSize}`
  }

  return new Response(readable, { status, headers })
}

const serveFile = (filePath: string, request: Request, size: number) => {
  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'

  const rangeHeader = request.headers.get('range')
  let range: { start: number; end: number } | null = null
  if (rangeHeader) {
    const [from = '', to = ''] = rangeHeader.replace(/bytes=/, '').split('-')
    const last = size - 1
    const start = from === '' ? Math.max(0, size - parseInt(to, 10)) : parseInt(from, 10)
    const end = from === '' || to === '' ? last : Math.min(parseInt(to, 10), last)
    const parsed = rangeSchema.safeParse({ start, end })
    if (parsed.success && parsed.data.start <= parsed.data.end) range = parsed.data
  }

  return streamFile(filePath, contentType, size, range)
}

export { serveFile }
