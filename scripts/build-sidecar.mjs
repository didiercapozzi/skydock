import { execFileSync } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as url from 'node:url'

/* Everything the installed app carries, put where the installer will find it.
   Run: `node scripts/build-sidecar.mjs` — Tauri runs it itself before a build.

   Three things go in: the app (the built page and the server as one file), the Node that runs the
   server, and the media tools. None of it is committed: it is fetched or built for the system being
   built for, and Tauri wants each program named after that system. */

const here = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const tauri = path.join(root, 'src-tauri')
const binaries = path.join(tauri, 'binaries')
const resources = path.join(tauri, 'resources')

/* The Node the app ships with. Whatever is used to build is neither here nor there: this is what
   runs on the machine SkyDock lands on. */
const NODE_VERSION = 'v22.14.0'

/* Which system this is being built for, as Tauri names it. It says so when it runs this itself;
   otherwise the machine doing the building answers for itself. */
const targetTriple = () => {
  const told = process.env.TAURI_ENV_TARGET_TRIPLE?.trim()
  if (told) return told
  const said = execFileSync('rustc', ['-vV'], { encoding: 'utf-8' })
  const host = /^host:\s*(.+)$/m.exec(said)?.[1]?.trim()
  if (!host) throw new Error('rustc does not say what this machine is')
  return host
}

/* what nodejs.org calls the same system, and how it packs it */
const NODE_BUILDS = {
  'x86_64-unknown-linux-gnu': { name: 'linux-x64', archive: 'tar.xz' },
  'aarch64-unknown-linux-gnu': { name: 'linux-arm64', archive: 'tar.xz' },
  'x86_64-apple-darwin': { name: 'darwin-x64', archive: 'tar.gz' },
  'aarch64-apple-darwin': { name: 'darwin-arm64', archive: 'tar.gz' },
  'x86_64-pc-windows-msvc': { name: 'win-x64', archive: 'zip' },
  'aarch64-pc-windows-msvc': { name: 'win-arm64', archive: 'zip' }
}

const run = (program, args, cwd = root) => {
  console.log(`> ${program} ${args.join(' ')}`)
  execFileSync(program, args, { cwd, stdio: 'inherit' })
}

const clear = (dir) => {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
}

/* Tauri wants a program named after the system it is for, and drops the ending again when it packs
   it. Windows keeps its .exe, which Tauri puts back after the name.

   Each carries SkyDock's name: a Linux package puts them where the machine keeps its own programs,
   and a `node` or an `ffmpeg` of ours installed over somebody's own would be a poor way to arrive. */
const placeProgram = (source, name, triple) => {
  const windows = triple.includes('windows')
  const target = path.join(binaries, `skydock-${name}-${triple}${windows ? '.exe' : ''}`)
  fs.copyFileSync(source, target)
  if (!windows) fs.chmodSync(target, 0o755)
  const digest = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')
  console.log(`[SkyDock] ${name} ← ${source}\n           sha256 ${digest}`)
  return target
}

const download = async (from, to) => {
  console.log(`> fetching ${from}`)
  const answer = await fetch(from)
  if (!answer.ok) throw new Error(`${from} answered ${answer.status}`)
  fs.writeFileSync(to, Buffer.from(await answer.arrayBuffer()))
}

/* The official Node build for this system, unpacked far enough to take the one program out of it.
   `tar` reads a zip as readily as a tarball on every system this builds for. */
const fetchNode = async (triple) => {
  const build = NODE_BUILDS[triple]
  if (!build) throw new Error(`There is no Node build listed for ${triple}`)
  const folder = `node-${NODE_VERSION}-${build.name}`
  const archive = `${folder}.${build.archive}`
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-node-'))
  try {
    const downloaded = path.join(staging, archive)
    await download(`https://nodejs.org/dist/${NODE_VERSION}/${archive}`, downloaded)
    run('tar', ['-xf', downloaded, '-C', staging], staging)
    const unpacked = triple.includes('windows')
      ? path.join(staging, folder, 'node.exe')
      : path.join(staging, folder, 'bin', 'node')
    return placeProgram(unpacked, 'node', triple)
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

/* Where ffmpeg and ffprobe come from: a folder given for the purpose — which is how a release build
   hands over the ones it fetched — or the ones this machine has, which is right when the machine
   being built on is the system being built for. */
const toolsFrom = () => {
  const told = process.env.SKYDOCK_TOOLS_DIR?.trim()
  return told ? path.resolve(told) : null
}

const onPath = (name, triple) => {
  const called = triple.includes('windows') ? `${name}.exe` : name
  for (const dir of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const target = path.join(dir, called)
    if (fs.existsSync(target)) return target
  }
  return null
}

const fetchTools = (triple) => {
  const given = toolsFrom()
  const missing = []
  for (const tool of ['ffmpeg', 'ffprobe']) {
    const called = triple.includes('windows') ? `${tool}.exe` : tool
    const source = given ? path.join(given, called) : onPath(tool, triple)
    if (!source || !fs.existsSync(source)) {
      missing.push(tool)
      continue
    }
    placeProgram(source, tool, triple)
  }
  if (missing.length > 0)
    throw new Error(
      `${missing.join(', ')} not found. Put the ones to ship in a folder and name it in SKYDOCK_TOOLS_DIR, or install them on this machine.`
    )
}

/* ExifTool, which reads the dates and the turns inside files and writes them into what is handed
   over. It is not one program but a program and the several hundred files it reads formats out of,
   so it travels with the app's own files rather than beside its program.

   Windows gets the build that carries its own Perl, since Windows has none. A Mac and a Linux
   machine get the program itself — it is Perl, and runs on the one their system ships with; there
   is no build for those that carries its own, and the only other way to arrive is an installer that
   puts it on somebody's machine, which is the opposite of what this is for. */
const EXIFTOOL_VERSION = '13.59'

const EXIFTOOL_SOURCES = {
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

const fetchExiftool = async (triple) => {
  const source = EXIFTOOL_SOURCES[triple.includes('windows') ? 'windows' : 'posix']
  const into = path.join(resources, 'exiftool')
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-exiftool-'))
  try {
    const downloaded = path.join(staging, source.archive)
    await download(source.from, downloaded)
    run('tar', ['-xf', downloaded, '-C', staging], staging)
    const unpacked = path.join(staging, source.folder)
    clear(into)
    const program = path.join(into, source.called)
    fs.copyFileSync(path.join(unpacked, source.program), program)
    if (!triple.includes('windows')) {
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
  run('node', [path.join('scripts', 'build-server.mjs')])
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

const triple = targetTriple()
console.log(`[SkyDock] packing for ${triple}`)
buildApp()
await fetchExiftool(triple)
fs.mkdirSync(binaries, { recursive: true })
await fetchNode(triple)
fetchTools(triple)
console.log('[SkyDock] everything the app carries is in src-tauri/')
