// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  containCrop,
  cropFilter,
  cropToPixels,
  fitRatio,
  isWholeFrame,
  orientationAfter,
  pictureFilter,
  turnBy,
  turnedSize,
  withRatio
} from '../src/frameCrop'

/* The rectangle is drawn on a 640-wide proxy and cut out of a 4K clip, so the only way the two can
   agree is if it is held as fractions and turned into pixels once. These pin that arithmetic. */

describe('a rectangle covering everything', () => {
  it('is the same as no rectangle, so the file can be copied rather than encoded again', () => {
    expect(isWholeFrame(undefined)).toBe(true)
    expect(isWholeFrame(null)).toBe(true)
    expect(isWholeFrame({ x: 0, y: 0, width: 1, height: 1 })).toBe(true)
  })

  it('but a rectangle that cuts anything at all is not', () => {
    expect(isWholeFrame({ x: 0.05, y: 0, width: 0.95, height: 1 })).toBe(false)
    expect(isWholeFrame({ x: 0, y: 0, width: 1, height: 0.9 })).toBe(false)
  })
})

describe('keeping the rectangle inside the picture', () => {
  /* dragged off the right edge: moved back in, not clipped — clipping would change its shape,
     which is the one thing this is for */
  it('moves a rectangle dragged past the edge back in, keeping its size', () => {
    const contained = containCrop({ x: 0.8, y: 0.1, width: 0.5, height: 0.5 })
    expect(contained.width).toBe(0.5)
    expect(contained.x).toBe(0.5)
  })

  it('never lets it shrink to nothing', () => {
    expect(containCrop({ x: 0, y: 0, width: 0, height: 0 }).width).toBeGreaterThan(0)
  })
})

describe('the shape the crop keeps', () => {
  /* a 16:9 rectangle inside a 16:9 frame is the whole frame — the fractions are 1×1, not 16:9 */
  it('fills a frame of its own shape', () => {
    const fit = fitRatio(16 / 9, 3840, 2160)
    expect(fit).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('fits a square inside a wide frame, centred', () => {
    const fit = fitRatio(1, 3840, 2160)
    expect(fit.height).toBe(1)
    expect(fit.width).toBeCloseTo(9 / 16, 5)
    expect(fit.x).toBeCloseTo((1 - 9 / 16) / 2, 5)
  })

  it('fits a wide rectangle inside a tall frame, centred', () => {
    const fit = fitRatio(16 / 9, 1440, 2560)
    expect(fit.width).toBe(1)
    expect(fit.height).toBeCloseTo(1440 / 2560 / (16 / 9), 5)
  })

  /* dragging one edge with the shape locked: the other follows */
  it('follows the driven edge and keeps the shape', () => {
    const locked = withRatio({ x: 0, y: 0, width: 0.5, height: 1 }, 16 / 9, 3840, 2160, 'width')
    expect(locked.width).toBe(0.5)
    expect(locked.height).toBeCloseTo(0.5, 5)
  })
})

describe('turning fractions into pixels', () => {
  it('gives even numbers, because an encoder will not take odd ones', () => {
    const box = cropToPixels({ x: 0.1, y: 0.1, width: 0.777, height: 0.777 }, 1920, 1080)
    for (const n of [box.x, box.y, box.width, box.height]) expect(n % 2).toBe(0)
  })

  /* the frame's own size rounds down, never up: a 1079-high clip reported as 1080 would let a
     crop reach past its last row, which ffmpeg refuses */
  it('never claims more rows than an odd-sized frame has', () => {
    const box = cropToPixels({ x: 0, y: 0, width: 1, height: 1 }, 1921, 1079)
    expect(box.width).toBeLessThanOrEqual(1920)
    expect(box.height).toBeLessThanOrEqual(1078)
  })

  it('never runs off the edge of the frame', () => {
    const box = cropToPixels({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 }, 1920, 1080)
    expect(box.x + box.width).toBeLessThanOrEqual(1920)
    expect(box.y + box.height).toBeLessThanOrEqual(1080)
  })

  /* the same fractions off a proxy and off the clip pick the same part of the picture */
  it('means the same part of the picture at any size', () => {
    const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
    const small = cropToPixels(crop, 640, 360)
    const large = cropToPixels(crop, 3840, 2160)
    expect(small.x / 640).toBeCloseTo(large.x / 3840, 2)
    expect(small.width / 640).toBeCloseTo(large.width / 3840, 2)
  })
})

describe('the filter the clip is cut with', () => {
  /* the obstacle in the left corner of a 16:9 clip: cut it away, come back out at 4K */
  it('cuts the rectangle and puts the result back to the size it came at', () => {
    const filter = cropFilter({ x: 0.1, y: 0, width: 0.9, height: 0.9 }, 3840, 2160)
    expect(filter).toBe('crop=3456:1944:384:0,scale=3840:2160')
  })

  it('leaves out the rescale when nothing was taken off', () => {
    expect(cropFilter({ x: 0, y: 0, width: 1, height: 1 }, 1920, 1080)).toBe('crop=1920:1080:0:0')
  })

  /* a 16:9 crop of a 16:9 clip is still 16:9 afterwards, which is the whole point */
  it('keeps the shape of the picture it started with', () => {
    const filter = cropFilter({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, 1920, 1080)
    const [, w, h] = /crop=(\d+):(\d+)/.exec(filter)!.map(Number)
    expect(w / h).toBeCloseTo(1920 / 1080, 1)
    expect(filter).toContain('scale=1920:1080')
  })
})

/* Turning the picture: a quarter turn at a time, clockwise, applied before the rectangle — which is
   drawn on the turned picture — so a quarter-turned clip comes out portrait. */
describe('turning the picture', () => {
  it('goes round a quarter at a time and comes back to as shot', () => {
    expect(turnBy(0, 90)).toBe(90)
    expect(turnBy(270, 90)).toBe(0)
    expect(turnBy(90, 180)).toBe(270)
    expect(turnBy(undefined, 180)).toBe(180)
  })

  it('swaps which edge is across on a quarter turn, and only then', () => {
    expect(turnedSize(3840, 2160, 90)).toEqual({ width: 2160, height: 3840 })
    expect(turnedSize(3840, 2160, 180)).toEqual({ width: 3840, height: 2160 })
  })

  it('asks ffmpeg for the turn alone when there is no rectangle', () => {
    expect(pictureFilter({ frame: null, rotation: 90, width: 3840, height: 2160 })).toBe(
      'transpose=1'
    )
    expect(pictureFilter({ frame: null, rotation: 180, width: 3840, height: 2160 })).toBe(
      'hflip,vflip'
    )
    expect(pictureFilter({ frame: null, rotation: 270, width: 3840, height: 2160 })).toBe(
      'transpose=2'
    )
    expect(pictureFilter({ frame: null, rotation: 0, width: 3840, height: 2160 })).toBeNull()
  })

  it('turns first, then cuts the rectangle out of the turned picture and keeps it portrait', () => {
    const filter = pictureFilter({
      frame: { x: 0, y: 0.1, width: 1, height: 0.9 },
      rotation: 90,
      width: 3840,
      height: 2160
    })
    /* measured against 2160 × 3840, and put back to that size */
    expect(filter).toBe('transpose=1,crop=2160:3456:0:384,scale=2160:3840')
  })

  it('turns a photo by its orientation tag, on top of whatever turn it already carries', () => {
    expect(orientationAfter(1, 90)).toBe(6)
    expect(orientationAfter(6, 90)).toBe(3)
    expect(orientationAfter(8, 90)).toBe(1)
    expect(orientationAfter(null, 180)).toBe(3)
    expect(orientationAfter(3, 180)).toBe(1)
  })
})

/* An upright clip delivered as a landscape one, its sides filled with itself blurred, so nothing of
   the jumper is cut away (RULES, Cropping and turning). */
describe('a portrait clip set in a landscape frame', () => {
  const WHOLE = { x: 0, y: 0, width: 1, height: 1, fill: 'blur' as const }

  it('is a picture to change, even with nothing cut out of it', () => {
    expect(isWholeFrame(WHOLE)).toBe(false)
  })

  it('comes out 16:9, as high as the clip was wide, with blurred sides behind it', () => {
    const filter = pictureFilter({ frame: WHOLE, rotation: null, width: 1512, height: 2688 })

    expect(filter).toContain('overlay=(W-w)/2:(H-h)/2')
    expect(filter).toContain('scale=2688:1512')
    expect(filter).toContain('gblur')
  })

  it('leaves a clip that is already landscape as it is', () => {
    expect(pictureFilter({ frame: WHOLE, rotation: null, width: 3840, height: 2160 })).toBeNull()
  })

  it('fills a sideways clip once it is turned upright', () => {
    expect(pictureFilter({ frame: WHOLE, rotation: 90, width: 3840, height: 2160 })).toMatch(
      /^transpose=1,split/
    )
  })
})
