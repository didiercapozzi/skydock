import type { FrameCrop } from './types'

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
   the smallest there is, while an offset of nothing is where most crops start. Rounding an offset
   up to two was moving every crop that touched the top or the left edge. */
const evenSize = (value: number) => Math.max(2, Math.round(value / 2) * 2)

const evenOffset = (value: number) => Math.max(0, Math.round(value / 2) * 2)

/* A bound rounds *down*. Rounding the frame's own size to the nearest even number can round it up —
   a 1079-high clip would be reported as 1080 and a crop allowed to reach past its last row, which
   ffmpeg refuses. */
const evenBound = (value: number) => Math.max(2, Math.floor(value / 2) * 2)

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/* The whole frame, which is what no rectangle at all means. */
const FULL_FRAME: FrameCrop = { x: 0, y: 0, width: 1, height: 1 }

/* A rectangle covering everything is the same as no rectangle: the picture is untouched, and
   saying so is what lets processing copy the file instead of encoding it again. */
const isWholeFrame = (crop: FrameCrop | null | undefined) =>
  !crop || (crop.x <= 0 && crop.y <= 0 && crop.width >= 1 && crop.height >= 1)

/* Kept inside the picture whatever it was asked for, and never shrunk to nothing. A rectangle
   dragged off the edge is moved back in rather than clipped, so its shape survives — clipping
   would quietly change the aspect, which is the one thing this feature exists to preserve. */
const containCrop = (crop: FrameCrop): FrameCrop => {
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
const fitRatio = (ratio: number, frameWidth: number, frameHeight: number): FrameCrop => {
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
): FrameCrop => {
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

export { containCrop, cropFilter, cropToPixels, fitRatio, FULL_FRAME, isWholeFrame, withRatio }
