import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as url from 'node:url'
import { forWindows, systemBuiltFor, unpack } from './system'

const here = path.dirname(url.fileURLToPath(import.meta.url))

const ATTEMPTS = 5

const fetched = async (from: string) => {
  for (let attempt = 1; ; attempt++) {
    const answer = await fetch(from, { redirect: 'follow' }).catch(() => null)
    if (answer?.ok) return answer
    const status = answer?.status ?? 0
    if (attempt === ATTEMPTS || (status !== 0 && status !== 429 && status < 500))
      throw new Error(`${from} answered ${status || 'nothing'}`)
    const told = Number(answer?.headers.get('retry-after'))
    const seconds = Number.isFinite(told) && told > 0 ? told : Math.min(60, 5 * 2 ** attempt)
    console.error(`> ${from} answered ${status || 'nothing'}, again in ${seconds} s`)
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
  }
}

const evermeet = async (tool: string) => {
  const said = await fetched(`https://evermeet.cx/ffmpeg/info/${tool}/release`)
  const release = await said.json()
  const url = release?.download?.zip?.url
  if (!url) throw new Error(`evermeet says nothing about where to get ${tool}`)
  return url
}

type Source = {
  from?: string
  archive: string
  each?: Record<string, string | ((tool: string) => Promise<string>)>
}

const SOURCES: Record<string, Source> = {
  'x86_64-unknown-linux-gnu': {
    from: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
    archive: 'tar.xz'
  },
  'aarch64-unknown-linux-gnu': {
    from: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz',
    archive: 'tar.xz'
  },
  'x86_64-apple-darwin': {
    archive: 'zip',
    each: { ffmpeg: evermeet, ffprobe: evermeet }
  },
  'aarch64-apple-darwin': {
    from: 'https://www.osxexperts.net/ffmpeg711arm.zip',
    archive: 'zip',
    each: {
      ffmpeg: 'https://www.osxexperts.net/ffmpeg711arm.zip',
      ffprobe: 'https://www.osxexperts.net/ffprobe711arm.zip'
    }
  },
  'x86_64-pc-windows-msvc': {
    from: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    archive: 'zip'
  }
}

const download = async (from: string, to: string) => {
  console.error(`> fetching ${from}`)
  const answer = await fetched(from)
  fs.writeFileSync(to, Buffer.from(await answer.arrayBuffer()))
}

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })

const takeOut = (staging: string, tool: string, system: string, into: string) => {
  const called = forWindows(system) ? `${tool}.exe` : tool
  const found = walk(staging).find((file) => path.basename(file) === called)
  if (!found) throw new Error(`${called} is not in what was fetched`)
  const target = path.join(into, called)
  fs.copyFileSync(found, target)
  if (!forWindows(system)) fs.chmodSync(target, 0o755)
  const digest = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')
  console.error(`[SkyDock] ${called}\n           sha256 ${digest}`)
}

const fetchInto = async (system: string, into: string) => {
  const source = SOURCES[system]
  if (!source) throw new Error(`Nothing is listed to fetch for ${system}`)
  const wanted = source.each ?? { both: source.from! }
  const fetchOne = async ([tool, from]: [string, (typeof wanted)[string]]) => {
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-tools-'))
    try {
      const archive = path.join(staging, `tools.${source.archive}`)
      await download(typeof from === 'function' ? await from(tool) : from, archive)
      unpack(archive, staging)
      fs.rmSync(archive, { force: true })
      for (const one of tool === 'both' ? ['ffmpeg', 'ffprobe'] : [tool])
        takeOut(staging, one, system, into)
    } finally {
      fs.rmSync(staging, { recursive: true, force: true })
    }
  }
  for (const one of Object.entries(wanted)) await fetchOne(one)
}

const alreadyThere = (system: string, into: string) =>
  ['ffmpeg', 'ffprobe']
    .map((tool) => path.join(into, forWindows(system) ? `${tool}.exe` : tool))
    .every((target) => fs.existsSync(target))

const system = process.argv[3]?.trim() || systemBuiltFor()
const into = path.resolve(process.argv[2] ?? path.join(here, '..', 'build', 'tools'))
fs.mkdirSync(into, { recursive: true })
if (alreadyThere(system, into)) console.error(`[SkyDock] already fetched, in ${into}`)
else await fetchInto(system, into)
console.log(into)
