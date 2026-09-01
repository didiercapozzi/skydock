import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { getOutputDirPath } from '../lib/scanner.server'
import { loadManifest } from '@skydock/scripts'

const MAX_LIVE = Number(process.env.SKYDOCK_LIVE_MAX ?? 3)
const active = new Set<ReturnType<typeof spawn>>()

const resolvePath = (rawPath: string | null, id: string | null): string | null => {
  if (rawPath) return path.resolve(rawPath)
  if (id) {
    const manifestPath = path.join(getOutputDirPath(), 'manifest.json')
    const manifest = loadManifest(manifestPath)
    if (!manifest) return null
    const f = manifest.files.find((x) => x.id === id)
    if (f) return path.resolve(f.path)
  }
  return null
}

const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url)
  const rawPath = url.searchParams.get('path')
  const id = url.searchParams.get('id')
  const thumb = url.searchParams.get('thumb') === '1'
  const w = Math.min(
    720,
    Math.max(16, Number(url.searchParams.get('w') ?? (thumb ? 320 : 360)) || 360)
  )
  const t = Number(url.searchParams.get('t') ?? url.searchParams.get('at') ?? 0.5)
  const seek = Number(url.searchParams.get('seek') ?? 0)

  const resolved = resolvePath(rawPath, id)
  if (!resolved) return new Response('Missing path or id', { status: 400 })

  const outputDir = getOutputDirPath()
  if (!resolved.startsWith(path.resolve(outputDir)) && !resolved.startsWith('/workspace/output')) {
    if (!fs.existsSync(resolved)) return new Response('File not found', { status: 404 })
  }

  if (!fs.existsSync(resolved)) return new Response('File not found', { status: 404 })
  try {
    if (!fs.statSync(resolved).isFile()) return new Response('Not a file', { status: 400 })
  } catch {
    return new Response('Not a file', { status: 400 })
  }

  if (active.size >= MAX_LIVE) {
    return new Response('Too many live transcodes', {
      status: 429,
      headers: { 'Retry-After': '2' }
    })
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
      '3',
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

  if (active.size >= MAX_LIVE) {
    return new Response('Too many live transcodes', {
      status: 429,
      headers: { 'Retry-After': '2' }
    })
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-live-'))
  const tmpFile = path.join(tmpDir, 'out.mp4')
  const ssArgs: string[] = []
  if (Number.isFinite(seek) && seek > 0) ssArgs.push('-ss', String(seek))

  args.push(
    '-hide_banner',
    '-loglevel',
    'error',
    '-hwaccel',
    'auto',
    ...ssArgs,
    '-i',
    resolved,
    '-vf',
    `scale=${w}:-2`,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '28',
    '-g',
    '60',
    '-force_key_frames',
    'expr:gte(t,n_forced*2)',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    '-movflags',
    'faststart',
    '-f',
    'mp4',
    tmpFile
  )

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  active.add(proc)
  let killed = false
  request.signal.addEventListener('abort', () => {
    killed = true
    try {
      proc.kill('SIGKILL')
    } catch {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })
  proc.stderr.on('data', () => {})

  const exitCode: number | null = await new Promise<number | null>((resolve) => {
    proc.on('close', (code) => {
      active.delete(proc)
      resolve(code)
    })
    proc.on('error', () => {
      active.delete(proc)
      resolve(1)
    })
  })

  if (killed) return new Response('Aborted', { status: 499 })
  if (exitCode !== 0 || !fs.existsSync(tmpFile)) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
    return new Response('Transcode failed', { status: 500 })
  }

  const stat = fs.statSync(tmpFile)
  const fileSize = stat.size
  const range = request.headers.get('range')
  const contentType = 'video/mp4'

  const cleanup = () => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  }

  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/)
    if (m) {
      let start: number
      let end: number
      if (m[1] === '' && m[2] !== '') {
        const suffix = parseInt(m[2], 10)
        start = Math.max(0, fileSize - suffix)
        end = fileSize - 1
      } else {
        start = m[1] ? parseInt(m[1], 10) : 0
        end = m[2] ? parseInt(m[2], 10) : fileSize - 1
      }
      if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end && start < fileSize) {
        end = Math.min(end, fileSize - 1)
        const chunkSize = end - start + 1
        const stream = fs.createReadStream(tmpFile, { start, end })
        stream.on('close', cleanup)
        stream.on('error', cleanup)
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            stream.on('data', (chunk: Buffer | string) => {
              const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
              controller.enqueue(new Uint8Array(buf))
            })
            stream.on('end', () => {
              controller.close()
              cleanup()
            })
            stream.on('error', (e) => {
              controller.error(e)
              cleanup()
            })
          },
          cancel() {
            stream.destroy()
            cleanup()
          }
        })
        return new Response(body, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': String(chunkSize),
            'Cache-Control': 'no-store, no-cache',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }
    }
  }

  const stream = fs.createReadStream(tmpFile)
  stream.on('close', cleanup)
  stream.on('error', cleanup)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('data', (chunk: Buffer | string) => {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
        controller.enqueue(new Uint8Array(buf))
      })
      stream.on('end', () => {
        controller.close()
        cleanup()
      })
      stream.on('error', (e) => {
        controller.error(e)
        cleanup()
      })
    },
    cancel() {
      stream.destroy()
      cleanup()
    }
  })

  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store, no-cache',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

export { loader }
