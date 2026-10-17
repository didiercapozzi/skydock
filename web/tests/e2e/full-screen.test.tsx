import { createElement, useState } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { PreviewDrawer } from '../../app/components/preview-drawer'


const CLIP = { path: '/o/original_files/GX01.MP4', size: 1, mtime: 1, filename: 'GX01.MP4', id: 'v1' }
const PHOTO = { path: '/o/original_files/GOPR1.JPG', size: 1, mtime: 1, filename: 'GOPR1.JPG', id: 'p1' }
const PROXY = { state: 'ready' as const, play: '/o/proxies/v1.mp4' }

const Drawer = ({ file = CLIP, proxy }: { file?: typeof CLIP; proxy?: typeof PROXY }) =>
  createElement(PreviewDrawer, {
    files: [file],
    index: 0,
    proxy,
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
    currentTime: 0,
    duration: 10,
    onSeek: () => {},
    onCropChange: () => {},
    onApply: () => {},
    onZoomChange: () => {},
    onDurationChange: () => {},
    onVideoRef: () => {}
  })

const Watching = () => {
  const [time, setTime] = useState(0)
  return createElement(PreviewDrawer, {
    files: [CLIP],
    index: 0,
    proxy: PROXY,
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
    currentTime: time,
    duration: 10,
    onSeek: setTime,
    onTime: setTime,
    onCropChange: () => {},
    onApply: () => {},
    onZoomChange: () => {},
    onDurationChange: () => {},
    onVideoRef: () => {}
  })
}

const player = () => document.querySelector('video')!
const picture = () => document.querySelector('img')!

describe('seeing it full screen', () => {
  test('opens on the small copy when there is one, and goes back to it on Escape', async () => {
    const { unmount } = await render(createElement(Drawer, { proxy: PROXY }))
    expect(player().getAttribute('src')).toBe('/api/file/o/proxies/v1.mp4')

    await userEvent.click(page.getByRole('button', { name: '⛶ Full screen' }))

    await expect.poll(() => player().hasAttribute('controls')).toBe(true)
    expect(player().getAttribute('src')).toBe('/api/file/o/proxies/v1.mp4')
    await expect.element(page.getByRole('button', { name: 'Proxy' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.keyboard('{Escape}')

    await expect.poll(() => player().hasAttribute('controls')).toBe(false)
    expect(player().getAttribute('src')).toBe('/api/file/o/proxies/v1.mp4')
    unmount()
  })

  test('is switched to the original quality and back from the screen', async () => {
    const { unmount } = await render(createElement(Drawer, { proxy: PROXY }))
    await userEvent.click(page.getByRole('button', { name: '⛶ Full screen' }))
    await expect.element(page.getByRole('button', { name: 'Original' })).toBeVisible()

    await userEvent.click(page.getByRole('button', { name: 'Original' }))

    await expect
      .poll(() => player().getAttribute('src'))
      .toBe('/api/file/o/original_files/GX01.MP4')
    await expect.element(page.getByRole('button', { name: 'Original' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(page.getByRole('button', { name: 'Proxy' }))

    await expect.poll(() => player().getAttribute('src')).toBe('/api/file/o/proxies/v1.mp4')

    await userEvent.click(page.getByRole('button', { name: 'Original' }))
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => player().hasAttribute('controls')).toBe(false)
    await userEvent.click(page.getByRole('button', { name: '⛶ Full screen' }))
    await expect.poll(() => player().getAttribute('src')).toBe('/api/file/o/proxies/v1.mp4')
    unmount()
  })

  test('keeps the time it was at when it is switched between the small copy and the original', async () => {
    const { unmount } = await render(createElement(Watching))
    await userEvent.click(page.getByRole('button', { name: '⛶ Full screen' }))
    await expect.element(page.getByRole('button', { name: 'Original' })).toBeVisible()
    const video = player()
    video.addEventListener('error', (e) => e.stopImmediatePropagation(), true)
    let at = 0
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => at,
      set: (to: number) => {
        at = to
      }
    })
    Object.defineProperty(video, 'duration', { configurable: true, get: () => 10 })
    Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => 1920 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => 1080 })
    at = 4.2
    video.dispatchEvent(new Event('timeupdate'))

    await userEvent.click(page.getByRole('button', { name: 'Original' }))
    at = 0
    video.dispatchEvent(new Event('timeupdate'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    video.dispatchEvent(new Event('loadedmetadata'))

    await expect.poll(() => at).toBeCloseTo(4.2)

    video.dispatchEvent(new Event('timeupdate'))
    await userEvent.click(page.getByRole('button', { name: 'Proxy' }))
    at = 0
    video.dispatchEvent(new Event('timeupdate'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    video.dispatchEvent(new Event('loadedmetadata'))

    await expect.poll(() => at).toBeCloseTo(4.2)

    await userEvent.click(page.getByRole('button', { name: 'Original' }))
    at = 0
    video.dispatchEvent(new Event('timeupdate'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    video.dispatchEvent(new Event('loadedmetadata'))
    await expect.poll(() => at).toBeCloseTo(4.2)
    at = 6
    video.dispatchEvent(new Event('timeupdate'))

    await userEvent.keyboard('{Escape}')
    await expect.poll(() => player().hasAttribute('controls')).toBe(false)
    at = 0
    video.dispatchEvent(new Event('timeupdate'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    video.dispatchEvent(new Event('loadedmetadata'))

    await expect.poll(() => at).toBeCloseTo(6)
    unmount()
  })

  test('F fills the screen with the picture, and F leaves it', async () => {
    const { unmount } = await render(createElement(Drawer, { proxy: PROXY }))

    await userEvent.keyboard('f')

    await expect.element(page.getByRole('button', { name: '✕ Leave full screen' })).toBeVisible()
    expect(player().getAttribute('src')).toBe('/api/file/o/proxies/v1.mp4')

    await userEvent.keyboard('f')

    await expect.poll(() => player().hasAttribute('controls')).toBe(false)
    unmount()
  })

  test('offers no choice of quality for a clip with no small copy', async () => {
    const { unmount } = await render(createElement(Drawer, {}))

    await userEvent.click(page.getByRole('button', { name: '⛶ Full screen' }))

    await expect.element(page.getByRole('button', { name: '✕ Leave full screen' })).toBeVisible()
    await expect.element(page.getByRole('group', { name: 'Quality' })).not.toBeInTheDocument()
    unmount()
  })

  test('shows a photo with the screen to itself', async () => {
    const { unmount } = await render(createElement(Drawer, { file: PHOTO }))

    await userEvent.click(page.getByRole('button', { name: '⛶ Full screen' }))

    await expect.element(page.getByRole('button', { name: '✕ Leave full screen' })).toBeVisible()
    expect(picture().getAttribute('src')).toBe('/api/file/o/original_files/GOPR1.JPG')
    unmount()
  })
})
