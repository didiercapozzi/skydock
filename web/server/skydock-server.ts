import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import * as url from 'node:url'
import { Readable } from 'node:stream'
import { createRequestHandler } from 'react-router'
import type { ServerBuild } from 'react-router'
import {
  cancelProcessing,
  flushAllBoardChanges,
  rememberOutputDir,
  resolveOutputDir,
  stopTools
} from '@skydock/scripts'
import { letGo, sendAnswer, writeOut } from './answer'

/* SkyDock as an installed program: the same app the development server runs, served by Node itself
   on this machine and nowhere else. The window the app opens is a browser pointed at it.

   It binds to 127.0.0.1, so nothing outside the machine can reach the footage, and to whichever port
   it is given — or a free one, which it prints, because a machine that already has something on
   the usual port must still be able to run SkyDock. */

const HOST = '127.0.0.1'

/* what a browser is told a file is; anything else is left to the browser to work out */
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

/* Where the built page and its assets are: said by the installed app, whose files sit in its own
   resources; otherwise beside this one, which is how the build leaves them either way. */
const clientDir = () => {
  const told = process.env.SKYDOCK_CLIENT_DIR?.trim()
  if (told) return path.resolve(told)
  const beside = path.join(here, 'client')
  return fs.existsSync(beside) ? beside : path.join(here, '..', 'build', 'client')
}

/* The file the build wrote for this address, if there is one. Nothing outside that folder is ever
   served, whatever the address says. */
const builtFile = (pathname: string) => {
  const root = clientDir()
  let asked: string
  try {
    asked = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const target = path.join(root, path.normalize(asked))
  if (target !== root && !target.startsWith(root + path.sep)) return null
  try {
    return fs.statSync(target).isFile() ? target : null
  } catch {
    return null
  }
}

/* The built assets carry a hash of their contents in their name, so a browser may keep one for
   good; everything else in there is asked about each time. */
const sendBuilt = async (target: string, res: http.ServerResponse) => {
  const type = TYPES[path.extname(target).toLowerCase()]
  res.writeHead(200, {
    'Content-Length': fs.statSync(target).size,
    ...(type ? { 'Content-Type': type } : {}),
    'Cache-Control': target.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate'
  })
  await writeOut(fs.createReadStream(target), res)
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

const answer = async (handle: Handler, req: http.IncomingMessage, res: http.ServerResponse) => {
  const pathname = new URL(req.url ?? '/', `http://${HOST}`).pathname
  const built = req.method === 'GET' || req.method === 'HEAD' ? builtFile(pathname) : null
  if (built) {
    await sendBuilt(built, res)
    return
  }
  /* a page closed, or a live stream let go of, stops the work that was being done for it */
  const gone = new AbortController()
  res.on('close', () => gone.abort())
  await sendAnswer(await handle(asRequest(req, gone.signal)), res)
}

/* Where the work lives: told by whoever started this — the installed app asks on its first run —
   or the folder remembered from last time, or this machine's usual place. Settled before the app
   is loaded, since everything it does is under it, and remembered so the next start knows. */
const settleWorkFolder = () => {
  const outputDir = resolveOutputDir()
  process.env.SKYDOCK_OUTPUT_DIR = outputDir
  rememberOutputDir(outputDir)
  return outputDir
}

/* Closing means closing: whatever was being prepared is stopped, every tool still running is
   stopped with it, and the port is given back. A copy half written is removed by the run that was
   making it, so what is left on the disk is what was finished. */
const stopOn = (server: http.Server) => {
  let stopping = false
  const stop = () => {
    if (stopping) return
    stopping = true
    cancelProcessing()
    stopTools()
    /* what the board recorded by itself in the last half second is not lost with the server */
    flushAllBoardChanges()
    server.close(() => process.exit(0))
    /* a live stream holds its connection open for as long as the board is there to read it */
    server.closeAllConnections()
    setTimeout(() => process.exit(0), 2000).unref()
  }
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, stop)
  /* The app that started this can go without a word — killed, or gone down — and a server left
     behind holds the port and goes on transcoding for nobody. Whoever starts it says so, and then
     the end of what it is being sent is the end of it. Nothing is ever read from there. */
  if (process.env.SKYDOCK_STOP_WITH_PARENT === '1') {
    process.stdin.resume()
    process.stdin.on('end', stop)
    process.stdin.on('close', stop)
    process.stdin.on('error', stop)
  }
}

const start = async () => {
  const outputDir = settleWorkFolder()
  /* the app as `react-router build` writes it: JavaScript, and not there at all until it is built */
  const build = (await import('../build/server/index.js' as string)) as unknown as ServerBuild
  const handle = createRequestHandler(build, 'production')
  const server = http.createServer((req, res) => {
    answer(handle, req, res).catch((e: unknown) => {
      /* the page let go, which is not something to say or to put right */
      if (letGo(e)) return
      console.error('[SkyDock]', e instanceof Error ? e.message : String(e))
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
    /* the one line whoever started this waits for: the window opens on this port */
    console.log(`SKYDOCK_READY ${port}`)
  })
}

await start()
