import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { PreviewDrawer } from '../../app/components/preview-drawer'

/* Space plays a clip in the preview and pauses it again, as the Play button does — whichever button
   was pressed last. */
const CLIP = { path: '/o/GX01.MP4', size: 1, mtime: 1, filename: 'GX01.MP4', id: 'v1' }

const Drawer = ({ onRotate = () => {} }: { onRotate?: () => void }) =>
  createElement(PreviewDrawer, {
    files: [CLIP],
    index: 0,
    frame: null,
    onFrameChange: () => {},
    rotation: 0,
    onRotate,
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

describe('playing a clip in the preview', () => {
  test('space plays it, and space again pauses it', async () => {
    await render(createElement(Drawer, {}))
    await userEvent.keyboard(' ')
    await expect.poll(() => player().paused).toBe(false)
    await expect.element(page.getByRole('button', { name: '❚❚ Pause' })).toBeVisible()

    await userEvent.keyboard(' ')
    await expect.poll(() => player().paused).toBe(true)
    await expect.element(page.getByRole('button', { name: '▶ Play' })).toBeVisible()
  })

  test('space plays it even after another button was pressed', async () => {
    const onRotate = vi.fn()
    await render(createElement(Drawer, { onRotate }))
    await userEvent.click(page.getByRole('button', { name: '↻ +90°' }))
    await userEvent.keyboard(' ')
    await expect.poll(() => player().paused).toBe(false)
    expect(onRotate).toHaveBeenCalledTimes(1)
  })
})
