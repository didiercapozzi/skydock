import { getOutputDir, isVideoFile } from '@skydock/scripts'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'

const DEFAULT_WIDTH = 80

const widthSchema = z.number().int().min(16).max(240)
const seekSchema = z.number().nonnegative()

const clampWidth = (raw: string | null) => {
  const fallback = DEFAULT_WIDTH
  const parsed = widthSchema.safeParse(raw ? parseInt(raw, 10) : fallback)
  if (!parsed.success) return fallback
  return parsed.data
}

const clampSeek = (raw: string | null) => {
  const parsed = seekSchema.safeParse(raw ? parseFloat(raw) : 0)
  if (!parsed.success) return 0
  return parsed.data
}

const extractFrame = (filePath: string, seek: number, width: number) =>
  new Promise<Buffer>((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(seek),
      '-skip_frame',
      'nokey',
      '-i',
      filePath,
      '-frames:v',
      '1',
      '-an',
      '-vf',
      `scale=${width}:-2:flags=lanczos`,
      '-q:v',
      '4',
      '-f',
      'mjpeg',
      'pipe:1'
    ])
    const chunks: Array<Buffer> = []
    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks))
      else reject(new Error(`ffmpeg exited with code ${code}`))
    })
  })

const loader = async ({
  params,
  request
}: {
  params: Record<string, string | undefined>
  request: Request
}) => {
  const splat = params['*'] ?? ''
  const filePath = path.join(getOutputDir(), splat)

  if (!fs.existsSync(filePath) || !isVideoFile(filePath)) {
    return new Response('Not found', { status: 404 })
  }

  const url = new URL(request.url)
  const seek = clampSeek(url.searchParams.get('seek'))
  const width = clampWidth(url.searchParams.get('width'))

  try {
    const jpeg = await extractFrame(filePath, seek, width)
    return new Response(new Uint8Array(jpeg), {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(jpeg.length),
        'Content-Type': 'image/jpeg'
      }
    })
  } catch {
    return new Response('Thumbnail unavailable', { status: 404 })
  }
}

export { loader }
