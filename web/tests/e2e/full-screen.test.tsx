import { createElement } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { PreviewDrawer } from '../../app/components/preview-drawer'

/* The preview is where a clip is trimmed, so it plays the small copy: 640 across, which is what
   makes dragging a timeline answer at once. Full screen is the other thing anybody wants of a
   preview — to see the picture itself — so it fills the screen with the file rather than the copy
   (RULES, Cropping and turning). */

const CLIP = { path: '/o/original_files/GX01.MP4', size: 1, mtime: 1, filename: 'GX01.MP4', id: 'v1' }
const PHOTO = { path: '/o/original_files/GOPR1.JPG', size: 1, mtime: 1, filename: 'GOPR1.JPG', id: 'p1' }
const PROXY = { state: 'ready' as const, play: '/o/proxies/v1.mp4' }

/* a photo has no small copy, so it is shown as itself in the preview already */
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
    onReset: () => {},
    onZoomChange: () => {},
    onDurationChange: () => {},
    onVideoRef: () => {}
  })

const player = () => document.querySelector('video')!
const picture = () => document.querySelector('img')!

describe('seeing it full screen', () => {
  /* the small copy plays at once and a 4K original may not play here at all, so full screen opens on
     the small copy, and the file itself is one press away */
  test('opens on the small copy when there is one, and goes back to it on Escape', async () => {
    const { unmount } = await render(createElement(Drawer, { proxy: PROXY }))
    expect(player().getAttribute('src')).toBe('/api/file/o/proxies/v1.mp4')

    await userEvent.click(page.getByRole('button', { name: '⛶ Full screen' }))

    /* a player to watch with, not a timeline to drag, still on the small copy */
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

    /* leaving and coming back opens on the small copy again, whichever was last looked at */
    await userEvent.click(page.getByRole('button', { name: 'Original' }))
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => player().hasAttribute('controls')).toBe(false)
    await userEvent.click(page.getByRole('button', { name: '⛶ Full screen' }))
    await expect.poll(() => player().getAttribute('src')).toBe('/api/file/o/proxies/v1.mp4')
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

  /* a clip with no small copy is itself already: there is only the one quality to choose */
  test('offers no choice of quality for a clip with no small copy', async () => {
    const { unmount } = await render(createElement(Drawer, {}))

    await userEvent.click(page.getByRole('button', { name: '⛶ Full screen' }))

    await expect.element(page.getByRole('button', { name: '✕ Leave full screen' })).toBeVisible()
    await expect.element(page.getByRole('group', { name: 'Quality' })).not.toBeInTheDocument()
    unmount()
  })

  /* A photo is already itself in the preview — there is no small copy of one — so full screen is
     the same picture with the screen to itself. */
  test('shows a photo with the screen to itself', async () => {
    const { unmount } = await render(createElement(Drawer, { file: PHOTO }))

    await userEvent.click(page.getByRole('button', { name: '⛶ Full screen' }))

    await expect.element(page.getByRole('button', { name: '✕ Leave full screen' })).toBeVisible()
    expect(picture().getAttribute('src')).toBe('/api/file/o/original_files/GOPR1.JPG')
    unmount()
  })
})
