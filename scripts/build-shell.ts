import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const into = path.join(root, 'build', 'electron')

const ensureElectron = () => {
  const electron = path.join(root, 'node_modules', 'electron')
  if (!fs.existsSync(electron)) throw new Error('Electron is not installed — run npm install')
  if (fs.existsSync(path.join(electron, 'dist'))) return
  console.log('[SkyDock] fetching the program the window is drawn by')
  execFileSync(process.execPath, ['install.js'], { cwd: electron, stdio: 'inherit' })
}

const shell = async () => {
  fs.mkdirSync(into, { recursive: true })
  fs.copyFileSync(path.join(root, 'electron', 'welcome.html'), path.join(into, 'welcome.html'))
  await build({
    entryPoints: [path.join(root, 'electron', 'main.ts')],
    outfile: path.join(into, 'main.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', 'electron-updater'],
    logLevel: 'info'
  })
  await build({
    entryPoints: [path.join(root, 'electron', 'preload.ts')],
    outfile: path.join(into, 'preload.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    logLevel: 'info'
  })
}

ensureElectron()
await shell()
console.log(`[SkyDock] the window is built into ${path.relative(root, into)}`)
