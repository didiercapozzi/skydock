import { createElement } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { PreviewDrawer } from '../../app/components/preview-drawer'

/* A clip the browser cannot draw — 4K HEVC off a DJI, before its proxy exists — is said to be one,
   rather than shown as a black box. The file here does not exist, which the player takes the same
   way: nothing it can show. */
const CLIP = { path: '/o/DJI_0071_D.MP4', size: 1, mtime: 1, filename: 'DJI_0071_D.MP4', id: 'd1' }

const Drawer = ({ proxy }: { proxy?: { state: 'ready' | 'own' | 'none'; play: string } }) =>
  createElement(PreviewDrawer, {
    files: [CLIP],
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

/* what the preview says about the picture; the player takes a moment to give up on a clip */
const notice = () =>
  expect.poll(() => document.querySelector('[role=status]')?.textContent ?? '', { timeout: 10_000 })

describe('a clip the browser cannot show', () => {
  test('says its proxy is being made and will play instead', async () => {
    await render(createElement(Drawer, { proxy: { state: 'none', play: CLIP.path } }))
    await notice().toContain('Its proxy is being made')
  })

  test('says so even with no proxy to wait for', async () => {
    await render(createElement(Drawer, {}))
    await notice().toContain('It is copied, processed and uploaded all the same')
  })
})
