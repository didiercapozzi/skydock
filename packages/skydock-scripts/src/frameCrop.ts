import type { FrameCrop, Rotation } from './types'

const evenSize = (value: number) => Math.max(2, Math.round(value / 2) * 2)

const evenOffset = (value: number) => Math.max(0, Math.round(value / 2) * 2)

const evenBound = (value: number) => Math.max(2, Math.floor(value / 2) * 2)

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const isWholeFrame = (crop: FrameCrop | null | undefined) =>
  !crop || (!crop.fill && crop.x <= 0 && crop.y <= 0 && crop.width >= 1 && crop.height >= 1)

const sameFrame = (left: FrameCrop | null | undefined, right: FrameCrop | null | undefined) => {
  if (isWholeFrame(left) && isWholeFrame(right)) return true
  if (!left || !right) return false
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.fill === right.fill
  )
}

const containCrop = (crop: FrameCrop) => {
  const width = Math.min(1, Math.max(0.01, crop.width))
  const height = Math.min(1, Math.max(0.01, crop.height))
  return {
    width,
    height,
    x: clamp01(Math.min(crop.x, 1 - width)),
    y: clamp01(Math.min(crop.y, 1 - height))
  }
}

const fitRatio = (ratio: number, frameWidth: number, frameHeight: number) => {
  const frameRatio = frameWidth / frameHeight
  const width = ratio >= frameRatio ? 1 : ratio / frameRatio
  const height = ratio >= frameRatio ? frameRatio / ratio : 1
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height }
}

const withRatio = (
  crop: FrameCrop,
  ratio: number,
  frameWidth: number,
  frameHeight: number,
  drive: 'width' | 'height' = 'width'
) => {
  const frameRatio = frameWidth / frameHeight
  const width = drive === 'width' ? crop.width : (crop.height * ratio) / frameRatio
  const height = drive === 'width' ? (crop.width * frameRatio) / ratio : crop.height
  return containCrop({ ...crop, width: Math.min(1, width), height: Math.min(1, height) })
}

const cropToPixels = (crop: FrameCrop, frameWidth: number, frameHeight: number) => {
  const width = Math.min(evenSize(crop.width * frameWidth), evenBound(frameWidth))
  const height = Math.min(evenSize(crop.height * frameHeight), evenBound(frameHeight))
  return {
    width,
    height,
    x: Math.min(evenOffset(crop.x * frameWidth), evenBound(frameWidth) - width),
    y: Math.min(evenOffset(crop.y * frameHeight), evenBound(frameHeight) - height)
  }
}

const cropFilter = (crop: FrameCrop, frameWidth: number, frameHeight: number) => {
  const box = cropToPixels(crop, frameWidth, frameHeight)
  const out = { width: evenBound(frameWidth), height: evenBound(frameHeight) }
  const cut = `crop=${box.width}:${box.height}:${box.x}:${box.y}`
  return box.width === out.width && box.height === out.height
    ? cut
    : `${cut},scale=${out.width}:${out.height}`
}

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270]

const turnBy = (rotation: Rotation | null | undefined, by: number) => {
  const next = ((((rotation ?? 0) + by) % 360) + 360) % 360
  return ROTATIONS.find((r) => r === next) ?? 0
}

const isQuarterTurn = (rotation: Rotation | null | undefined) => (rotation ?? 0) % 180 !== 0

const turnedSize = (width: number, height: number, rotation: Rotation | null | undefined) =>
  isQuarterTurn(rotation) ? { width: height, height: width } : { width, height }

const ROTATE_FILTER: Record<Rotation, string | null> = {
  0: null,
  90: 'transpose=1',
  180: 'hflip,vflip',
  270: 'transpose=2'
}

const landscapeFill = (width: number, height: number) => {
  if (width >= height) return null
  const h = evenBound(width)
  const w = evenBound((h * 16) / 9)
  return `split[wide][tall];[wide]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=40[sides];[tall]scale=-2:${h}[middle];[sides][middle]overlay=(W-w)/2:(H-h)/2`
}

const pictureFilter = ({
  frame,
  rotation,
  width,
  height
}: {
  frame: FrameCrop | null | undefined
  rotation: Rotation | null | undefined
  width: number
  height: number
}) => {
  const turn = ROTATE_FILTER[rotation ?? 0]
  const shown = turnedSize(width, height, rotation)
  const cut = frame && !isWholeFrame({ ...frame, fill: undefined })
  const parts = [
    turn,
    cut ? cropFilter(frame, shown.width, shown.height) : null,
    frame?.fill === 'blur' ? landscapeFill(shown.width, shown.height) : null
  ].filter((p): p is string => p !== null)
  return parts.length > 0 ? parts.join(',') : null
}

const ORIENTATION_OF: Record<Rotation, number> = { 0: 1, 90: 6, 180: 3, 270: 8 }
const TURN_OF: Record<number, Rotation> = { 1: 0, 6: 90, 3: 180, 8: 270 }

const orientationAfter = (current: number | null | undefined, rotation: Rotation) =>
  ORIENTATION_OF[turnBy(TURN_OF[current ?? 1] ?? 0, rotation)]

export {
  containCrop,
  cropFilter,
  cropToPixels,
  fitRatio,
  isQuarterTurn,
  isWholeFrame,
  orientationAfter,
  pictureFilter,
  sameFrame,
  turnBy,
  turnedSize,
  withRatio
}
