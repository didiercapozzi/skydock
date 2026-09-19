import { isWholeFrame } from './frameCrop'
import type { ManifestFile, ManifestGroup } from './types'

/* Free of node imports: the board says what freeing a dropzone would do before it is asked.

   What of a dropzone can be freed: a jump with every file on the storage, whole, and each loose file
   that is — and what stays because it is not all up yet. A file delivered trimmed, cropped or turned
   is counted apart, since once its original goes only the delivered part is left anywhere. */
const freeablePlace = (
  jumps: ManifestGroup[],
  loose: ManifestFile[],
  onStorage: (file: ManifestFile) => boolean
) => {
  const open = jumps.filter((g) => !g.freed && g.files.length > 0)
  const waiting = loose.filter((f) => !f.freed)
  const up = (f: ManifestFile) => !f.freed && onStorage(f)
  const ready = open.filter((g) => g.files.every(up))
  const looseReady = waiting.filter(up)
  const files = [...ready.flatMap((g) => g.files), ...looseReady]
  return {
    jumps: ready,
    files,
    kept: open.length - ready.length + waiting.length - looseReady.length,
    reshaped: files.filter(
      (f) =>
        f.cropStart != null || f.cropEnd != null || Boolean(f.rotation) || !isWholeFrame(f.frame)
    ).length,
    bytes: files.reduce((n, f) => n + f.size + (f.processed?.size ?? 0), 0)
  }
}

export { freeablePlace }
