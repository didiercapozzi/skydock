import type { FrameCrop, Rotation } from './types'

/* Cutting a mount or a finger out of the corner of a frame, and keeping the shape of what is left.
   The rectangle arrives as fractions of the whole picture because it is drawn on the proxy — a
   640-wide copy of a 4K clip — and has to mean the same thing on the clip itself.

   Everything here is arithmetic on numbers, deliberately free of node imports, so the board can use
   the same functions to draw the rectangle that processing uses to cut it. Two implementations of
   "which pixels" would disagree, and the one that disagreed would be the one nobody could see. */

/* Pixel numbers have to be even. Every H.264 encoder wants chroma it can halve, and an odd width
   is rejected outright or silently rounded — which moves the rectangle by a pixel and makes what
   was delivered not quite what was drawn.

   Sizes and offsets round the same way but have different floors: a rectangle two pixels wide is
   the smallest there is, while an offset of nothing is where most crops start: rounding an offset
   up to two would move every crop that touches the top or the left edge. */
const evenSize = (value: number) => Math.max(2, Math.round(value / 2) * 2)

const evenOffset = (value: number) => Math.max(0, Math.round(value / 2) * 2)

/* A bound rounds *down*. Rounding the frame's own size to the nearest even number can round it up —
   a 1079-high clip would be reported as 1080 and a crop allowed to reach past its last row, which
   ffmpeg refuses. */
const evenBound = (value: number) => Math.max(2, Math.floor(value / 2) * 2)

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/* A rectangle covering everything is the same as no rectangle: the picture is untouched, and
   saying so is what lets processing copy the file instead of encoding it again. */
const isWholeFrame = (crop: FrameCrop | null | undefined) =>
  !crop || (!crop.fill && crop.x <= 0 && crop.y <= 0 && crop.width >= 1 && crop.height >= 1)

/* Two rectangles are the same rectangle, with no rectangle at all counting as the whole frame —
   so drawing one that happens to cover everything does not make a processed copy look stale. */
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

/* Kept inside the picture whatever it was asked for, and never shrunk to nothing. A rectangle
   dragged off the edge is moved back in rather than clipped, so its shape survives — clipping
   would quietly change the aspect, which is the one thing this feature exists to preserve. */
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

/* The largest rectangle of the wanted shape that fits, centred. `ratio` is width over height, and
   the shape is measured against the *picture*, not the fractions: a 16:9 frame's fractions are
   1×1, so a 16:9 rectangle inside it is also 1×1 rather than 16:9. */
const fitRatio = (ratio: number, frameWidth: number, frameHeight: number) => {
  const frameRatio = frameWidth / frameHeight
  const width = ratio >= frameRatio ? 1 : ratio / frameRatio
  const height = ratio >= frameRatio ? frameRatio / ratio : 1
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height }
}

/* Resizing while the shape is locked: one edge is chosen and the other follows from it. */
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

/* What the rectangle comes to in pixels of a given frame, snapped to even numbers and kept inside
   it. The offsets are snapped too: an odd `x` on a 4:2:0 picture is not representable, and ffmpeg
   rounding it for us would move the rectangle away from where it was drawn. */
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

/* The filter chain that cuts the rectangle out and puts the result back to the size the clip came
   at — so a 4K clip stays 4K and a 1080p clip stays 1080p, whatever was cropped away, and a
   timeline is not a mix of sizes. `scale` is second: cutting first means fewer pixels to resize. */
const cropFilter = (crop: FrameCrop, frameWidth: number, frameHeight: number) => {
  const box = cropToPixels(crop, frameWidth, frameHeight)
  const out = { width: evenBound(frameWidth), height: evenBound(frameHeight) }
  const cut = `crop=${box.width}:${box.height}:${box.x}:${box.y}`
  return box.width === out.width && box.height === out.height
    ? cut
    : `${cut},scale=${out.width}:${out.height}`
}

/* Turning the picture, for a camera mounted sideways or upside down: a quarter turn at a time,
   clockwise, as it should be watched. */
const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270]

/* a turn added to a turn, back to 0 after a full circle */
const turnBy = (rotation: Rotation | null | undefined, by: number) => {
  const next = ((((rotation ?? 0) + by) % 360) + 360) % 360
  return ROTATIONS.find((r) => r === next) ?? 0
}

/* a quarter turn swaps which edge is across */
const isQuarterTurn = (rotation: Rotation | null | undefined) => (rotation ?? 0) % 180 !== 0

const turnedSize = (width: number, height: number, rotation: Rotation | null | undefined) =>
  isQuarterTurn(rotation) ? { width: height, height: width } : { width, height }

/* ffmpeg's way of turning a picture: transpose for a quarter turn either way, both flips for half */
const ROTATE_FILTER: Record<Rotation, string | null> = {
  0: null,
  90: 'transpose=1',
  180: 'hflip,vflip',
  270: 'transpose=2'
}

/* An upright picture set in a landscape frame the height of its own width — so as many pixels as it
   had, and not four times as many — with the picture blurred and stretched behind it to fill the
   sides. Nothing of the jumper is cut away, and nothing is black. A picture already wider than it
   is tall is left as it is. */
const landscapeFill = (width: number, height: number) => {
  if (width >= height) return null
  const h = evenBound(width)
  const w = evenBound((h * 16) / 9)
  return `split[wide][tall];[wide]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=40[sides];[tall]scale=-2:${h}[middle];[sides][middle]overlay=(W-w)/2:(H-h)/2`
}

/* Everything done to the picture, in the order it is seen: turned first, then the rectangle cut out
   of the turned picture — it was drawn on the turned picture — and put back to that picture's size,
   and last, when asked, set in a landscape frame with blurred sides. A quarter-turned 4K clip comes
   out as a 2160-wide portrait clip. Null when nothing is done to it. */
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

/* A photo is turned by the orientation it carries, not by re-encoding it: nothing is lost, and every
   viewer and browser draws it the way the tag says. The four plain orientations, keyed by how far
   each is turned clockwise; a mirrored one keeps its mirror and is treated as upright. */
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
  ROTATIONS,
  turnBy,
  turnedSize,
  withRatio
}
