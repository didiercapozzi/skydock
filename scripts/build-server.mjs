import { build } from 'esbuild'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

/* The server the installed app runs: one file, with the app and everything it uses inside it, so it
   needs no node_modules beside it — nothing is installed on the machine it lands on but SkyDock.
   `react-router build` has to have run first: this is built around what it wrote.
   Run: `node scripts/build-server.mjs` */

const here = path.dirname(url.fileURLToPath(import.meta.url))
const web = path.join(here, '..', 'web')
const out = path.join(web, 'build', 'skydock-server.mjs')

const app = path.join(web, 'build', 'server', 'index.js')
if (!fs.existsSync(app)) {
  console.error('Build the app first: npm run build')
  process.exit(1)
}

/* Packages that reach for `require` at runtime — archiver looks its compressors up by name — get it
   back, since an ES module has none of its own. */
const REQUIRE_BACK =
  "import { createRequire as __skydockRequire } from 'node:module'\nconst require = __skydockRequire(import.meta.url)\n"

await build({
  entryPoints: [path.join(web, 'server', 'skydock-server.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: REQUIRE_BACK },
  /* the app's own stylesheet is written beside it and served as a file, not built into the server */
  external: ['*.css'],
  logLevel: 'info'
})

console.log(`[SkyDock] server bundled into ${path.relative(process.cwd(), out)}`)
