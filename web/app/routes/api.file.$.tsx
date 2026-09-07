import * as fs from 'node:fs'
import * as path from 'node:path'
import { getOutputDir } from '@skydock/scripts'

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

  let destroyed = false

  const destroy = () => {
    if (!destroyed) {
      destroyed = true
      nodeStream.destroy()
    }
  }

  const readable = new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) => {
        if (destroyed) return
        try {
          controller.enqueue(new Uint8Array(chunk as unknown as ArrayBuffer))
        } catch {
          destroy()
        }
      })
      nodeStream.on('end', () => {
        if (!destroyed) {
          try {
            controller.close()
          } catch {}
        }
      })
      nodeStream.on('error', (err) => {
        if (!destroyed) {
          try {
            controller.error(err)
          } catch {}
        }
      })
    },
    cancel() {
      destroy()
    }
  })

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
    const parts = rangeHeader.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
    range = { start, end }
  }

  return streamFile(filePath, contentType, stat.size, range)
}

export { loader }
