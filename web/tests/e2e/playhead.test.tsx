import { createElement, useState } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { PreviewDrawer } from '../../app/components/preview-drawer'


const clip = {
  path: '/o/original_files/2026-09-13/GX018663.MP4',
  size: 1,
  mtime: 1,
  filename: 'GX018663.MP4',
  id: 'g1'
}

const Watching = () => {
  const [currentTime, setCurrentTime] = useState(0)
  return createElement(PreviewDrawer, {
    files: [clip],
    index: 0,
    frame: null,
    onFrameChange: () => {},
    rotation: 0,
    onRotate: () => {},
    onClose: () => {},
    onPrevious: () => {},
    onNext: () => {},
    cropStart: null,
    cropEnd: null,
    zoom: 1,
    currentTime,
    duration: 191,
    onSeek: setCurrentTime,
    onTime: setCurrentTime,
    onCropChange: () => {},
    onApply: () => {},
    onZoomChange: () => {},
    onDurationChange: () => {},
    onVideoRef: () => {}
  })
}

const playedTo = async (seconds: number) => {
  const video = document.querySelector('video')
  if (!video) throw new Error('there is no video')
  Object.defineProperty(video, 'currentTime', { value: seconds, configurable: true })
  video.dispatchEvent(new Event('timeupdate'))
}

describe('the footage playing', () => {
  test('carries the clock along with it', async () => {
    await render(createElement(Watching))
    await expect.element(page.getByText('0:00 / 3:11')).toBeVisible()

    await playedTo(45.5)

    await expect.element(page.getByText('0:45 / 3:11')).toBeVisible()
  })

  test('carries the playhead on the timeline along with it', async () => {
    const drawer = await render(createElement(Watching))

    await playedTo(95.5)

    const along = () => {
      const playhead = drawer.container.querySelector('[data-playhead]')
      return Number(/left: ([\d.]+)%/.exec(playhead?.getAttribute('style') ?? '')?.[1])
    }
    await expect.poll(along).toBeCloseTo(50, 0)
  })
})
