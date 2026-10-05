import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
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
    onReset: () => {},
    onZoomChange: () => {},
    onDurationChange: () => {},
    onVideoRef: () => {}
  })

/* what the preview says about the picture */
const notice = () => expect.poll(() => document.querySelector('[role=status]')?.textContent ?? '')

/* The player giving up, which is what the message hangs on. Said here rather than waited for: how
   long a browser takes to decide it cannot draw a file is its own business, and the message is
   what these tests are about. */
const givesUp = async () => {
  await expect.poll(() => document.querySelector('video')).toBeTruthy()
  document.querySelector('video')?.dispatchEvent(new Event('error'))
}

describe('a clip the browser cannot show', () => {
  test('says its proxy is being made and will play instead', async () => {
    await render(createElement(Drawer, { proxy: { state: 'none', play: CLIP.path } }))
    await givesUp()
    await notice().toContain('Its proxy is being made')
  })

  test('says so even with no proxy to wait for', async () => {
    await render(createElement(Drawer, {}))
    await givesUp()
    await notice().toContain('It is copied, processed and uploaded all the same')
  })
})

/* a browser that plays no H.264 can show no proxy at all, and is told so, with where the clips play */
describe('a browser that cannot play the proxies', () => {
  test('says so, and names the browsers that play them', async () => {
    const canPlay = vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('')
    await render(createElement(Drawer, { proxy: { state: 'ready', play: CLIP.path } }))
    await givesUp()
    await notice().toContain('This browser cannot play H.264 video')
    canPlay.mockRestore()
  })
})
