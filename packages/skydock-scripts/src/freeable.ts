import { isWholeFrame } from './frameCrop'
import type { ManifestFile, ManifestGroup } from './types'

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
