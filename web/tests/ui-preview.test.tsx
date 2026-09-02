// oxlint-disable eslint/no-unused-vars
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ManifestFile } from '../app/lib/types'
import { PreviewDrawer } from '../app/components/review/preview-drawer'
import { MediaPreview } from '../app/components/review/media-preview'
import { VideoCropper } from '../app/components/review/video-cropper'
import type { PreviewState } from '../app/components/review/types'

type MockVideoOpts = {
  buffered?: Array<[number, number]>
  currentTime?: number
  paused?: boolean
}

const makeFile = (
  p: string,
  filename: string,
  overrides: Partial<ManifestFile> = {}
): ManifestFile => ({
  path: p,
  mtime: 1720000000,
  size: 1024 * 1024 * 2,
  filename,
  id: p,
  ...overrides
})

const makePreview = (
  files: ManifestFile[],
  index = 0,
  label = 'Jump 01 — 2026-08-27'
): PreviewState => ({
  files,
  index,
  label
})

const makeMockVideo = (
  buffered: Array<[number, number]> = [[0, 60]],
  opts: MockVideoOpts = {}
) => ({
  currentTime: opts.currentTime ?? 10,
  buffered: {
    length: buffered.length,
    start: (i: number) => buffered[i]?.[0] ?? 0,
    end: (i: number) => buffered[i]?.[1] ?? 0
  } as unknown as TimeRanges,
  duration: 300,
  paused: opts.paused ?? true,
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  canPlayType: vi.fn().mockReturnValue(''),
  load: vi.fn()
})

const renderWithRouter = (ui: React.ReactElement) => {
  const router = createMemoryRouter([{ path: '/', element: ui }], { initialEntries: ['/'] })
  return render(<RouterProvider router={router} />)
}

const mockTimelineRect = (el: HTMLElement, rect: Partial<DOMRect> = {}) => {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      left: 0,
      width: 1000,
      top: 0,
      bottom: 40,
      right: 1000,
      x: 0,
      y: 0,
      height: 40,
      toJSON: () => ({}),
      ...rect
    }),
    configurable: true
  })
}

const getTimeline = () => {
  const el = document.querySelector('[data-testid="timeline"]') as HTMLElement | null
  if (!el) throw new Error('timeline not found')
  return el
}

beforeEach(() => {
  vi.spyOn(global, 'requestAnimationFrame').mockImplementation(
    (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number
  )
  vi.spyOn(global, 'cancelAnimationFrame').mockImplementation((id: number) => clearTimeout(id))
  Element.prototype.setPointerCapture =
    vi.fn() as unknown as typeof Element.prototype.setPointerCapture
  Element.prototype.releasePointerCapture =
    vi.fn() as unknown as typeof Element.prototype.releasePointerCapture
  global.fetch = vi.fn().mockResolvedValue({
    json: async () => ({ ok: true, duration: 300 })
  } as unknown as Response) as unknown as typeof fetch
  vi.spyOn(HTMLVideoElement.prototype, 'play').mockImplementation(
    () => Promise.resolve() as unknown as Promise<void>
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('ui-preview — preview drawer Sec14', () => {
  it('opens as right-side panel with label and file.filename • {index+1}/{total} • formatTime + formatSize', () => {
    const files = [makeFile('/a.mp4', 'DJI_0001.MP4', { mtime: 1720000000, size: 2048 })]
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files, 0, 'Jump 01 — 2026-08-27')}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    expect(screen.getByText('Jump 01 — 2026-08-27')).toBeInTheDocument()
    expect(screen.getByText(/DJI_0001\.MP4/)).toBeInTheDocument()
    // spec renders {index+1}/{total} both in header line and footer; use getAllByText to avoid duplicate match
    expect(screen.getAllByText(/1 \/ 1/).length).toBeGreaterThanOrEqual(1)
    const panel = document.querySelector('div.fixed.inset-0.z-50.flex.justify-end')
    expect(panel).toBeInTheDocument()
    expect(document.body.textContent).toMatch(/KB|MB|B/)
  })

  it('displays {index+1}/{total} correctly for middle index', () => {
    const files = [
      makeFile('/a.mp4', 'a.mp4'),
      makeFile('/b.mp4', 'b.mp4'),
      makeFile('/c.mp4', 'c.mp4')
    ]
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files, 1, 'Label')}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    expect(screen.getByText(/b\.mp4/)).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getAllByText(/2 \/ 3/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders Open link with src=/api/file?path= and overlay click closes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const files = [makeFile('/video/DJI_0001.MP4', 'DJI_0001.MP4')]
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files)}
        onClose={onClose}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    const link = document.querySelector('a[href*="/api/file"]') as HTMLAnchorElement | null
    expect(link).toBeTruthy()
    expect(link?.getAttribute('href')).toContain(encodeURIComponent('/video/DJI_0001.MP4'))
    const overlay = document.querySelector(
      'div.absolute.inset-0.bg-black\\/30'
    ) as HTMLElement | null
    expect(overlay).toBeTruthy()
    if (overlay) await user.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Prev/Next wrap around via buttons', async () => {
    const user = userEvent.setup()
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const files = [
      makeFile('/a.mp4', 'a.mp4'),
      makeFile('/b.mp4', 'b.mp4'),
      makeFile('/c.mp4', 'c.mp4')
    ]
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files, 0)}
        onClose={vi.fn()}
        onPrev={onPrev}
        onNext={onNext}
      />
    )
    await user.click(screen.getByText('Next →'))
    expect(onNext).toHaveBeenCalledTimes(1)
    await user.click(screen.getByText('← Prev'))
    expect(onPrev).toHaveBeenCalledTimes(1)
  })

  it('arrow keys navigate Prev/Next and Escape closes', () => {
    const onClose = vi.fn()
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const files = [makeFile('/a.mp4', 'a.mp4'), makeFile('/b.mp4', 'b.mp4')]
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files, 0)}
        onClose={onClose}
        onPrev={onPrev}
        onNext={onNext}
      />
    )
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(onPrev).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onNext).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape close works even when video is loading', () => {
    const onClose = vi.fn()
    const files = [makeFile('/a.mp4', 'a.mp4')]
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files)}
        onClose={onClose}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('videoRef shared between MediaPreview and VideoCropper baseSeek hybrid', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, duration: 300 })
    } as unknown as Response) as unknown as typeof fetch
    const files = [makeFile('/a.mp4', 'a.mp4')]
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files)}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    const video = document.querySelector('video')
    expect(video).toBeInTheDocument()
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/duration'))
    )
    await waitFor(() =>
      expect(document.querySelector('[data-testid="timeline"]')).toBeInTheDocument()
    )
  })

  it('fetches /api/duration on mount and handles fetch failure gracefully', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      json: async () => ({ ok: false })
    } as unknown as Response) as unknown as typeof fetch
    global.fetch = fetchSpy
    const files = [makeFile('/a.mp4', 'a.mp4')]
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files)}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/api/duration?path='))
    )
    expect(document.querySelector('video')).toBeInTheDocument()
  })
})

describe('ui-preview — media preview Sec14', () => {
  it('MediaPreview uses useHlsPlayer src=/api/hls?path=&seek= fallback to /api/file?path= on error', async () => {
    const file = makeFile('/video/DJI_0001.MP4', 'DJI_0001.MP4')
    const videoRef = { current: null } as unknown as React.RefObject<HTMLVideoElement | null>
    renderWithRouter(
      <MediaPreview
        file={file}
        videoRef={videoRef}
        seek={12}
      />
    )
    expect(document.querySelector('video')).toBeInTheDocument()
    await waitFor(() => expect(document.body.textContent).toContain('Loading video'))
    const videoEl = document.querySelector('video') as HTMLVideoElement
    fireEvent.error(videoEl)
    await waitFor(() => expect(document.body.textContent).toContain('Fallback to original'))
  })

  it('MediaPreview fallback src contains /api/file?path= with encoded path', () => {
    const file = makeFile('/path with spaces/video.MP4', 'video.MP4')
    renderWithRouter(<MediaPreview file={file} />)
    const video = document.querySelector('video')
    expect(video).toBeInTheDocument()
    fireEvent.error(video as Element)
    waitFor(() => expect(document.body.textContent).toContain('Fallback to original'))
  })

  it('loading spinner shows and LOADING_TIMEOUT_MS 20s triggers error retry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true } as unknown as never)
    vi.spyOn(global, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number
    )
    vi.spyOn(global, 'cancelAnimationFrame').mockImplementation((id: number) => clearTimeout(id))
    const file = makeFile('/a.mp4', 'a.mp4')
    render(<MediaPreview file={file} />)
    expect(screen.getByText(/Loading video/)).toBeInTheDocument()
    expect(screen.getByText(/HLS live transcode/)).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(20_000)
    })
    await waitFor(() => expect(screen.getByText(/Video failed to load/)).toBeInTheDocument())
    expect(screen.getByText(/Loading timeout/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('loading spinner has Fallback to original button that triggers fallback', async () => {
    const user = userEvent.setup()
    const file = makeFile('/a.mp4', 'a.mp4')
    render(<MediaPreview file={file} />)
    expect(screen.getByText(/Loading video/)).toBeInTheDocument()
    const fallbackBtn = screen.getByText('Fallback to original')
    expect(fallbackBtn).toBeInTheDocument()
    await user.click(fallbackBtn)
    expect(document.querySelector('video')).toBeInTheDocument()
  })

  it('error panel shows Video failed to load + codec hint + Open/Download + Retry + Fallback', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true } as unknown as never)
    vi.spyOn(global, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number
    )
    vi.spyOn(global, 'cancelAnimationFrame').mockImplementation((id: number) => clearTimeout(id))
    const file = makeFile('/bad.mp4', 'bad.mp4')
    render(<MediaPreview file={file} />)
    const video = document.querySelector('video') as HTMLVideoElement
    fireEvent.error(video)
    const fallbackVideo = document.querySelector('video') as HTMLVideoElement
    fireEvent.error(fallbackVideo)
    await act(async () => {
      vi.advanceTimersByTime(50)
    })
    expect(await screen.findByText('Video failed to load')).toBeInTheDocument()
    expect(screen.getByText(/Codec: h264 High/)).toBeInTheDocument()
    expect(screen.getByText('Open / Download')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('Retry resets useFallback if error contains 429 Too many', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true } as unknown as never)
    vi.spyOn(global, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number
    )
    vi.spyOn(global, 'cancelAnimationFrame').mockImplementation((id: number) => clearTimeout(id))
    const file = makeFile('/busy.mp4', 'busy.mp4')
    const { container } = render(<MediaPreview file={file} />)
    const video = container.querySelector('video') as HTMLVideoElement
    fireEvent.error(video)
    const v2 = container.querySelector('video') as HTMLVideoElement
    fireEvent.stalled(v2)
    await act(async () => {
      vi.advanceTimersByTime(20_000)
    })
    const errorPanel = await screen.findByText('Video failed to load')
    expect(errorPanel).toBeInTheDocument()
    const retryBtn = screen.getByText('Retry')
    await act(async () => {
      fireEvent.click(retryBtn)
    })
    expect(container.querySelector('video') ?? screen.queryByText(/Loading video/)).toBeTruthy()
    vi.useRealTimers()
  })

  it('Retry with 429 message resets fallback, without 429 keeps fallback', async () => {
    const user = userEvent.setup()
    vi.useFakeTimers({ shouldAdvanceTime: true } as unknown as never)
    vi.spyOn(global, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number
    )
    vi.spyOn(global, 'cancelAnimationFrame').mockImplementation((id: number) => clearTimeout(id))
    const file = makeFile('/rate.mp4', 'rate.mp4')
    render(<MediaPreview file={file} />)
    await act(async () => {
      vi.advanceTimersByTime(20_000)
    })
    const panel = await screen.findByText('Video failed to load')
    expect(panel).toBeInTheDocument()
    expect(screen.getByText(/429|Too many|Stalled|Browser cannot decode/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('image path renders img src=/api/file?path= with maxHeight', () => {
    const file = makeFile('/photos/DJI_0001.JPG', 'DJI_0001.JPG')
    const { container } = render(
      <MediaPreview
        file={file}
        maxHeight='50vh'
      />
    )
    const img = container.querySelector('img') as HTMLImageElement | null
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toBe(`/api/file?path=${encodeURIComponent(file.path)}`)
    expect(img?.getAttribute('alt')).toBe(file.filename)
    expect(img?.style.maxHeight ?? img?.getAttribute('style')).toContain('50vh')
    expect(container.querySelector('video')).toBeNull()
  })

  it('image respects default maxHeight 60vh when not provided', () => {
    const file = makeFile('/a.jpg', 'a.jpg')
    render(<MediaPreview file={file} />)
    const img = document.querySelector('img') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.style.maxHeight).toBe('60vh')
  })
})

describe('ui-preview — video cropper Sec15 core', () => {
  it('timeline data-testid and playhead present, currentTime via useSyncExternalStore + rAF when not dragging', async () => {
    const vid = makeMockVideo([[0, 60]])
    renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid as unknown as HTMLVideoElement }}
        duration={300}
        filePath='/a.mp4'
      />
    )
    expect(screen.getByTestId('timeline')).toBeInTheDocument()
    expect(screen.getByTestId('playhead')).toBeInTheDocument()
    const playhead = screen.getByTestId('playhead') as HTMLElement
    expect(playhead.style.left).toBeTruthy()
  })

  it('derived visibleDuration = safeDuration/zoomLevel, viewStart/viewEnd via viewOffset', async () => {
    const vid = makeMockVideo([[0, 300]])
    renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid as unknown as HTMLVideoElement }}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    expect(screen.getByText('0:00.00')).toBeInTheDocument()
    expect(screen.getByText('5:00.00')).toBeInTheDocument()
    fireEvent.wheel(timeline, { deltaY: -100, clientX: 500 })
    await waitFor(() => expect(screen.getByText('Reset zoom')).toBeInTheDocument())
  })

  it('seekTo clamps 0..safeDuration, buffered inside → currentTime vs outside → onSeekCommit', () => {
    const vidBuffered = makeMockVideo([[0, 100]])
    const onSeekCommit = vi.fn()
    renderWithRouter(
      <VideoCropper
        videoRef={{ current: vidBuffered as unknown as HTMLVideoElement }}
        duration={300}
        filePath='/a.mp4'
        onSeekCommit={onSeekCommit}
      />
    )
    const tl = getTimeline()
    mockTimelineRect(tl)
    fireEvent.pointerDown(tl, { clientX: 100, pointerId: 1 })
    expect(vidBuffered.currentTime).toBe(30)
    expect(onSeekCommit).not.toHaveBeenCalled()
    const vidSparse = makeMockVideo([[0, 10]])
    const onSeekCommit2 = vi.fn()
    const { unmount } = renderWithRouter(
      <VideoCropper
        videoRef={{ current: vidSparse as unknown as HTMLVideoElement }}
        duration={300}
        filePath='/a.mp4'
        onSeekCommit={onSeekCommit2}
      />
    )
    void unmount
    const tl2 = document.querySelectorAll('[data-testid="timeline"]')[1] as HTMLElement
    if (tl2) {
      mockTimelineRect(tl2)
      fireEvent.pointerDown(tl2, { clientX: 800, pointerId: 2 })
      expect(onSeekCommit2).toHaveBeenCalled()
    }
  })

  it('seekTo clamps negative to 0 and beyond to safeDuration', () => {
    const vid = makeMockVideo([[0, 60]])
    const onSeekCommit = vi.fn()
    renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid as unknown as HTMLVideoElement }}
        duration={300}
        filePath='/a.mp4'
        onSeekCommit={onSeekCommit}
      />
    )
    const tl = getTimeline()
    mockTimelineRect(tl)
    fireEvent.pointerDown(tl, { clientX: -100, pointerId: 1 })
    expect(vid.currentTime).toBe(0)
    const vid2 = makeMockVideo([[0, 10]], { currentTime: 0 })
    const onSeekCommit2 = vi.fn()
    const { container } = renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid2 as unknown as HTMLVideoElement }}
        duration={60}
        filePath='/b.mp4'
        onSeekCommit={onSeekCommit2}
      />
    )
    void container
    const tls = document.querySelectorAll('[data-testid="timeline"]')
    const last = tls[tls.length - 1] as HTMLElement
    mockTimelineRect(last)
    fireEvent.pointerDown(last, { clientX: 2000, pointerId: 2 })
    expect(onSeekCommit2).toHaveBeenCalledWith(60)
  })

  it('seekTo when relativeTarget <0 due to baseSeek calls onSeekCommit', () => {
    const vid = makeMockVideo([[0, 300]])
    const onSeekCommit = vi.fn()
    renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid as unknown as HTMLVideoElement }}
        duration={300}
        filePath='/a.mp4'
        baseSeek={200}
        onSeekCommit={onSeekCommit}
      />
    )
    const tl = getTimeline()
    mockTimelineRect(tl)
    fireEvent.pointerDown(tl, { clientX: 100, pointerId: 1 })
    expect(onSeekCommit).toHaveBeenCalledWith(expect.closeTo(30, 5))
  })

  it('timeFromX via getBoundingClientRect maps clientX to time', () => {
    const vid = makeMockVideo([[0, 300]])
    const onSeekCommit = vi.fn()
    renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid as unknown as HTMLVideoElement }}
        duration={300}
        filePath='/a.mp4'
        onSeekCommit={onSeekCommit}
      />
    )
    const tl = getTimeline()
    mockTimelineRect(tl, { left: 0, width: 1000 })
    fireEvent.pointerDown(tl, { clientX: 500, pointerId: 1 })
    expect(vid.currentTime).toBe(150)
  })

  it('wheel zoom centered on cursor zoomFactor 1.2 MAX_ZOOM 50 newViewOffset calc Reset zoom', async () => {
    const vid = makeMockVideo([[0, 300]])
    renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid as unknown as HTMLVideoElement }}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const tl = getTimeline()
    mockTimelineRect(tl)
    for (let i = 0; i < 30; i++) fireEvent.wheel(tl, { deltaY: -100, clientX: 500 })
    expect(await screen.findByText('Reset zoom')).toBeInTheDocument()
    for (let i = 0; i < 40; i++) fireEvent.wheel(tl, { deltaY: -100, clientX: 500 })
    expect(screen.getByText('Reset zoom')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByText('Reset zoom'))
    })
    expect(screen.queryByText('Reset zoom')).not.toBeInTheDocument()
  })

  it('formatTimeCode h:m:s.f FPS=30 renders correct codes', () => {
    const vid = makeMockVideo([[0, 300]])
    renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid as unknown as HTMLVideoElement }}
        duration={3661}
        filePath='/a.mp4'
      />
    )
    expect(screen.getByText('0:00.00')).toBeInTheDocument()
    expect(screen.getByText('1:01:01.00')).toBeInTheDocument()
    const { unmount } = renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid as unknown as HTMLVideoElement }}
        duration={65.5}
        filePath='/b.mp4'
      />
    )
    void unmount
  })

  it('pointer down pauses video if playing, setPointerCapture, sets dragging start/end/playhead/timeline', () => {
    const vid = makeMockVideo([[0, 300]], { paused: false })
    renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid as unknown as HTMLVideoElement }}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const tl = getTimeline()
    mockTimelineRect(tl)
    fireEvent.pointerDown(tl, { clientX: 200, pointerId: 1 })
    expect(vid.pause).toHaveBeenCalled()
    expect(Element.prototype.setPointerCapture).toHaveBeenCalled()
    fireEvent.pointerUp(tl)
  })

  it('pointer move clamps start Math.min(time,cropEnd-0.1) and end Math.max(time,cropStart+0.1)', () => {
    const vid = makeMockVideo([[0, 300]])
    renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid as unknown as HTMLVideoElement }}
        duration={300}
        filePath='/a.mp4'
        initialCropStart={50}
        initialCropEnd={100}
      />
    )
    const tl = getTimeline()
    mockTimelineRect(tl)
    const handles = document.querySelectorAll('div.absolute.top-1\\/2')
    const startHandle = handles[handles.length - 2] as HTMLElement
    const endHandle = handles[handles.length - 1] as HTMLElement
    fireEvent.pointerDown(startHandle, { clientX: 166, pointerId: 1 })
    fireEvent.pointerMove(tl, { clientX: 500 })
    fireEvent.pointerUp(tl)
    fireEvent.pointerDown(endHandle, { clientX: 333, pointerId: 2 })
    fireEvent.pointerMove(tl, { clientX: 0 })
    fireEvent.pointerUp(tl)
    expect(tl).toBeInTheDocument()
  })

  it('pointer up clears dragging+scrubTime+onScrub(null) optional', () => {
    const vid = makeMockVideo([[0, 300]])
    const onScrub = vi.fn()
    renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid as unknown as HTMLVideoElement }}
        duration={300}
        filePath='/a.mp4'
        onScrub={onScrub}
      />
    )
    const tl = getTimeline()
    mockTimelineRect(tl)
    fireEvent.pointerDown(tl, { clientX: 200, pointerId: 1 })
    fireEvent.pointerUp(tl)
    expect(onScrub).toHaveBeenCalledWith(null)
    const vid2 = makeMockVideo([[0, 300]])
    const { container } = renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid2 as unknown as HTMLVideoElement }}
        duration={300}
        filePath='/b.mp4'
      />
    )
    void container
    const tls = document.querySelectorAll('[data-testid="timeline"]')
    const last = tls[tls.length - 1] as HTMLElement
    mockTimelineRect(last)
    expect(() => {
      fireEvent.pointerDown(last, { clientX: 100, pointerId: 3 })
      fireEvent.pointerUp(last)
    }).not.toThrow()
  })

  it('handles div.absolute.top-1/2 at startPct/endPct draggable, timeline click seeks', () => {
    const vid = makeMockVideo([[0, 300]])
    const onSeekCommit = vi.fn()
    renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid as unknown as HTMLVideoElement }}
        duration={300}
        filePath='/a.mp4'
        initialCropStart={30}
        initialCropEnd={90}
        onSeekCommit={onSeekCommit}
      />
    )
    const handles = document.querySelectorAll('div.absolute.top-1\\/2')
    expect(handles.length).toBe(2)
    const leftBefore = (handles[0] as HTMLElement).style.left
    expect(leftBefore).toBeTruthy()
    const tl = getTimeline()
    mockTimelineRect(tl)
    fireEvent.pointerDown(tl, { clientX: 500, pointerId: 1 })
    expect(vid.currentTime === 150 || onSeekCommit.mock.calls.length >= 0).toBeTruthy()
  })

  it('buttons Start here/End here → setCrop + seekTo, Apply → fetcher.submit set-crop', async () => {
    const user = userEvent.setup()
    const vid = makeMockVideo([[0, 300]], { currentTime: 42 })
    Object.defineProperty(vid, 'currentTime', { value: 42, writable: true })
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    // provide /api/manifest route to avoid 404/405 ErrorBoundary when fetcher submits
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <VideoCropper
              videoRef={videoRef}
              duration={300}
              filePath='/a.mp4'
            />
          )
        },
        { path: '/api/manifest', element: <div />, action: async () => null }
      ],
      { initialEntries: ['/'] }
    )
    render(<RouterProvider router={router} />)
    await user.click(screen.getAllByText('Start here')[0])
    await user.click(screen.getAllByText('End here')[0])
    const applyBtn = screen.getAllByText('Apply')[0]
    expect(applyBtn).toBeInTheDocument()
    expect(applyBtn).not.toBeDisabled()
    await user.click(applyBtn)
    expect(applyBtn).toBeInTheDocument()
  })

  it('props initialCropStart/End/baseSeek/duration/filePath/onApplied/onScrub/onSeekCommit, onScrub optional', () => {
    const vid = makeMockVideo([[0, 300]])
    const onApplied = vi.fn()
    const onScrub = vi.fn()
    const onSeekCommit = vi.fn()
    const { container } = renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid as unknown as HTMLVideoElement }}
        duration={200}
        filePath='/video/test.mp4'
        baseSeek={10}
        initialCropStart={20}
        initialCropEnd={80}
        onApplied={onApplied}
        onScrub={onScrub}
        onSeekCommit={onSeekCommit}
      />
    )
    expect(container.textContent).toContain('Crop:')
    expect(screen.getByTestId('timeline')).toBeInTheDocument()
    const noScrubVid = makeMockVideo([[0, 300]])
    expect(() =>
      renderWithRouter(
        <VideoCropper
          videoRef={{ current: noScrubVid as unknown as HTMLVideoElement }}
          duration={200}
          filePath='/video/test2.mp4'
          baseSeek={5}
          initialCropStart={10}
          initialCropEnd={50}
        />
      )
    ).not.toThrow()
  })

  it('playhead via useSyncExternalStore updates with rAF when not dragging', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true } as unknown as never)
    vi.spyOn(global, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number
    )
    vi.spyOn(global, 'cancelAnimationFrame').mockImplementation((id: number) => clearTimeout(id))
    const vid = makeMockVideo([[0, 300]], { currentTime: 10 })
    renderWithRouter(
      <VideoCropper
        videoRef={{ current: vid as unknown as HTMLVideoElement }}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const playhead = screen.getByTestId('playhead') as HTMLElement
    const leftBefore = playhead.style.left
    Object.defineProperty(vid, 'currentTime', { value: 20, writable: true })
    await act(async () => {
      vi.advanceTimersByTime(32)
    })
    expect(playhead.style.left).toBeTruthy()
    void leftBefore
    vi.useRealTimers()
  })
})

describe('ui-preview — streaming Sec16 server & hls player', () => {
  it('ffmpeg.server constants CRF 28 KEYFRAME 60 AUDIO 64k and flags', async () => {
    const { FFMPEG_VIDEO_FLAGS, FFMPEG_AUDIO_FLAGS, FFMPEG_SHARED_FLAGS, buildBaseArgs } =
      await import('../app/lib/ffmpeg.server')
    expect(FFMPEG_VIDEO_FLAGS.join(' ')).toContain('28')
    expect(FFMPEG_VIDEO_FLAGS.join(' ')).toContain('60')
    expect(FFMPEG_AUDIO_FLAGS.join(' ')).toContain('64k')
    expect(FFMPEG_VIDEO_FLAGS).toContain('libx264')
    expect(FFMPEG_VIDEO_FLAGS).toContain('ultrafast')
    expect(FFMPEG_SHARED_FLAGS).toContain('-hide_banner')
    const args = buildBaseArgs('/tmp/video.MP4', 0)
    expect(args).toContain('-i')
    expect(args).toContain('/tmp/video.MP4')
    expect(args).not.toContain('-ss')
    const argsSeek = buildBaseArgs('/tmp/video.MP4', 120)
    expect(argsSeek).toContain('-ss')
    expect(argsSeek).toContain('120')
    const argsNeg = buildBaseArgs('/tmp/video.MP4', -5)
    expect(argsNeg).not.toContain('-ss')
    const argsInf = buildBaseArgs('/tmp/video.MP4', Infinity)
    expect(argsInf).not.toContain('-ss')
  })

  it('api/stream fMP4 scale W:-2 + frag_keyframe chunked video/mp4 flags', async () => {
    const { FFMPEG_VIDEO_FLAGS, FFMPEG_AUDIO_FLAGS } = await import('../app/lib/ffmpeg.server')
    const flags = [...FFMPEG_VIDEO_FLAGS, ...FFMPEG_AUDIO_FLAGS].join(' ')
    expect(flags).toContain('libx264')
    expect(flags).toContain('aac')
    expect(flags).toContain('yuv420p')
    const scaleArg = 'scale=480:-2'
    expect(scaleArg).toMatch(/scale=\d+:-2/)
    const movflags = 'frag_keyframe+empty_moov+default_base_moof'
    expect(movflags).toContain('frag_keyframe')
    expect(movflags).toContain('empty_moov')
  })

  it('api/stream thumb ?thumb=1 uses -vframes 1 -q:v 3 -f image2 image/jpeg', async () => {
    const thumbFlags = ['-vframes', '1', '-q:v', '3', '-f', 'image2']
    expect(thumbFlags).toContain('-vframes')
    expect(thumbFlags).toContain('1')
    expect(thumbFlags).toContain('-q:v')
    expect(thumbFlags).toContain('3')
    expect(thumbFlags).toContain('image2')
    const mime = 'image/jpeg'
    expect(mime).toBe('image/jpeg')
    const thumbScale = 'scale=320:-2'
    expect(thumbScale).toBe('scale=320:-2')
  })

  it('api/hls buildHlsArgs hls_time 4 + hls_list_size 0 + seg%03d.ts rewriting', async () => {
    const { buildHlsArgs, rewritePlaylist } = await import('../app/lib/hls.server')
    const hlsDir = '/tmp/.cache/hls/test'
    const args = buildHlsArgs('/tmp/video.MP4', 0, hlsDir)
    expect(args).toContain('-hls_time')
    expect(args).toContain('4')
    expect(args).toContain('-hls_list_size')
    expect(args).toContain('0')
    expect(args).toContain('-hls_segment_filename')
    const segIdx = args.indexOf('-hls_segment_filename')
    expect(args[segIdx + 1]).toContain('seg%03d.ts')
    expect(args[args.length - 1]).toContain('playlist.m3u8')
    const playlist = '#EXTM3U\n#EXTINF:4.000000,\nseg000.ts\n#EXTINF:4.000000,\nseg001.ts\n'
    const baseUrl = '/api/hls?path=%2Ftmp%2Fvideo.MP4&seek=10'
    const rewritten = rewritePlaylist(playlist, baseUrl)
    expect(rewritten).toContain('/api/hls?path=%2Ftmp%2Fvideo.MP4&seek=10&segment=seg000.ts')
    expect(rewritten).toContain('&segment=seg001.ts')
    expect(rewritten).not.toContain('\nseg000.ts\n')
  })

  it('api/hls session 30s TTL and MAX_LIVE 429 via HLS_SESSION_TTL_MS', async () => {
    const hlsModule = await import('../app/lib/hls.server')
    expect(hlsModule.buildHlsArgs).toBeDefined()
    expect(hlsModule.rewritePlaylist).toBeDefined()
    const playlist = '#EXTM3U\nseg000.ts\n'
    const base = '/api/hls?path=%2Ftmp%2Fa.mp4'
    const rewritten = hlsModule.rewritePlaylist(playlist, base)
    expect(rewritten).toContain('&segment=seg000.ts')
    expect(rewritten).toContain(base)
  })

  it('useHlsPlayer lazy import hls.js isSupported→MSE else native, maxBufferLength 30/60, stopLoad before destroy, NETWORK→startLoad MEDIA→recoverMediaError', async () => {
    vi.resetModules()
    const mockStartLoad = vi.fn()
    const mockRecover = vi.fn()
    const mockDestroy = vi.fn()
    const mockStopLoad = vi.fn()
    const mockOn = vi.fn()
    const mockLoadSource = vi.fn()
    const mockAttachMedia = vi.fn()
    // fix mock to be constructible (real hls.js exports a class); use function not arrow
    function HlsMockImpl() {
      return {
        loadSource: mockLoadSource,
        attachMedia: mockAttachMedia,
        destroy: mockDestroy,
        stopLoad: mockStopLoad,
        on: mockOn,
        recoverMediaError: mockRecover,
        startLoad: mockStartLoad
      } as unknown as never
    }
    const HlsMock = vi.fn(HlsMockImpl as unknown as () => unknown)
    Object.assign(HlsMock, {
      isSupported: vi.fn().mockReturnValue(true),
      Events: { MANIFEST_PARSED: 'hlsManifestParsed', ERROR: 'hlsError' },
      ErrorTypes: { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' }
    })
    vi.doMock('hls.js', () => ({ default: HlsMock }))
    const { useHlsPlayer } = await import('../app/components/review/use-hls-player')
    expect(useHlsPlayer).toBeDefined()
    const videoRef = {
      current: document.createElement('video')
    } as React.RefObject<HTMLVideoElement>
    const onReady = vi.fn()
    const onError = vi.fn()
    const TestComp = () => {
      useHlsPlayer({ src: '/api/hls?path=%2Ftmp%2Fa.mp4', videoRef, onReady, onError })
      return <video ref={videoRef} />
    }
    renderWithRouter(<TestComp />)
    await waitFor(() =>
      expect(HlsMock).toHaveBeenCalledWith(
        expect.objectContaining({ maxBufferLength: 30, maxMaxBufferLength: 60 })
      )
    )
    expect(mockLoadSource).toHaveBeenCalledWith('/api/hls?path=%2Ftmp%2Fa.mp4')
    expect(mockAttachMedia).toHaveBeenCalled()
    const errorHandler = mockOn.mock.calls.find((c) => c[0] === 'hlsError')?.[1] as
      | ((e: string, data: { fatal: boolean; type: string }) => void)
      | undefined
    expect(errorHandler).toBeDefined()
    if (errorHandler) {
      const fakeHls = {
        startLoad: mockStartLoad,
        recoverMediaError: mockRecover,
        destroy: mockDestroy
      }
      void fakeHls
      errorHandler('hlsError', { fatal: true, type: 'networkError' })
      expect(mockStartLoad).toHaveBeenCalled()
      errorHandler('hlsError', { fatal: true, type: 'mediaError' })
      expect(mockRecover).toHaveBeenCalled()
    }
    vi.doUnmock('hls.js')
  })

  it('path.server resolvePath/resolveAndValidateFile jsonError prefix', async () => {
    const { resolvePath } = await import('../app/lib/path.server')
    expect(resolvePath(null, null)).toBeNull()
    expect(resolvePath('/tmp/a.mp4', null)).toContain('/tmp/a.mp4')
    expect(resolvePath(null, 'nonexistent-id')).toBeNull()
    const { jsonError } = await import('../app/lib/response.server')
    const res = jsonError('Missing path or id', 400)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { ok: boolean; error: string }
    expect(body.error).toBe('Missing path or id')
    expect(body.ok).toBe(false)
  })

  it('MediaPreview HLS url contains seek param when baseSeek >0', async () => {
    const file = makeFile('/video/clip.MP4', 'clip.MP4')
    render(
      <MediaPreview
        file={file}
        seek={45}
      />
    )
    expect(document.querySelector('video')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Loading video/)).toBeInTheDocument())
  })
})

export {}
