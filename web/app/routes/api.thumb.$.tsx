import { ffmpegPath, getOutputDir, isVideoFile } from '@skydock/scripts'
import { spawn } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { isOnCamera } from '../../../packages/skydock-scripts/src/cameraWatch'
import { limited } from '../../../packages/skydock-scripts/src/lib/queue'

const DEFAULT_WIDTH = 80

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

const extractFrame = (filePath: string, seek: number, width: number) =>
  new Promise<Buffer>((resolve, reject) => {
    const seekArgs = isVideoFile(filePath) ? ['-ss', String(seek), '-skip_frame', 'nokey'] : []
    const child = spawn(ffmpegPath(), [
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
    const stuck = setTimeout(() => child.kill('SIGKILL'), 30_000)
    const chunks: Array<Buffer> = []
    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      clearTimeout(stuck)
      if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks))
      else reject(new Error(`ffmpeg exited with code ${code}`))
    })
  })

const keptAt = (filePath: string, at: fs.Stats, seek: number, width: number) => {
  const of = `${filePath}|${at.mtimeMs}|${at.size}|${seek}|${width}`
  const named = crypto.createHash('sha1').update(of).digest('hex')
  return path.join(getOutputDir(), '.thumbs', `${named}.jpg`)
}

const keep = (where: string, jpeg: Buffer) => {
  try {
    fs.mkdirSync(path.dirname(where), { recursive: true })
    const tmp = `${where}.${process.pid}.part`
    fs.writeFileSync(tmp, jpeg)
    fs.renameSync(tmp, where)
  } catch {}
}

const cutting = limited<Buffer>(3)

const asJpeg = (jpeg: Buffer) =>
  new Response(new Uint8Array(jpeg), {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(jpeg.length),
      'Content-Type': 'image/jpeg'
    }
  })

const loader = async ({
  params,
  request
}: {
  params: Record<string, string | undefined>
  request: Request
}) => {
  const splat = params['*'] ?? ''
  const work = getOutputDir()
  const inWork = path.join(work, splat)
  const onCamera = path.join(path.sep, splat)
  const filePath =
    inWork.startsWith(`${work}${path.sep}`) && fs.existsSync(inWork) ? inWork : onCamera

  if (filePath === onCamera && !(isOnCamera(onCamera) && fs.statSync(onCamera).isFile())) {
    return new Response('Not found', { status: 404 })
  }

  const url = new URL(request.url)
  const seek = clampSeek(url.searchParams.get('seek'))
  const width = clampWidth(url.searchParams.get('width'))

  const kept = keptAt(filePath, fs.statSync(filePath), seek, width)
  try {
    return asJpeg(fs.readFileSync(kept))
  } catch {}

  try {
    const jpeg = await cutting(
      kept,
      () =>
        extractFrame(filePath, seek, width).catch((e: unknown) =>
          seek > 0 && isVideoFile(filePath) ? extractFrame(filePath, 0, width) : Promise.reject(e)
        ),
      request.signal
    )
    keep(kept, jpeg)
    return asJpeg(jpeg)
  } catch {
    return new Response('Thumbnail unavailable', { status: 404 })
  }
}

export { loader }
