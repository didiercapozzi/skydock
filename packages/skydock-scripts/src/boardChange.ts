import { isWholeFrame } from './frameCrop'
import type { FrameCrop, ManifestFile } from './types'

type Changeable = {
  cropStart?: number | null | undefined
  cropEnd?: number | null | undefined
  frame?: FrameCrop | null | undefined
  rotation?: 0 | 90 | 180 | 270 | null | undefined
}

/* A clip or a photo that the board trimmed, framed or turned is not the file the camera made any more: that
   is its origin now, and what is handed over is its copy. One the board left alone is its own origin. */
const changedOnBoard = (file: Changeable) =>
  file.cropStart != null ||
  file.cropEnd != null ||
  !isWholeFrame(file.frame) ||
  Boolean(file.rotation)

const lastName = (target: string) =>
  target.slice(Math.max(target.lastIndexOf('/'), target.lastIndexOf('\\')) + 1)

/* What a montage hands over of a file is its origin: the file as it came off the camera, or, when the board
   trimmed, framed or turned it, the copy made of it. */
const handedOver = (file: ManifestFile) =>
  changedOnBoard(file) && file.processed
    ? {
        path: file.processed.path,
        filename: lastName(file.processed.path),
        size: file.processed.size
      }
    : { path: file.path, filename: file.filename, size: file.size }

export { changedOnBoard, handedOver }
