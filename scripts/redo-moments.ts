import { copyFile } from 'node:fs/promises'
import {
  getManifestPath,
  getOutputDir,
  loadManifestAsync,
  saveManifest
} from '../packages/skydock-scripts/src/index'

const part = process.argv[2]?.toLowerCase()
const manifestPath = getManifestPath(getOutputDir())
const manifest = await loadManifestAsync(manifestPath)
if (!manifest) throw new Error(`No board in ${manifestPath}`)

const wanted = (name: string) => !part || name.toLowerCase().includes(part)
const cleared = new Set<string>()
for (const file of [...manifest.files, ...manifest.groups.flatMap((g) => g.files)]) {
  if (!wanted(file.filename) || file.moments === undefined) continue
  delete file.moments
  delete file.foundMoments
  cleared.add(file.id ?? file.path)
}

await copyFile(manifestPath, `${manifestPath}.before-moments`)
saveManifest(manifestPath, manifest)
console.log(`${cleared.size} clip(s) forgot their jump. Press Scan on the board to find it again.`)
