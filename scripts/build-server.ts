import { build } from 'esbuild'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const web = path.join(here, '..', 'web')
const out = path.join(web, 'build', 'skydock-server.mjs')

const app = path.join(web, 'build', 'server', 'index.js')
if (!fs.existsSync(app)) {
  console.error('Build the app first: npm run build')
  process.exit(1)
}

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
  external: ['*.css'],
  logLevel: 'info'
})

console.log(`[SkyDock] server bundled into ${path.relative(process.cwd(), out)}`)
