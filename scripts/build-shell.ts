import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

/* The window's own two files, built into what Electron runs: it reads JavaScript, and everything
   here is written in TypeScript.
   Run: `npx tsx scripts/build-shell.ts` — `npm run app` and `npm run installers` run it first.

   Both are built for the app's own Node rather than for a browser, and Electron's own parts are
   left where they are: they belong to the program running this, not to what is built. */

const here = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const into = path.join(root, 'build', 'electron')

/* The program the window is drawn by. It comes down with the package, but a machine whose npm does
   not run a dependency's own install script has the package and no program, and the first anybody
   hears of it is `electron: not found`. */
const ensureElectron = () => {
  const electron = path.join(root, 'node_modules', 'electron')
  if (!fs.existsSync(electron)) throw new Error('Electron is not installed — run npm install')
  if (fs.existsSync(path.join(electron, 'dist'))) return
  console.log('[SkyDock] fetching the program the window is drawn by')
  execFileSync(process.execPath, ['install.js'], { cwd: electron, stdio: 'inherit' })
}

/* Written where Electron loads them: the app itself is one file, and the preload is the little that
   the page is allowed to ask of the window. Both are what the machine runs rather than what anybody
   reads, so they are built rather than kept. */
const shell = async () => {
  await build({
    entryPoints: [path.join(root, 'electron', 'main.ts')],
    outfile: path.join(into, 'main.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    /* Electron's own, and the updater it hands the release list to: both are beside the app when it
       runs, and bundling a copy of either is a copy that cannot be replaced */
    external: ['electron', 'electron-updater'],
    logLevel: 'info'
  })
  await build({
    entryPoints: [path.join(root, 'electron', 'preload.ts')],
    outfile: path.join(into, 'preload.cjs'),
    bundle: true,
    platform: 'node',
    /* a preload is loaded before anything else in the page, which is a place with no modules in it */
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    logLevel: 'info'
  })
}

ensureElectron()
await shell()
console.log(`[SkyDock] the window is built into ${path.relative(root, into)}`)
