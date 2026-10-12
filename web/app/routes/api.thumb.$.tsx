import { ffmpegPath, getOutputDir, isVideoFile } from '@skydock/scripts'
import { spawn } from 'node:child_process'
import * as crypto from 'node:crypto'
import type { Stats } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
import { isOnCamera } from '../../../packages/skydock-scripts/src/cameraWatch'
import { statOrNull } from '../../../packages/skydock-scripts/src/lib/fs'
import { limited } from '../../../packages/skydock-scripts/src/lib/queue'

const DEFAULT_WIDTH = 80

const widthSchema = z.number().int().min(16).max(960).catch(DEFAULT_WIDTH)
const seekSchema = z.number().nonnegative().catch(0)

const extractFrame = async (filePath: string, seek: number, width: number) => {
  const program = await ffmpegPath()
  return new Promise<Buffer>((resolve, reject) => {
    const seekArgs = isVideoFile(filePath) ? ['-ss', String(seek), '-skip_frame', 'nokey'] : []
    const child = spawn(program, [
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
}

const keptAt = (filePath: string, at: Stats, seek: number, width: number) => {
  const of = `${filePath}|${at.mtimeMs}|${at.size}|${seek}|${width}`
  const named = crypto.createHash('sha1').update(of).digest('hex')
  return path.join(getOutputDir(), '.thumbs', `${named}.jpg`)
}

const keep = async (where: string, jpeg: Buffer) => {
  try {
    await mkdir(path.dirname(where), { recursive: true })
    const tmp = `${where}.${process.pid}.part`
    await writeFile(tmp, jpeg)
    await rename(tmp, where)
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
  const inWorkStat = inWork.startsWith(`${work}${path.sep}`) ? await statOrNull(inWork) : null
  const found = inWorkStat ?? (isOnCamera(onCamera) ? await statOrNull(onCamera) : null)
  if (!found || (!inWorkStat && !found.isFile())) {
    return new Response('Not found', { status: 404 })
  }
  const filePath = inWorkStat ? inWork : onCamera

  const url = new URL(request.url)
  const rawSeek = url.searchParams.get('seek')
  const rawWidth = url.searchParams.get('width')
  const seek = seekSchema.parse(rawSeek ? parseFloat(rawSeek) : 0)
  const width = widthSchema.parse(rawWidth ? parseInt(rawWidth, 10) : DEFAULT_WIDTH)

  const kept = keptAt(filePath, found, seek, width)
  try {
    return asJpeg(await readFile(kept))
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
    await keep(kept, jpeg)
    return asJpeg(jpeg)
  } catch {
    return new Response('Thumbnail unavailable', { status: 404 })
  }
}

export { loader }
