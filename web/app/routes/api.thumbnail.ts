import type { Route } from './+types/api.thumbnail'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'

const CACHE_DIR = path.join(process.cwd(), '.sim', '.thumbnails')

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'])

const getCachePath = (filePath: string): string => {
  const hash = Buffer.from(filePath).toString('base64url').slice(0, 64)
  return path.join(CACHE_DIR, `${hash}.jpg`)
}

const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url)
  const filePath = url.searchParams.get('path')

  if (!filePath || !fs.existsSync(filePath)) {
    return new Response('Not found', { status: 404 })
  }

  const ext = path.extname(filePath).toLowerCase()
  const isImage = IMAGE_EXTENSIONS.has(ext)

  if (isImage) {
    const buffer = fs.readFileSync(filePath)
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg'
    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    })
  }

  const cachePath = getCachePath(filePath)

  if (!fs.existsSync(cachePath)) {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true })
    }

    try {
      execSync(
        `ffmpeg -i "${filePath}" -ss 00:00:01 -vframes 1 -vf "scale=320:-1" "${cachePath}" -y -loglevel error`,
        { timeout: 5000 }
      )
    } catch {
      return new Response('Thumbnail generation failed', { status: 500 })
    }
  }

  const buffer = fs.readFileSync(cachePath)
  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  })
}

export { loader }
