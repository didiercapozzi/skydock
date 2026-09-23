import * as crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as url from 'node:url'
import { forWindows, systemBuiltFor, unpack } from './system'

/* Everything the installed app carries, put where the installer will find it.
   Run: `npm run pack` — `npm run installers` runs it first.

   Two things go in: the app, which is the built page and the server as one file, and the media
   tools. None of it is committed: it is fetched or built for the system being built for. The Node
   that runs the server is the app's own — Electron, told to be Node and nothing else — so there is
   none to carry. */

const here = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const resources = path.join(root, 'build', 'resources')

/* npm and npx are the only things run from here, and on Windows they are scripts rather than
   programs — Node will not start one itself, so a shell is asked to. Both commands are written out
   in this file and hold nothing anybody else chose, so there is nothing in them for a shell to read
   as more than the two words they are. */
const run = (program: string, args: string[], cwd = root) => {
  console.log(`> ${program} ${args.join(' ')}`)
  execFileSync(program, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
}

const clear = (dir: string) => {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
}

/* A program the app carries, among its own files. It is never put where the machine keeps its own:
   an ffmpeg of ours installed over somebody's would be a poor way to arrive. */
const placeProgram = (source: string, name: string, system: string) => {
  const target = path.join(resources, `${name}${forWindows(system) ? '.exe' : ''}`)
  fs.copyFileSync(source, target)
  if (!forWindows(system)) fs.chmodSync(target, 0o755)
  const digest = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')
  console.log(`[SkyDock] ${name} ← ${source}\n           sha256 ${digest}`)
  return target
}

const download = async (from: string, to: string) => {
  console.log(`> fetching ${from}`)
  const answer = await fetch(from)
  if (!answer.ok) throw new Error(`${from} answered ${answer.status}`)
  fs.writeFileSync(to, Buffer.from(await answer.arrayBuffer()))
}

/* Where ffmpeg and ffprobe come from: a folder given for the purpose — which is how a release build
   hands over the ones it fetched — or the ones this machine has, which is right when the machine
   being built on is the system being built for. */
const toolsFrom = () => {
  const told = process.env.SKYDOCK_TOOLS_DIR?.trim()
  return told ? path.resolve(told) : null
}

const onPath = (name: string, system: string) => {
  const called = forWindows(system) ? `${name}.exe` : name
  for (const dir of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const target = path.join(dir, called)
    if (fs.existsSync(target)) return target
  }
  return null
}

const fetchTools = (system: string) => {
  const given = toolsFrom()
  const missing: string[] = []
  for (const tool of ['ffmpeg', 'ffprobe']) {
    const called = forWindows(system) ? `${tool}.exe` : tool
    const source = given ? path.join(given, called) : onPath(tool, system)
    if (!source || !fs.existsSync(source)) {
      missing.push(tool)
      continue
    }
    placeProgram(source, tool, system)
  }
  if (missing.length > 0)
    throw new Error(
      `${missing.join(', ')} not found. Put the ones to ship in a folder and name it in SKYDOCK_TOOLS_DIR, or install them on this machine.`
    )
}

/* ExifTool, which reads the dates and the turns inside files and writes them into what is handed
   over. It is not one program but a program and the several hundred files it reads formats out of,
   so it travels in a folder of its own rather than beside the others.

   Windows gets the build that carries its own Perl, since Windows has none. A Mac and a Linux
   machine get the program itself — it is Perl, and runs on the one their system ships with; there
   is no build for those that carries its own, and the only other way to arrive is an installer that
   puts it on somebody's machine, which is the opposite of what this is for. */
const EXIFTOOL_VERSION = '13.59'

/* where a system's build comes from, what it is called inside, and what has to travel beside it */
type Exiftool = {
  from: string
  archive: string
  folder: string
  program: string
  called: string
  beside: string
}

const EXIFTOOL_SOURCES: Record<string, Exiftool> = {
  windows: {
    from: `https://sourceforge.net/projects/exiftool/files/exiftool-${EXIFTOOL_VERSION}_64.zip/download`,
    archive: 'exiftool.zip',
    folder: `exiftool-${EXIFTOOL_VERSION}_64`,
    /* the name it is packed under says what it does when it is double-clicked: waits for a key */
    program: 'exiftool(-k).exe',
    called: 'exiftool.exe',
    beside: 'exiftool_files'
  },
  posix: {
    from: `https://github.com/exiftool/exiftool/archive/refs/tags/${EXIFTOOL_VERSION}.tar.gz`,
    archive: 'exiftool.tar.gz',
    folder: `exiftool-${EXIFTOOL_VERSION}`,
    program: 'exiftool',
    called: 'exiftool',
    beside: 'lib'
  }
}

const fetchExiftool = async (system: string) => {
  const source = EXIFTOOL_SOURCES[forWindows(system) ? 'windows' : 'posix']!
  const into = path.join(resources, 'exiftool')
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-exiftool-'))
  try {
    const downloaded = path.join(staging, source.archive)
    await download(source.from, downloaded)
    unpack(downloaded, staging)
    const unpacked = path.join(staging, source.folder)
    clear(into)
    const program = path.join(into, source.called)
    fs.copyFileSync(path.join(unpacked, source.program), program)
    if (!forWindows(system)) {
      /* It arrives asking for whatever Perl is on the PATH, and an app opened from the desktop has
         hardly any PATH — it would then be found, run, and read nothing, silently. Both systems
         this goes to keep their Perl in the one place, so it is asked for there. */
      const said = fs.readFileSync(program, 'utf-8')
      fs.writeFileSync(program, said.replace(/^#![^\n]*\n/, '#!/usr/bin/perl\n'))
      fs.chmodSync(program, 0o755)
    }
    fs.cpSync(path.join(unpacked, source.beside), path.join(into, source.beside), {
      recursive: true
    })
    const digest = crypto.createHash('sha256').update(fs.readFileSync(program)).digest('hex')
    console.log(`[SkyDock] exiftool ${EXIFTOOL_VERSION}\n           sha256 ${digest}`)
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

/* The app itself: the page a browser loads, the server that serves it, and the templates SkyDock
   ships with. */
const buildApp = () => {
  run('npm', ['run', 'build'])
  run('npx', ['tsx', path.join('scripts', 'build-server.ts')])
  clear(resources)
  fs.cpSync(path.join(root, 'web', 'build', 'client'), path.join(resources, 'client'), {
    recursive: true
  })
  fs.copyFileSync(
    path.join(root, 'web', 'build', 'skydock-server.mjs'),
    path.join(resources, 'skydock-server.mjs')
  )
  const templates = path.join(root, 'templates')
  if (fs.existsSync(templates))
    fs.cpSync(templates, path.join(resources, 'templates'), { recursive: true })
}

const system = systemBuiltFor()
console.log(`[SkyDock] packing for ${system}`)
buildApp()
await fetchExiftool(system)
fetchTools(system)
console.log(`[SkyDock] everything the app carries is in ${path.relative(root, resources)}`)
