/* Makes the board forget where the jump is in its clips, so the next pass finds it again — for
   trying the finding out on real footage. Whatever was moved by hand goes too.

     npx tsx scripts/redo-moments.ts [filename-part]

   With a part of a name, only the clips whose name holds it. The manifest is copied beside itself
   first. Then press Scan on the board, or restart the server: the pass runs by itself and each clip
   says how far it has got. Work on the folder SKYDOCK_OUTPUT_DIR names, else the usual one. */
import * as fs from 'node:fs'
import {
  getManifestPath,
  getOutputDir,
  loadManifest,
  saveManifest
} from '../packages/skydock-scripts/src/index'

const part = process.argv[2]?.toLowerCase()
const manifestPath = getManifestPath(getOutputDir())
const manifest = loadManifest(manifestPath)
if (!manifest) throw new Error(`No board in ${manifestPath}`)

const wanted = (name: string) => !part || name.toLowerCase().includes(part)
const cleared = new Set<string>()
for (const file of [...manifest.files, ...manifest.groups.flatMap((g) => g.files)]) {
  if (!wanted(file.filename) || file.moments === undefined) continue
  delete file.moments
  delete file.foundMoments
  cleared.add(file.id ?? file.path)
}

fs.copyFileSync(manifestPath, `${manifestPath}.before-moments`)
saveManifest(manifestPath, manifest)
console.log(`${cleared.size} clip(s) forgot their jump. Press Scan on the board to find it again.`)
