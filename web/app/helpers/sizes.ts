import { isWholeFrame } from '@skydock/scripts'
import type { ManifestFile } from '../components/types'
import { formatSize } from '../components/utils'

/* What a file weighs now and what it will weigh once it is processed (RULES, Cropping and turning).
   Once it is processed that is known: the size of the copy. Before, it can be estimated, and is said
   to be an estimate: cutting the ends copies the stream, so what is kept is the share of the clip's
   time that is kept; cutting the frame encodes the picture again at a fixed quality, whose size
   depends on what is in it, so the share of the picture that is kept is only a rough guide. Turning
   changes no byte of a clip's size. */

type Plan = {
  size: number
  /* the share of the clip's time that is kept, 1 for a clip not trimmed or a photo */
  kept?: number
  frame?: ManifestFile['frame']
}

const estimatedSize = ({ size, kept = 1, frame }: Plan) => {
  const area = isWholeFrame(frame) || !frame ? 1 : Math.max(0.01, frame.width * frame.height)
  return Math.round(size * Math.min(1, Math.max(0, kept)) * area)
}

/* the weight after, as a short note to put beside the weight before: nothing when nothing changes.
   The copy's own size when there is one; else the estimate, marked with a tilde. */
const afterNote = (file: ManifestFile, plan?: Omit<Plan, 'size'> & { unsaved?: boolean }) => {
  /* a copy made with other settings than the file has now is no answer for them */
  const source = file.processed?.source
  const current =
    source !== undefined &&
    (source.cropStart ?? null) === (file.cropStart ?? null) &&
    (source.cropEnd ?? null) === (file.cropEnd ?? null) &&
    (source.rotation ?? 0) === (file.rotation ?? 0) &&
    JSON.stringify(source.frame ?? null) === JSON.stringify(file.frame ?? null)
  /* what is being changed and not saved yet is not in any copy: it is estimated */
  const made = current && !plan?.unsaved ? file.processed?.size : undefined
  const after = made ?? estimatedSize({ size: file.size, ...plan })
  if (Math.abs(after - file.size) < Math.max(1, file.size * 0.01)) return ''
  return ` → ${made === undefined ? '~' : ''}${formatSize(after)}`
}

export { afterNote, estimatedSize }
