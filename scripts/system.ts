import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SYSTEMS: Record<string, string> = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc'
}

const systemBuiltFor = () => {
  const told = process.env.SKYDOCK_TARGET?.trim()
  if (told) return told
  const itself = `${process.platform}-${process.arch}`
  const known = SYSTEMS[itself]
  if (!known) throw new Error(`SkyDock is not made for ${itself}`)
  return known
}

const forWindows = (system: string) => system.includes('windows')

const unpackProgram = () => {
  if (process.platform !== 'win32') return 'tar'
  const itsOwn = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  return fs.existsSync(itsOwn) ? itsOwn : 'tar'
}

const unpack = (archive: string, into: string) => {
  const program = unpackProgram()
  console.error(`> ${program} -xf ${archive} -C ${into}`)
  execFileSync(program, ['-xf', archive, '-C', into], { stdio: ['ignore', 2, 'inherit'] })
}

export { forWindows, systemBuiltFor, unpack }
