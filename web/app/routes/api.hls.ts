import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { getOutputDir } from '@skydock/scripts'
import { jsonError } from '../lib/response.server'
import { resolveAndValidateFile } from '../lib/path.server'
import { buildHlsArgs, rewritePlaylist } from '../lib/hls.server'

const MAX_LIVE = Number(process.env.SKYDOCK_LIVE_MAX ?? 6)
const HLS_POLL_INTERVAL_MS = 50
const HLS_PLAYLIST_TIMEOUT_MS = 10_000
const HLS_SESSION_TTL_MS = 30_000
const active = new Set<ReturnType<typeof spawn>>()

type HlsSession = {
  proc: ReturnType<typeof spawn>
  dir: string
  playlist: string
  timer: ReturnType<typeof setTimeout>
  lastAccess: number
}

const sessions = new Map<string, HlsSession>()

const cleanup = (key: string) => {
  const s = sessions.get(key)
  if (!s) return
  clearTimeout(s.timer)
  sessions.delete(key)
  try {
    s.proc.kill('SIGKILL')
  } catch {}
  active.delete(s.proc)
  try {
    fs.rmSync(s.dir, { recursive: true, force: true })
  } catch {}
}

const scheduleCleanup = (key: string) => {
  const s = sessions.get(key)
  if (!s) return
  clearTimeout(s.timer)
  s.timer = setTimeout(() => cleanup(key), HLS_SESSION_TTL_MS)
  s.lastAccess = Date.now()
}

const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url)
  const rawPath = url.searchParams.get('path')
  const id = url.searchParams.get('id')
  const seek = Number(url.searchParams.get('seek') ?? 0)
  const segment = url.searchParams.get('segment')

  const result = resolveAndValidateFile(rawPath, id)
  if ('error' in result) return result.error
  const resolved = result.resolved

  const sessionKey = `${resolved}:${seek}`

  if (segment) {
    const s = sessions.get(sessionKey)
    if (!s) return jsonError('Segment not found', 404)

    const segPath = path.join(s.dir, segment)
    if (!fs.existsSync(segPath) || !segPath.startsWith(s.dir)) {
      return jsonError('Segment not found', 404)
    }

    scheduleCleanup(sessionKey)

    const body = fs.createReadStream(segPath)
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        body.on('data', (chunk: string | Buffer) => {
          if (typeof chunk === 'string') {
            controller.enqueue(new TextEncoder().encode(chunk))
          } else {
            controller.enqueue(new Uint8Array(chunk))
          }
        })
        body.on('end', () => controller.close())
        body.on('error', (e) => controller.error(e))
      },
      cancel() {
        body.destroy()
      }
    })

    return new Response(webStream, {
      headers: {
        'Content-Type': 'video/mp2t',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  if (active.size >= MAX_LIVE) {
    return jsonError('Too many live transcodes', 429, { 'Retry-After': '2' })
  }

  if (sessions.has(sessionKey)) {
    scheduleCleanup(sessionKey)
    return new Response(sessions.get(sessionKey)!.playlist, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  const hlsDir = path.join(
    getOutputDir(),
    '.cache',
    'hls',
    randomUUID().replace(/-/g, '').slice(0, 16)
  )
  fs.mkdirSync(hlsDir, { recursive: true })

  const args: string[] = buildHlsArgs(resolved, seek, hlsDir)

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  active.add(proc)

  let playlistReady = false
  let playlistContent = ''

  proc.stderr.on('data', () => {})

  const waitForPlaylist = () =>
    new Promise<string>((resolve, reject) => {
      const check = setInterval(() => {
        const p = path.join(hlsDir, 'playlist.m3u8')
        if (fs.existsSync(p)) {
          clearInterval(check)
          playlistContent = fs.readFileSync(p, 'utf-8')
          playlistReady = true
          resolve(playlistContent)
        }
      }, HLS_POLL_INTERVAL_MS)

      const timeout = setTimeout(() => {
        clearInterval(check)
        reject(new Error('HLS playlist timeout'))
      }, HLS_PLAYLIST_TIMEOUT_MS)

      proc.on('close', () => {
        clearTimeout(timeout)
        clearInterval(check)
        if (!playlistReady) reject(new Error('ffmpeg exited before playlist ready'))
      })
    })

  try {
    playlistContent = await waitForPlaylist()
  } catch (e) {
    cleanup(sessionKey)
    return jsonError(e instanceof Error ? e.message : 'HLS transcode failed', 500)
  }

  const baseUrl = `/api/hls?path=${encodeURIComponent(resolved)}${seek > 0 ? `&seek=${seek}` : ''}`
  const rewrittenPlaylist = rewritePlaylist(playlistContent, baseUrl)

  const session: HlsSession = {
    proc,
    dir: hlsDir,
    playlist: rewrittenPlaylist,
    timer: setTimeout(() => cleanup(sessionKey), HLS_SESSION_TTL_MS),
    lastAccess: Date.now()
  }
  sessions.set(sessionKey, session)

  proc.on('close', () => cleanup(sessionKey))
  proc.on('error', () => cleanup(sessionKey))
  request.signal.addEventListener('abort', () => cleanup(sessionKey))

  return new Response(rewrittenPlaylist, {
    headers: {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

export { loader }
