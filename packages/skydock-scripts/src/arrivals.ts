import { groupNewFiles, looseFiles } from './clustering'
import type { Copied } from './copy'
import { originalEntry } from './importFile'
import { loadManifest, saveManifest } from './manifest'
import { getManifestPath, sortFilesByMtime } from './utils'

/* A file copied off a camera goes on the board the moment it lands, loose in Fresh files, rather than
   when the whole card is done (RULES, Copying a camera off) — the same entry a file dropped in gets
   (importFile's originalEntry), and gathered afterwards by the scan's own rule (groupNewFiles). Once the card is done, what came off it
   is gathered into jumps by the gap rule, the way a scan gathers what it finds. A board that cannot
   be read is left alone: the scan at the end finds the files all the same. */

/* one file put on the board, unless it is there already; says whether it was */
const putOnBoard = (outputDir: string, { dest, id, shot }: Copied) => {
  try {
    const manifestPath = getManifestPath(outputDir)
    const manifest = loadManifest(manifestPath)
    if (!manifest || manifest.files.some((f) => f.id === id)) return false
    manifest.files.push(originalEntry(dest, id, shot))
    saveManifest(manifestPath, manifest)
    return true
  } catch {
    return false
  }
}

/* what came off a card and is still loose in Fresh files, gathered into jumps */
const gatherArrivals = (outputDir: string, ids: string[]) => {
  if (ids.length === 0) return
  try {
    const manifestPath = getManifestPath(outputDir)
    const manifest = loadManifest(manifestPath)
    if (!manifest) return
    const loose = looseFiles(manifest).filter((f) => f.id && ids.includes(f.id))
    if (loose.length === 0) return
    groupNewFiles(manifest, sortFilesByMtime(loose))
    saveManifest(manifestPath, manifest)
  } catch {
    /* left loose: nothing is lost, and they can be grouped from the board */
  }
}

export { gatherArrivals, putOnBoard }
