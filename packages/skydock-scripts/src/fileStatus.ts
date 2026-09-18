import type { ManifestFile } from './types'

/* Deliberately free of node imports: the board imports this through the package barrel, and
   `web/tests/e2e/scripts-barrel.test.tsx` asserts the barrel evaluates in a browser. */

type FileStatus = 'local' | 'processed' | 'uploaded'

/* What the disk says about a processed copy. */
type OutputFact = { exists: boolean; size: number }

/* What the NAS said, for the folders that answered. `dirs` is the set that was actually listed —
   a folder missing from it was never checked (or the call failed), which is not evidence of
   anything. `sizes` maps a full remote path to its size, or null when DSM did not report one. */
type RemoteListing = { dirs: string[]; sizes: Record<string, number | null> }

type StatusContext = {
  /* the crop in force where the file is drawn: a group ref's crop for a grouped file, the
     registry entry's own for a lone file */
  crop?: {
    cropStart?: number | null
    cropEnd?: number | null
    frame?: { x: number; y: number; width: number; height: number } | null
  }
  output?: OutputFact
  remote?: RemoteListing | null
  /* the file belongs to a tandem that has an edit, which freezes it (RULES, Montage) */
  inEdit?: boolean
}

const dirOf = (remotePath: string) => {
  const cut = remotePath.lastIndexOf('/')
  return cut <= 0 ? '/' : remotePath.slice(0, cut)
}

/* Two rectangles are the same rectangle, with no rectangle at all counting as the whole frame —
   so drawing one that happens to cover everything does not make a processed copy look stale. */
const sameFrame = (
  left: { x: number; y: number; width: number; height: number } | null | undefined,
  right: { x: number; y: number; width: number; height: number } | null | undefined
) => {
  const whole = (c: typeof left) => !c || (c.x <= 0 && c.y <= 0 && c.width >= 1 && c.height >= 1)
  if (whole(left) && whole(right)) return true
  if (!left || !right) return false
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

/* every input that decided what `execute` wrote — bytes, capture time, crop range, frame */
const sourceMatches = (file: ManifestFile, context?: StatusContext) => {
  const record = file.processed
  if (!record) return false
  const crop = context?.crop ?? file
  return (
    record.source.id === file.id &&
    record.source.size === file.size &&
    record.source.mtime === file.mtime &&
    (record.source.cropStart ?? null) === (crop.cropStart ?? null) &&
    (record.source.cropEnd ?? null) === (crop.cropEnd ?? null) &&
    sameFrame(record.source.frame, crop.frame)
  )
}

/* a legacy record migrated from `processedPath` carries size 0 — it can be checked for existence
   but not for size, until the next process writes a real one */
const outputMatches = (file: ManifestFile, output?: OutputFact) => {
  const record = file.processed
  if (!record || !output) return true
  if (!output.exists) return false
  return record.size === 0 || output.size === record.size
}

/* Only a listing that actually happened can demote. An unlisted folder, a failed call or a size
   DSM would not report all mean "no evidence" — never "the file is gone". */
const remoteMatches = (file: ManifestFile, remote?: RemoteListing | null) => {
  const record = file.uploaded
  if (!record || !remote) return true
  if (!remote.dirs.includes(dirOf(record.remotePath))) return true
  if (!(record.remotePath in remote.sizes)) return false
  const size = remote.sizes[record.remotePath]
  return size === null || size === record.size
}

const fileStatus = (file: ManifestFile, context?: StatusContext): FileStatus => {
  if (!file.processed) return 'local'
  if (!sourceMatches(file, context)) return 'local'
  if (!outputMatches(file, context?.output)) return 'local'
  const uploaded = file.uploaded
  if (!uploaded) return 'processed'
  /* the copy that went up is not the copy that is there now */
  if (uploaded.localPath !== file.processed.path) return 'processed'
  if (uploaded.size !== file.processed.size && file.processed.size !== 0) return 'processed'
  return remoteMatches(file, context?.remote) ? 'uploaded' : 'processed'
}

/* "Never prepared" and "prepared, then altered" both read `local`, because in both cases there is
   no current copy — but they are not the same situation to be in, and the board says which. The
   distinction is derived from what is already recorded, never stored: preparing the file again
   makes the copy current and it disappears on its own. */
const fileChanged = (file: ManifestFile, context?: StatusContext) =>
  Boolean(file.processed) && fileStatus(file, context) === 'local'

const scopeStatus = (files: ManifestFile[], context?: (file: ManifestFile) => StatusContext) => {
  const counts = { local: 0, processed: 0, uploaded: 0, total: files.length }
  for (const file of files) counts[fileStatus(file, context?.(file))] += 1
  return counts
}

/* One rule, used by the board to disable the button and by the server to refuse the request. */
const uploadGate = (files: ManifestFile[], context?: (file: ManifestFile) => StatusContext) => {
  const needProcessing = files.filter((f) => fileStatus(f, context?.(f)) === 'local').length
  return {
    blocked: needProcessing > 0,
    needProcessing,
    message:
      needProcessing === 0
        ? null
        : `${needProcessing} file${needProcessing === 1 ? '' : 's'} need${
            needProcessing === 1 ? 's' : ''
          } processing`
  }
}

export { fileChanged, fileStatus, scopeStatus, uploadGate }
export type { FileStatus, OutputFact, RemoteListing, StatusContext }
