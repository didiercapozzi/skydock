/* A work folder the size of a busy season, for timing the board against: so many small files in a
   folder of its own, found by a scan and filed into jumps, destinations and montages the way a real
   week would leave them. Never the live work folder, and never a camera: it makes its own folder
   and says where it is.

     npx tsx scripts/big-board.ts [files] [folder]

   Then point the app at the folder (SKYDOCK_OUTPUT_DIR) and open the board. */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { loadManifest, saveManifest, scanMedia } from '../packages/skydock-scripts/src/index'

const count = Number(process.argv[2] ?? 2000)
const folder = path.resolve(process.argv[3] ?? path.join(os.tmpdir(), `skydock-big-${count}`))
if (folder === path.resolve('/workspace/output') || folder.startsWith('/mnt/'))
  throw new Error('Not there: the big board is made in a folder of its own')

const day = new Date(2026, 7, 1, 9, 0, 0).getTime()
const originals = path.join(folder, 'original_files', '2026-08-01')
fs.mkdirSync(originals, { recursive: true })
for (let i = 0; i < count; i++) {
  const name = `GX${String(i).padStart(6, '0')}.${i % 5 === 0 ? 'JPG' : 'MP4'}`
  const file = path.join(originals, name)
  /* a jump every thirty files, twenty minutes apart, so the gap rule makes jumps of them */
  const at = new Date(day + Math.floor(i / 30) * 20 * 60_000 + (i % 30) * 10_000)
  fs.writeFileSync(file, `${name}:${i}`)
  fs.utimesSync(file, at, at)
}

process.env.SKYDOCK_OUTPUT_DIR = folder
await scanMedia({ outputDir: folder })
const manifestPath = path.join(folder, 'manifest.json')
const board = loadManifest(manifestPath)
if (!board) throw new Error('The scan made no board')
board.destinations = [{ name: 'Yverdon' }, { name: 'Colombier' }]
board.groups.forEach((g, i) => {
  if (i % 3 === 0) g.destination = i % 2 ? 'Yverdon' : 'Colombier'
  else if (i % 3 === 1) {
    g.montageJump = true
    g.passenger = { firstname: `Guest`, lastname: String(i) }
  }
})
saveManifest(manifestPath, board)
console.log(`${count} files, ${board.groups.length} jumps, in ${folder}`)
