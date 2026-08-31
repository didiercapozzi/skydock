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

const streamResponse = (
  nodeStream: fs.ReadStream,
  size: number,
  contentType: string,
  status = 200,
  contentRange?: string
) => {
  let closed = false

  const body = new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer | string) => {
        if (closed) return
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
        controller.enqueue(new Uint8Array(buf))
      })
      nodeStream.on('end', () => {
        if (!closed) controller.close()
      })
      nodeStream.on('error', (err) => {
        if (!closed) controller.error(err)
      })
    },
    cancel() {
      closed = true
      nodeStream.destroy()
    }
  })

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes'
  }

  if (status === 206 && contentRange) {
    headers['Content-Range'] = contentRange
    headers['Content-Length'] = String(size)
  } else {
    headers['Content-Length'] = String(size)
  }

  return new Response(body, { status, headers })
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

  const contentType = getMimeType(resolved)

  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Accept-Ranges': 'bytes'
      }
    })
  }

  const range = request.headers.get('range')

  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/)
    if (!m) {
      return new Response('Invalid range', {
        status: 416,
        headers: { 'Content-Range': `bytes */${stat.size}` }
      })
    }
    let start: number
    let end: number
    if (m[1] === '' && m[2] !== '') {
      const suffix = parseInt(m[2], 10)
      start = Math.max(0, stat.size - suffix)
      end = stat.size - 1
    } else {
      start = m[1] ? parseInt(m[1], 10) : 0
      end = m[2] ? parseInt(m[2], 10) : stat.size - 1
    }
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${stat.size}` }
      })
    }
    end = Math.min(end, stat.size - 1)
    const chunkSize = end - start + 1
    const stream = fs.createReadStream(resolved, { start, end })
    return streamResponse(stream, chunkSize, contentType, 206, `bytes ${start}-${end}/${stat.size}`)
  }

  const stream = fs.createReadStream(resolved)
  return streamResponse(stream, stat.size, contentType)
}

export { loader }
