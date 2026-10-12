import { createElement } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'

import { VideoCropper } from '../../app/components/video-cropper'

describe('the pictures along a zoomed timeline', () => {
  test('a zoomed clip played on brings in the one picture that comes into view, not every picture again', async () => {
    const asked = new Set<string>()
    const props = (currentTime: number) => ({
      duration: 60,
      currentTime,
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

    for (let at = 25.1; at <= 45; at += 0.1)
      await view.rerender(createElement(VideoCropper, props(at)))

    expect(asked.size).toBeLessThanOrEqual(14)
  })

  test('none is asked for at or beyond the end of the clip', async () => {
    const asked: number[] = []
    await render(
      createElement(VideoCropper, {
        duration: 15,
        currentTime: 0,
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
