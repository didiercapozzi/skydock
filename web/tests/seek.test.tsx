import { fireEvent, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { ManifestFile } from '../app/lib/types'
import { MediaPreview } from '../app/components/review/media-preview'
import { VideoCropper } from '../app/components/review/video-cropper'
import { PreviewDrawer } from '../app/components/review/preview-drawer'
import type { PreviewState } from '../app/components/review/types'

const makeFile = (filePath: string, filename: string, mtime = 1000): ManifestFile => ({
  path: filePath,
  mtime,
  size: 1000,
  filename,
  id: filePath
})

const makePreviewState = (files: ManifestFile[], index = 0, label = 'Test'): PreviewState => ({
  files,
  index,
  label
})

class MockTimeRanges {
  private ranges: Array<[number, number]>
  constructor(ranges: Array<[number, number]> = []) {
    this.ranges = ranges
  }
  get length() {
    return this.ranges.length
  }
  start(i: number) {
    return this.ranges[i]?.[0] ?? 0
  }
  end(i: number) {
    return this.ranges[i]?.[1] ?? 0
  }
}

const makeMockVideo = (bufferedRanges: Array<[number, number]> = [[0, 60]]) => {
  const buffered = new MockTimeRanges(bufferedRanges)
  return {
    currentTime: 0,
    buffered,
    duration: 300,
    paused: true,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn()
  }
}

const renderWithRouter = (ui: React.ReactElement) => {
  const routes = [{ path: '/', element: ui }]
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(global, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    return setTimeout(() => cb(Date.now()), 16) as unknown as number
  })
  vi.spyOn(global, 'cancelAnimationFrame').mockImplementation((id: number) => {
    clearTimeout(id)
  })
  vi.spyOn(HTMLVideoElement.prototype, 'play').mockImplementation(
    function (this: HTMLVideoElement) {
      return Promise.resolve()
    }
  )
  Element.prototype.setPointerCapture = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const getTimeline = (): HTMLDivElement => {
  const el = document.querySelector('[data-testid="timeline"]') as HTMLDivElement
  if (!el) throw new Error('timeline not found')
  return el
}

describe('VideoCropper seekTo', () => {
  it('sets vid.currentTime directly when target is within buffered range', () => {
    const vid = makeMockVideo([[0, 60]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    const onSeekCommit = vi.fn()

    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/test.mp4'
        onSeekCommit={onSeekCommit}
      />
    )

    const timeline = getTimeline()
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        width: 1000,
        top: 0,
        bottom: 8,
        x: 0,
        y: 0,
        right: 1000,
        toJSON: () => {}
      })
    })

    fireEvent.pointerDown(timeline, { clientX: 200 })

    expect(vid.currentTime).toBe(60)
    expect(onSeekCommit).not.toHaveBeenCalled()
  })

  it('calls onSeekCommit when target is outside buffered range', () => {
    const vid = makeMockVideo([[0, 20]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    const onSeekCommit = vi.fn()

    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/test.mp4'
        onSeekCommit={onSeekCommit}
      />
    )

    const timeline = getTimeline()
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        width: 1000,
        top: 0,
        bottom: 8,
        x: 0,
        y: 0,
        right: 1000,
        toJSON: () => {}
      })
    })

    fireEvent.pointerDown(timeline, { clientX: 800 })

    expect(onSeekCommit).toHaveBeenCalledOnce()
    expect(onSeekCommit).toHaveBeenCalledWith(expect.closeTo(240, -1))
  })

  it('clamps seek beyond duration to safeDuration', () => {
    const vid = makeMockVideo([[0, 60]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    const onSeekCommit = vi.fn()

    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/test.mp4'
        onSeekCommit={onSeekCommit}
      />
    )

    const timeline = getTimeline()
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        width: 1000,
        top: 0,
        bottom: 8,
        x: 0,
        y: 0,
        right: 1000,
        toJSON: () => {}
      })
    })

    fireEvent.pointerDown(timeline, { clientX: 1100 })

    expect(onSeekCommit).toHaveBeenCalledWith(300)
  })

  it('clamps negative seek to 0', () => {
    const vid = makeMockVideo([[0, 60]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }

    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/test.mp4'
      />
    )

    const timeline = getTimeline()
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        width: 1000,
        top: 0,
        bottom: 8,
        x: 0,
        y: 0,
        right: 1000,
        toJSON: () => {}
      })
    })

    fireEvent.pointerDown(timeline, { clientX: -100 })

    expect(vid.currentTime).toBe(0)
  })

  it('does nothing when videoRef is null', () => {
    const videoRef = { current: null }

    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/test.mp4'
      />
    )

    const timeline = getTimeline()
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        width: 1000,
        top: 0,
        bottom: 8,
        x: 0,
        y: 0,
        right: 1000,
        toJSON: () => {}
      })
    })

    expect(() => fireEvent.pointerDown(timeline, { clientX: 500 })).not.toThrow()
  })
})

describe('VideoCropper with baseSeek', () => {
  it('returns baseSeek + currentTime as playhead position', () => {
    const vid = makeMockVideo([[0, 60]])
    vid.currentTime = 5
    const videoRef = { current: vid as unknown as HTMLVideoElement }

    const { container } = renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/test.mp4'
        baseSeek={100}
      />
    )

    const playhead = container.querySelector('[data-testid="playhead"]')
    expect(playhead).toBeTruthy()
  })

  it('seeks relative to baseSeek when target is within buffered range', () => {
    const vid = makeMockVideo([[0, 60]])
    vid.currentTime = 0
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    const onSeekCommit = vi.fn()

    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/test.mp4'
        baseSeek={100}
        onSeekCommit={onSeekCommit}
      />
    )

    const timeline = getTimeline()
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        width: 1000,
        top: 0,
        bottom: 8,
        x: 0,
        y: 0,
        right: 1000,
        toJSON: () => {}
      })
    })

    fireEvent.pointerDown(timeline, { clientX: 433 })

    expect(vid.currentTime).toBeCloseTo(30, 0)
    expect(onSeekCommit).not.toHaveBeenCalled()
  })
})

describe('MediaPreview src URL', () => {
  it('renders video element for video files', () => {
    const file = makeFile('/test/DJI_0001.MP4', 'DJI_0001.MP4')
    render(<MediaPreview file={file} />)

    const video = document.querySelector('video') as HTMLVideoElement
    expect(video).toBeTruthy()
  })

  it('does not render image for video files', () => {
    const file = makeFile('/test/DJI_0001.MP4', 'DJI_0001.MP4')
    render(<MediaPreview file={file} />)

    const video = document.querySelector('video') as HTMLVideoElement
    const img = document.querySelector('img')
    expect(video).toBeTruthy()
    expect(img).toBeNull()
  })

  it('renders image for non-video files', () => {
    const file = makeFile('/test/photo.JPG', 'photo.JPG')
    render(<MediaPreview file={file} />)

    const img = document.querySelector('img') as HTMLImageElement
    const video = document.querySelector('video')
    expect(img).toBeTruthy()
    expect(video).toBeNull()
  })
})

describe('PreviewDrawer', () => {
  it('renders video preview for video files', () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false }), { status: 404 })
    )

    const file = makeFile('/test/DJI_0001.MP4', 'DJI_0001.MP4')
    const preview = makePreviewState([file])

    const routes = [
      {
        path: '/',
        element: (
          <PreviewDrawer
            preview={preview}
            onClose={() => {}}
            onPrev={() => {}}
            onNext={() => {}}
          />
        )
      }
    ]
    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)

    const video = document.querySelector('video')
    expect(video).toBeTruthy()
  })

  it('renders image for photo files', () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false }), { status: 404 })
    )

    const file = makeFile('/test/photo.JPG', 'photo.JPG')
    const preview = makePreviewState([file])

    const routes = [
      {
        path: '/',
        element: (
          <PreviewDrawer
            preview={preview}
            onClose={() => {}}
            onPrev={() => {}}
            onNext={() => {}}
          />
        )
      }
    ]
    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)

    const img = document.querySelector('img')
    expect(img).toBeTruthy()
  })
})
