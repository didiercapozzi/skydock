import { ffmpegPath, getOutputDir, isVideoFile } from '@skydock/scripts'
import { spawn } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { isOnCamera } from '../../../packages/skydock-scripts/src/cameraWatch'
import { limited } from '../../../packages/skydock-scripts/src/lib/queue'

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
    /* the one the app carries, since a machine SkyDock was installed on has none of its own */
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
    /* a file ffmpeg cannot get through must not hold one of the few places in the queue for ever */
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

/* Cut once and kept. Every frame on the board is an ffmpeg run, and a browser will only ask for six
   at a time: a jump of sixteen clips is a second of squares filling in one after another, every time
   that jump is opened. Kept, it is the one run and then a file read.

   What it is a picture of is in its name — the file, when it was last written, how big it was, the
   moment asked for and the width — so a clip that changed is never answered with the old frame and
   nothing has to be cleared. They are a few kilobytes each and this never removes one: deleting the
   folder loses nothing but the cutting. */
const keptAt = (filePath: string, at: fs.Stats, seek: number, width: number) => {
  const of = `${filePath}|${at.mtimeMs}|${at.size}|${seek}|${width}`
  const named = crypto.createHash('sha1').update(of).digest('hex')
  return path.join(getOutputDir(), '.thumbs', `${named}.jpg`)
}

/* written beside itself and moved into place, so a half-written frame is never read as one */
const keep = (where: string, jpeg: Buffer) => {
  try {
    fs.mkdirSync(path.dirname(where), { recursive: true })
    const tmp = `${where}.${process.pid}.part`
    fs.writeFileSync(tmp, jpeg)
    fs.renameSync(tmp, where)
  } catch {
    /* a folder that cannot be written to costs the keeping, never the picture */
  }
}

/* three frames cut at a time, the rest in turn — and one asked for twice is cut once */
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
  /* a file on a camera plugged in is asked for by its own path, and is shown only when it lies under
     a camera's DCIM folder (RULES, Seeing what is on a camera) */
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
  } catch {
    /* not cut yet, or not kept: cut it now */
  }

  try {
    /* A clip shorter than the moment asked for has no frame there — a camera's timelapse opens with
       clips of a fraction of a second — so its first frame is taken instead of none at all. */
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
