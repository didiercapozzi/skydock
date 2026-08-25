import type { Route } from './+types/api.file'
import * as fs from 'node:fs'
import * as path from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac'
}

const getMimeType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url)
  const filePath = url.searchParams.get('path')

  if (!filePath) {
    return new Response('Missing path parameter', { status: 400 })
  }

  const resolved = path.resolve(filePath)

  if (!fs.existsSync(resolved)) {
    return new Response('File not found', { status: 404 })
  }

  const stat = fs.statSync(resolved)
  if (!stat.isFile()) {
    return new Response('Not a file', { status: 400 })
  }

  const range = request.headers.get('range')
  const contentType = getMimeType(resolved)

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
    const chunkSize = end - start + 1

    const stream = fs.createReadStream(resolved, { start, end })
    const body = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => {
          const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
          controller.enqueue(new Uint8Array(buf))
        })
        stream.on('end', () => controller.close())
        stream.on('error', (err) => controller.error(err))
      }
    })

    return new Response(body, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': contentType
      }
    })
  }

  const stream = fs.createReadStream(resolved)
  const body = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
        controller.enqueue(new Uint8Array(buf))
      })
      stream.on('end', () => controller.close())
      stream.on('error', (err) => controller.error(err))
    }
  })

  return new Response(body, {
    headers: {
      'Content-Length': String(stat.size),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    }
  })
}

export { loader }
