import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as url from 'node:url'
import { chromium } from 'playwright'

/* The app's icons, all drawn from `web/public/logo.svg`: the web icons, the favicon and the installers'
   `.png`, `.ico` and `.icns`. Change the drawing there, run `npm run icons`, and nothing else is edited by
   hand. `Mark` in the app draws the same shape with the app's own colours. */

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..')
const pub = path.join(root, 'web/public')
const packaging = path.join(root, 'packaging')
const sizes = [16, 32, 48, 64, 128, 256, 512, 1024]

const svg = fs.readFileSync(path.join(pub, 'logo.svg'))
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-icons-'))
const png = (size: number) => path.join(work, `${size}.png`)

const browser = await chromium.launch()
for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<body style="margin:0"><img src="data:image/svg+xml;base64,${svg.toString('base64')}" width="${size}" height="${size}" style="display:block">`
  )
  await page.screenshot({ path: png(size), omitBackground: true })
}
await browser.close()

const ico = path.join(work, 'icon.ico')
const inIco = [16, 32, 48, 64, 256]
execFileSync('ffmpeg', [
  '-v',
  'error',
  '-y',
  ...inIco.flatMap((size) => ['-i', png(size)]),
  ...inIco.flatMap((_, at) => ['-map', String(at)]),
  '-c:v',
  'png',
  ico
])

/* an .icns is a list of PNGs, each under the name of the size it stands for */
const layers: [string, number][] = [
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512]
]
const chunks = layers.map(([name, size]) => {
  const data = fs.readFileSync(png(size))
  const head = Buffer.alloc(8)
  head.write(name, 0, 'ascii')
  head.writeUInt32BE(data.length + 8, 4)
  return Buffer.concat([head, data])
})
const head = Buffer.alloc(8)
head.write('icns', 0, 'ascii')
head.writeUInt32BE(
  chunks.reduce((sum, chunk) => sum + chunk.length, 8),
  4
)

fs.copyFileSync(png(64), path.join(pub, 'icon-64.png'))
fs.copyFileSync(png(128), path.join(pub, 'icon-128.png'))
fs.copyFileSync(png(256), path.join(pub, 'icon-256.png'))
fs.copyFileSync(ico, path.join(pub, 'favicon.ico'))
fs.copyFileSync(png(512), path.join(packaging, 'icon.png'))
fs.copyFileSync(ico, path.join(packaging, 'icon.ico'))
fs.writeFileSync(path.join(packaging, 'icon.icns'), Buffer.concat([head, ...chunks]))
fs.rmSync(work, { recursive: true })
