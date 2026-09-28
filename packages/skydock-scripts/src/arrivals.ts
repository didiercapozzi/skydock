import { groupNewFiles, looseFiles } from './clustering'
import type { Copied } from './copy'
import { originalEntry } from './importFile'
import { changeBoardSoon, flushBoardChanges, loadManifest, saveManifest } from './manifest'
import { getManifestPath, sortFilesByMtime } from './utils'

/* A file copied off a camera goes on the board as it lands — with the others landing within the same
   half second, written together — loose in Fresh files, rather than
   when the whole card is done (RULES, Copying a camera off) — the same entry a file dropped in gets
   (importFile's originalEntry), and gathered afterwards by the scan's own rule (groupNewFiles). Once the card is done, what came off it
   is gathered into jumps by the gap rule, the way a scan gathers what it finds. A board that cannot
   be read is left alone: the scan at the end finds the files all the same. */

/* one file put on the board, with the others landing about now, unless it is there already */
const putOnBoard = (outputDir: string, { dest, id, shot }: Copied) => {
  changeBoardSoon(getManifestPath(outputDir), (board) => {
    if (!board.files.some((f) => f.id === id)) board.files.push(originalEntry(dest, id, shot))
  })
}

/* What came off a card and is still loose in Fresh files, gathered into jumps. Says how many of the
   files are on the board, so a board that could not take them — none yet, or one that cannot be
   read — is scanned for them instead. */
const gatherArrivals = (outputDir: string, ids: string[]) => {
  const manifestPath = getManifestPath(outputDir)
  /* what landed last is written first, so the jumps are made of every file */
  flushBoardChanges(manifestPath)
  if (ids.length === 0) return 0
  try {
    const manifest = loadManifest(manifestPath)
    if (!manifest) return 0
    const here = new Set(manifest.files.flatMap((f) => (f.id ? [f.id] : [])))
    const loose = looseFiles(manifest).filter((f) => f.id && ids.includes(f.id))
    if (loose.length > 0) {
      groupNewFiles(manifest, sortFilesByMtime(loose))
      saveManifest(manifestPath, manifest)
    }
    return ids.filter((id) => here.has(id)).length
  } catch {
    /* left loose: nothing is lost, and they can be grouped from the board */
    return 0
  }
}

export { gatherArrivals, putOnBoard }
