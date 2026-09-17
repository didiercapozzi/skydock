// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  containCrop,
  cropFilter,
  cropToPixels,
  fitRatio,
  isWholeFrame,
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
