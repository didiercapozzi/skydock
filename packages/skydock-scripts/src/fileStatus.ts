import { changedOnBoard } from './boardChange'
import { parentOf } from './paths'
import type { OutputFact } from './boardAnswer'
import { sameFrame } from './frameCrop'
import type { FrameCrop, ManifestFile } from './types'

type FileStatus = 'local' | 'processed' | 'uploaded'

const UPLOADED_LOCKED =
  'On the NAS — cropping, re-timing and moving are closed. Take it off the NAS to change it.'

type RemoteListing = { dirs: string[]; sizes: Record<string, number | null> }

type StatusContext = {
  crop?: {
    cropStart?: number | null
    cropEnd?: number | null
    frame?: FrameCrop | null
    rotation?: 0 | 90 | 180 | 270 | null
  }
  output?: OutputFact
  remote?: RemoteListing | null
}

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
    (record.source.rotation ?? 0) === (crop.rotation ?? 0)
  )
}

const outputMatches = (file: ManifestFile, output?: OutputFact) => {
  const record = file.processed
  if (!record || !output) return true
  if (!output.exists) return false
  return record.size === 0 || output.size === record.size
}

const remoteMatches = (file: ManifestFile, remote?: RemoteListing | null) => {
  const record = file.uploaded
  if (!record || !remote) return true
  if (!remote.dirs.includes(parentOf(record.remotePath))) return true
  if (!(record.remotePath in remote.sizes)) return false
  const size = remote.sizes[record.remotePath]
  return size === null || size === record.size
}

const fileStatus = (file: ManifestFile, context?: StatusContext): FileStatus => {
  if (file.freed) return 'uploaded'
  if (!file.processed) return 'local'
  if (!sourceMatches(file, context)) return 'local'
  if (!outputMatches(file, context?.output)) return 'local'
  const uploaded = file.uploaded
  if (!uploaded) return 'processed'
  if (uploaded.localPath !== file.processed.path) return 'processed'
  if (uploaded.size !== file.processed.size && file.processed.size !== 0) return 'processed'
  return remoteMatches(file, context?.remote) ? 'uploaded' : 'processed'
}

const fileChanged = (file: ManifestFile, context?: StatusContext) =>
  Boolean(file.processed) && fileStatus(file, context) === 'local'

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

/* A montage hands over the files the board changed as copies, and the others as they are: only the changed
   ones can be owed a copy. */
const copiesOwed = (files: ManifestFile[], context?: (file: ManifestFile) => StatusContext) =>
  files.filter((f) => changedOnBoard(f) && fileStatus(f, context?.(f)) === 'local')

const outputKeyOf = (file: { id?: string; path: string }) => file.id ?? file.path

export {
  copiesOwed,
  fileChanged,
  fileStatus,
  outputKeyOf,
  remoteMatches,
  uploadGate,
  UPLOADED_LOCKED
}
export type { FileStatus, RemoteListing, StatusContext }
