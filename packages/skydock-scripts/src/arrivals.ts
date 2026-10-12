import { groupNewFiles, looseFiles } from './clustering'
import type { Copied } from './copy'
import { originalEntry } from './importFile'
import { changeBoardSoon, flushBoardChanges, loadManifestAsync, saveManifest } from './manifest'
import { getManifestPath, sortFilesByMtime } from './utils'

const putOnBoard = (outputDir: string, { dest, id, shot }: Copied) => {
  changeBoardSoon(getManifestPath(outputDir), (board) => {
    if (!board.files.some((f) => f.id === id)) board.files.push(originalEntry(dest, id, shot))
  })
}

const gatherArrivals = async (outputDir: string, ids: string[]) => {
  const manifestPath = getManifestPath(outputDir)
  await flushBoardChanges(manifestPath)
  if (ids.length === 0) return 0
  try {
    const manifest = await loadManifestAsync(manifestPath)
    if (!manifest) return 0
    const here = new Set(manifest.files.flatMap((f) => (f.id ? [f.id] : [])))
    const loose = looseFiles(manifest).filter((f) => f.id && ids.includes(f.id))
    if (loose.length > 0) {
      groupNewFiles(manifest, sortFilesByMtime(loose))
      saveManifest(manifestPath, manifest)
    }
    return ids.filter((id) => here.has(id)).length
  } catch {
    return 0
  }
}

export { gatherArrivals, putOnBoard }
