import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import * as http from 'node:http'
import * as path from 'node:path'
import * as url from 'node:url'
import { Readable } from 'node:stream'
import { createRequestHandler } from 'react-router'
import type { ServerBuild } from 'react-router'
import {
  cancelProcessing,
  flushAllBoardChanges,
  messageOf,
  rememberOutputDir,
  resolveOutputDir,
  stopTools
} from '@skydock/scripts'
import { letGo, sendAnswer, writeOut } from './answer'

const HOST = '127.0.0.1'

const TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2'
}

const here = path.dirname(url.fileURLToPath(import.meta.url))

const clientDir = () => {
  const told = process.env.SKYDOCK_CLIENT_DIR?.trim()
  if (told) return path.resolve(told)
  const beside = path.join(here, 'client')
  return existsSync(beside) ? beside : path.join(here, '..', 'build', 'client')
}

const builtFile = async (root: string, pathname: string) => {
  let asked: string
  try {
    asked = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const target = path.join(root, path.normalize(asked))
  if (target !== root && !target.startsWith(root + path.sep)) return null
  try {
    const found = await stat(target)
    return found.isFile() ? { target, size: found.size } : null
  } catch {
    return null
  }
}

const sendBuilt = async (
  { target, size }: { target: string; size: number },
  res: http.ServerResponse
) => {
  const type = TYPES[path.extname(target).toLowerCase()]
  res.writeHead(200, {
    'Content-Length': size,
    ...(type ? { 'Content-Type': type } : {}),
    'Cache-Control': target.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate'
  })
  await writeOut(createReadStream(target), res)
}

const asRequest = (req: http.IncomingMessage, signal: AbortSignal) => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const one of value) headers.append(name, one)
    else if (value !== undefined) headers.set(name, value)
  }
  const method = req.method ?? 'GET'
  const takesBody = method !== 'GET' && method !== 'HEAD'
  return new Request(new URL(req.url ?? '/', `http://${req.headers.host ?? HOST}`), {
    method,
    headers,
    signal,
    ...(takesBody
      ? { body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: 'half' }
      : {})
  } as RequestInit & { duplex?: 'half' })
}

type Handler = ReturnType<typeof createRequestHandler>

const answer = async (
  handle: Handler,
  root: string,
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  const pathname = new URL(req.url ?? '/', `http://${HOST}`).pathname
  const built =
    req.method === 'GET' || req.method === 'HEAD' ? await builtFile(root, pathname) : null
  if (built) {
    await sendBuilt(built, res)
    return
  }
  const gone = new AbortController()
  res.on('close', () => gone.abort())
  await sendAnswer(await handle(asRequest(req, gone.signal)), res)
}

const settleWorkFolder = () => {
  const outputDir = resolveOutputDir()
  process.env.SKYDOCK_OUTPUT_DIR = outputDir
  rememberOutputDir(outputDir)
  return outputDir
}

const stopOn = (server: http.Server) => {
  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    cancelProcessing()
    stopTools()
    setTimeout(() => process.exit(0), 2000).unref()
    await flushAllBoardChanges()
    server.close(() => process.exit(0))
    server.closeAllConnections()
  }
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, stop)
  if (process.env.SKYDOCK_STOP_WITH_PARENT === '1') {
    process.stdin.resume()
    process.stdin.on('end', stop)
    process.stdin.on('close', stop)
    process.stdin.on('error', stop)
  }
}

const start = async () => {
  const outputDir = settleWorkFolder()
  const build = (await import('../build/server/index.js' as string)) as unknown as ServerBuild
  const handle = createRequestHandler(build, 'production')
  const root = clientDir()
  const server = http.createServer((req, res) => {
    answer(handle, root, req, res).catch((e: unknown) => {
      if (letGo(e)) return
      console.error('[SkyDock]', messageOf(e))
      if (res.destroyed) return
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('SkyDock could not answer that.')
    })
  })
  stopOn(server)
  server.listen(Number(process.env.PORT ?? 0), HOST, () => {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    console.log(`[SkyDock] working in ${outputDir}`)
    console.log(`SKYDOCK_READY ${port}`)
  })
}

await start()
