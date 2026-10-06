import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

/* The journey runs the built app, so it has to be built — but only once what it is built from has changed:
   a build is ten seconds, and most runs are of a test that was just mended, not of the app. Run with
   `JOURNEY_REBUILD=1` to build whatever the dates say. */

const web = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..')
const built = path.join(web, 'build', 'skydock-server.mjs')
const FROM = [
  'app',
  'server',
  'public',
  'package.json',
  'vite.config.ts',
  'react-router.config.ts',
  'lingui.config.ts',
  '../packages/skydock-scripts/src',
  '../scripts/build-server.ts'
]

/* the date of the newest file under a path, or of the path itself when it is a file */
const newest = (at: string): number => {
  const full = path.join(web, at)
  if (!fs.existsSync(full)) return 0
  const stat = fs.statSync(full)
  if (!stat.isDirectory()) return stat.mtimeMs
  return fs
    .readdirSync(full, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce(
      (latest, entry) =>
        Math.max(latest, fs.statSync(path.join(entry.parentPath, entry.name)).mtimeMs),
      0
    )
}

const stale =
  !fs.existsSync(built) ||
  process.env.JOURNEY_REBUILD ||
  Math.max(...FROM.map(newest)) > fs.statSync(built).mtimeMs

if (stale) {
  execFileSync('react-router', ['build'], { cwd: web, stdio: 'inherit' })
  execFileSync('tsx', ['../scripts/build-server.ts'], { cwd: web, stdio: 'inherit' })
} else console.log('[journey] the built app is current')
