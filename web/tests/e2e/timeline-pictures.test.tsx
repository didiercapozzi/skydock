import { createElement } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'

import { VideoCropper } from '../../app/components/video-cropper'

/* The timeline's pictures (RULES, Cropping and turning): a zoomed clip played on brings in the one picture that
   comes into view, not every picture again, and none is asked for beyond the end of the clip. */
describe('the pictures along a zoomed timeline', () => {
  test('a zoomed clip played on brings in the one picture that comes into view, not every picture again', async () => {
    const asked = new Set<string>()
    const props = (currentTime: number) => ({
      duration: 60,
      currentTime,
      bufferedRanges: [{ start: 0, end: 60 }],
      cropStart: null,
      cropEnd: null,
      zoom: 2,
      thumbSrc: (seek: number) => {
        asked.add(seek.toFixed(1))
        return `/api/thumb/clip.mp4?seek=${seek.toFixed(1)}&width=160`
      },
      onSeek: () => {},
      onCropChange: () => {},
      onApply: () => {},
      onZoomChange: () => {}
    })
    const view = await render(createElement(VideoCropper, props(25)))

    /* the clip plays on past the edge of the stretch shown, which then follows it, a tenth of a second at a time */
    for (let at = 25.1; at <= 45; at += 0.1)
      await view.rerender(createElement(VideoCropper, props(at)))

    /* a slot is about four seconds wide: twenty seconds of following bring in a handful of new pictures */
    expect(asked.size).toBeLessThanOrEqual(14)
  })

  test('none is asked for at or beyond the end of the clip', async () => {
    const asked: number[] = []
    await render(
      createElement(VideoCropper, {
        duration: 15,
        currentTime: 0,
        bufferedRanges: [{ start: 0, end: 15 }],
        cropStart: null,
        cropEnd: null,
        zoom: 1,
        thumbSrc: (seek: number) => {
          asked.push(seek)
          return `/api/thumb/clip.mp4?seek=${seek.toFixed(1)}&width=160`
        },
        onSeek: () => {},
        onCropChange: () => {},
        onApply: () => {},
        onZoomChange: () => {}
      })
    )

    expect(Math.max(...asked)).toBeLessThan(15)
  })
})
