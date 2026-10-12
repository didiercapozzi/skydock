import { groupNewFiles, looseFiles } from './clustering'
import type { Copied } from './copy'
import { stat } from 'node:fs/promises'
import { originalEntry } from './fileId'
import { changeBoardSoon, flushBoardChanges, loadManifestAsync, saveManifest } from './manifest'
import { getManifestPath, sortFilesByMtime } from './utils'

const putOnBoard = async (outputDir: string, { dest, id, shot }: Copied) => {
  const { size } = await stat(dest)
  changeBoardSoon(getManifestPath(outputDir), (board) => {
    if (!board.files.some((f) => f.id === id))
      board.files.push(originalEntry({ path: dest, id, mtime: shot, size }))
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
