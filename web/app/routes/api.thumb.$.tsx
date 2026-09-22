import { getOutputDir, isVideoFile } from '@skydock/scripts'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'

const DEFAULT_WIDTH = 80

/* Wide enough for the panel's own picture, which is drawn at 480 and asked for at that: a ceiling
   below what is asked for is a picture stretched from eighty pixels, and nobody judges a frame on
   that. Still a rescale, so it is kilobytes whatever the original weighs. */
const widthSchema = z.number().int().min(16).max(960)
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

/* Videos are seeked to a keyframe; a photo is simply rescaled, so a card full of photos costs a few
   kB each instead of the whole original. A photo comes out the way it was taken: the turn a camera
   wrote into it is applied here, as a browser applies it when it draws the file itself. */
const extractFrame = (filePath: string, seek: number, width: number) =>
  new Promise<Buffer>((resolve, reject) => {
    const seekArgs = isVideoFile(filePath) ? ['-ss', String(seek), '-skip_frame', 'nokey'] : []
    const child = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      ...seekArgs,
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

  if (!fs.existsSync(filePath)) {
    return new Response('Not found', { status: 404 })
  }

  const url = new URL(request.url)
  const seek = clampSeek(url.searchParams.get('seek'))
  const width = clampWidth(url.searchParams.get('width'))

  try {
    /* A clip shorter than the moment asked for has no frame there — a camera's timelapse opens with
       clips of a fraction of a second — so its first frame is taken instead of none at all. */
    const jpeg = await extractFrame(filePath, seek, width).catch((e: unknown) =>
      seek > 0 && isVideoFile(filePath) ? extractFrame(filePath, 0, width) : Promise.reject(e)
    )
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
