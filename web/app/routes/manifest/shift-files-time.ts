import { saveManifest, gatherFilesAt } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* Picked files all put on the anchor's day, the one with the lowest time of day at the anchor's time
   and each of the others as far after it as it was in its own day (RULES, Times and dates). An uploaded file is past editing, and a freed montage
   takes no change at all. */
const gatherFilesTime: Intent = async ({
  data,
  manifest,
  manifestPath,
  frozenFiles,
  refuse,
  refuseFrozen
}) => {
  const ids = data.fileIds ?? []
  if (ids.length === 0) return refuse('Pick the files to move in time.')
  if (data.anchorEpoch === undefined || !Number.isFinite(data.anchorEpoch))
    return refuse('That is not a time.')
  if (ids.some((id) => frozenFiles.has(id))) return refuseFrozen()
  if (manifest.files.some((f) => f.id && ids.includes(f.id) && f.uploaded))
    return refuse('A file is on the storage — uploaded is the end of editing.')
  if (!gatherFilesAt(manifest, new Set(ids), data.anchorEpoch))
    return refuse('Those files are no longer on the board.')
  await saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { gatherFilesTime }
