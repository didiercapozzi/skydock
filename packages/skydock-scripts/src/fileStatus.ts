import { parentOf } from './paths'
import type { OutputFact } from './boardAnswer'
import type { ManifestFile } from './types'

/* Free of node imports: the board runs this in the browser. */

type FileStatus = 'local' | 'processed' | 'uploaded'

/* Why an uploaded file can no longer be changed here. SkyDock never deletes from the storage, so
   it could not take the old copy back, and changing this one would leave the two disagreeing for
   good — the page hides the controls, and the server refuses the change (RULES, File status). */
const UPLOADED_LOCKED =
  'On the NAS — cropping, re-timing and moving are closed. Take it off the NAS to change it.'

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
    rotation?: 0 | 90 | 180 | 270 | null
  }
  output?: OutputFact
  remote?: RemoteListing | null
  /* the file belongs to a tandem that has an edit, which freezes it (RULES, Montage) */
  inEdit?: boolean
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
    sameFrame(record.source.frame, crop.frame) &&
    /* turned since it was prepared is changed since it was prepared */
    (record.source.rotation ?? 0) === (crop.rotation ?? 0)
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
  if (!remote.dirs.includes(parentOf(record.remotePath))) return true
  if (!(record.remotePath in remote.sizes)) return false
  const size = remote.sizes[record.remotePath]
  return size === null || size === record.size
}

const fileStatus = (file: ManifestFile, context?: StatusContext): FileStatus => {
  /* freed only once the storage was proved to hold it, so that is where it is — and a freed file the
     storage has since lost is not shown at all rather than described (RULES, File status) */
  if (file.freed) return 'uploaded'
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

/* What a file's processed copy is looked up by: the file's identity, not where its original sits,
   because a copy shares its original's path and each of the two has a processed copy of its own. */
const outputKeyOf = (file: { id?: string; path: string }) => file.id ?? file.path

export { fileChanged, fileStatus, outputKeyOf, scopeStatus, uploadGate, UPLOADED_LOCKED }
export type { FileStatus, RemoteListing, StatusContext }
