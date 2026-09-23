/* Which system an installer is being made for, and how to open what was fetched for it.

   Every machine that builds one builds for itself — that is what an installer is — except a Mac,
   which makes both kinds from either. `SKYDOCK_TARGET` says which, and the release workflow is what
   says it. */

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

/* Windows has a tar of its own, in System32, and it is bsdtar: it reads a zip, and it reads a path
   that begins with a drive letter. The one a build machine finds first on its PATH is Git's, which
   is GNU tar — that one takes `C:\…` for a machine called C to connect to, and could not read a zip
   even if it got that far. Both of the archives Windows is sent are zips, so it is asked for where
   it is rather than by name. Every other system has one tar, its own, and nothing to choose. */
const unpackProgram = () => {
  if (process.platform !== 'win32') return 'tar'
  const itsOwn = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  return fs.existsSync(itsOwn) ? itsOwn : 'tar'
}

/* Nothing this says goes on the output: a script that unpacks something hands its own answer back
   there, and a second line on it is read as part of that answer. */
const unpack = (archive: string, into: string) => {
  const program = unpackProgram()
  console.error(`> ${program} -xf ${archive} -C ${into}`)
  execFileSync(program, ['-xf', archive, '-C', into], { stdio: ['ignore', 2, 'inherit'] })
}

export { forWindows, systemBuiltFor, unpack }
