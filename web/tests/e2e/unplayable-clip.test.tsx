import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { PreviewDrawer } from '../../app/components/preview-drawer'

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

const notice = () => expect.poll(() => document.querySelector('[role=status]')?.textContent ?? '')

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

describe('a browser that cannot play the proxies', () => {
  test('says so, and names the browsers that play them', async () => {
    const canPlay = vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('')
    await render(createElement(Drawer, { proxy: { state: 'ready', play: CLIP.path } }))
    await givesUp()
    await notice().toContain('This browser cannot play H.264 video')
    canPlay.mockRestore()
  })
})
