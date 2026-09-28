import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { getOutputDir } from '@skydock/scripts'

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
  '.heif': 'image/heif'
}

const streamFile = (
  filePath: string,
  contentType: string,
  fileSize: number,
  range?: { start: number; end: number } | null
) => {
  const nodeStream = range
    ? fs.createReadStream(filePath, { start: range.start, end: range.end })
    : fs.createReadStream(filePath)

  /* Read as it is sent, never ahead of it: a clip of several gigabytes asked for from its start
     is read only as fast as the page takes it, instead of being pulled into memory as fast as the
     disk can go. A page that lets go stops the reading. */
  const readable = new ReadableStream<Uint8Array>(
    {
      start: (controller) => {
        nodeStream.on('data', (chunk) => {
          controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk)
          /* the page has not taken what it was given yet: wait for it */
          if ((controller.desiredSize ?? 1) <= 0) nodeStream.pause()
        })
        nodeStream.on('end', () => controller.close())
        nodeStream.on('error', (err) => controller.error(err))
      },
      pull: () => {
        nodeStream.resume()
      },
      cancel: () => {
        nodeStream.destroy()
      }
    },
    /* a few chunks ahead of the page, no more */
    { highWaterMark: 4 }
  )

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

const loader = async ({
  params,
  request
}: {
  params: Record<string, string | undefined>
  request: Request
}) => {
  const splat = params['*'] ?? ''
  const filePath = path.join(getOutputDir(), splat)

  if (!fs.existsSync(filePath)) {
    return new Response('Not found', { status: 404 })
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'
  const stat = fs.statSync(filePath)

  const rangeHeader = request.headers.get('range')
  let range: { start: number; end: number } | null = null
  if (rangeHeader) {
    const [from = '', to = ''] = rangeHeader.replace(/bytes=/, '').split('-')
    /* "bytes=-N" is the last N bytes; an end past the file is the file's end */
    const last = stat.size - 1
    const start = from === '' ? Math.max(0, stat.size - parseInt(to, 10)) : parseInt(from, 10)
    const end = from === '' || to === '' ? last : Math.min(parseInt(to, 10), last)
    const parsed = rangeSchema.safeParse({ start, end })
    if (parsed.success && parsed.data.start <= parsed.data.end) range = parsed.data
  }

  return streamFile(filePath, contentType, stat.size, range)
}

export { loader }
