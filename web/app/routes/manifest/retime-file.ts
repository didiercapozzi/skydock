import { retimeFile, saveManifest } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* One file's time corrected on its own (RULES, Times and dates). An uploaded file is past editing,
   and a tandem with an edit takes no change at all. */
const retimeFileIntent: Intent = ({
  data,
  manifest,
  manifestPath,
  frozenFiles,
  refuse,
  refuseFrozen
}) => {
  const id = data.fileIds?.[0]
  if (!id || (data.fileIds?.length ?? 0) > 1) return refuse('Correct one file at a time.')
  if (data.anchorEpoch === undefined || !Number.isFinite(data.anchorEpoch))
    return refuse('That is not a time.')
  if (frozenFiles.has(id)) return refuseFrozen()
  if (manifest.files.some((f) => f.id === id && f.uploaded))
    return refuse('This file is on the storage — uploaded is the end of editing.')
  if (!retimeFile(manifest, id, data.anchorEpoch))
    return refuse('That file is no longer on the board.')
  saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { retimeFileIntent }
