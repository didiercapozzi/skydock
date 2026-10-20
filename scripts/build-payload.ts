import * as crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as url from 'node:url'
import { forWindows, systemBuiltFor, unpack } from './system'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const resources = path.join(root, 'build', 'resources')

const run = (program: string, args: string[], cwd = root) => {
  console.log(`> ${program} ${args.join(' ')}`)
  execFileSync(program, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
}

const clear = (dir: string) => {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
}

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

const EXIFTOOL_VERSION = '13.59'

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
}

const system = systemBuiltFor()
console.log(`[SkyDock] packing for ${system}`)
buildApp()
await fetchExiftool(system)
fetchTools(system)
console.log(`[SkyDock] everything the app carries is in ${path.relative(root, resources)}`)
