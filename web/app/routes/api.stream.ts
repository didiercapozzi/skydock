import { spawn } from 'node:child_process'
import { jsonError } from '../lib/response.server'
import { resolveAndValidateFile } from '../lib/path.server'
import { FFMPEG_AUDIO_FLAGS, FFMPEG_VIDEO_FLAGS, buildBaseArgs } from '../lib/ffmpeg.server'

const MAX_LIVE = Number(process.env.SKYDOCK_LIVE_MAX ?? 6)
const MAX_WIDTH = 720
const MIN_WIDTH = 16
const DEFAULT_THUMB_WIDTH = 320
const DEFAULT_VIDEO_WIDTH = 360
const THUMB_JPEG_QUALITY = '3'
const active = new Set<ReturnType<typeof spawn>>()

const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url)
  const rawPath = url.searchParams.get('path')
  const id = url.searchParams.get('id')
  const thumb = url.searchParams.get('thumb') === '1'
  const w = Math.min(
    MAX_WIDTH,
    Math.max(
      MIN_WIDTH,
      Number(url.searchParams.get('w') ?? (thumb ? DEFAULT_THUMB_WIDTH : DEFAULT_VIDEO_WIDTH)) ||
        DEFAULT_VIDEO_WIDTH
    )
  )
  const t = Number(url.searchParams.get('t') ?? url.searchParams.get('at') ?? 0.5)
  const seek = Number(url.searchParams.get('seek') ?? 0)

  const result = resolveAndValidateFile(rawPath, id)
  if ('error' in result) return result.error
  const resolved = result.resolved

  if (active.size >= MAX_LIVE) {
    return jsonError('Too many live transcodes', 429, { 'Retry-After': '2' })
  }

  const args: string[] = []

  if (thumb) {
    const at = Number.isFinite(t) ? t : 0.5
    args.push(
      '-ss',
      String(at),
      '-i',
      resolved,
      '-vframes',
      '1',
      '-vf',
      `scale=${w}:-2`,
      '-q:v',
      THUMB_JPEG_QUALITY,
      '-f',
      'image2',
      'pipe:1'
    )
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    active.add(proc)
    proc.on('close', () => active.delete(proc))
    proc.on('error', () => active.delete(proc))
    request.signal.addEventListener('abort', () => {
      try {
        proc.kill('SIGKILL')
      } catch {}
    })
    proc.stderr.on('data', () => {})

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        proc.stdout.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
        proc.stdout.on('end', () => controller.close())
        proc.stdout.on('error', (e) => controller.error(e))
        proc.on('close', (code) => {
          if (code !== 0 && code !== null) {
            try {
              controller.error(new Error(`ffmpeg thumb exit ${code}`))
            } catch {}
          }
        })
      },
      cancel() {
        try {
          proc.kill('SIGKILL')
        } catch {}
      }
    })

    return new Response(body, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  const ssArgs: string[] = []
  if (Number.isFinite(seek) && seek > 0) ssArgs.push('-ss', String(seek))

  args.push(
    ...buildBaseArgs(resolved, seek),
    '-vf',
    `scale=${w}:-2`,
    ...FFMPEG_VIDEO_FLAGS,
    ...FFMPEG_AUDIO_FLAGS,
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof',
    '-f',
    'mp4',
    'pipe:1'
  )

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  active.add(proc)
  proc.on('close', () => active.delete(proc))
  proc.on('error', () => active.delete(proc))
  request.signal.addEventListener('abort', () => {
    try {
      proc.kill('SIGKILL')
    } catch {}
  })
  proc.stderr.on('data', () => {})

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      proc.stdout.on('data', (chunk: Buffer) => {
        if (chunk.length) controller.enqueue(new Uint8Array(chunk))
      })
      proc.stdout.on('end', () => {
        try {
          controller.close()
        } catch {}
      })
      proc.stdout.on('error', (e) => controller.error(e))
      proc.on('close', (code) => {
        if (code !== 0 && code !== null) {
          try {
            controller.error(new Error(`ffmpeg exit ${code}`))
          } catch {}
        }
      })
    },
    cancel() {
      try {
        proc.kill('SIGKILL')
      } catch {}
    }
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'video/mp4',
      'Transfer-Encoding': 'chunked',
      'Accept-Ranges': 'none',
      'Cache-Control': 'no-store, no-cache',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

export { loader }
