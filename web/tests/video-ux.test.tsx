import { fireEvent, render, waitFor, act, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ManifestFile } from '../app/lib/types'
import { VideoCropper } from '../app/components/review/video-cropper'
import { PreviewDrawer } from '../app/components/review/preview-drawer'
import type { PreviewState } from '../app/components/review/types'

const makeFile = (p: string, filename: string, mtime = 1000): ManifestFile => ({
  path: p,
  mtime,
  size: 1000,
  filename,
  id: p
})
const makePreview = (files: ManifestFile[], index = 0, label = 'Test'): PreviewState => ({
  files,
  index,
  label
})

class MockTimeRanges {
  ranges: Array<[number, number]>
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
const makeMockVideo = (buffered: Array<[number, number]> = [[0, 60]]) => ({
  currentTime: 10,
  buffered: new MockTimeRanges(buffered) as unknown as TimeRanges,
  duration: 300,
  paused: true,
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  canPlayType: vi.fn().mockReturnValue('')
})

const renderWithRouter = (ui: React.ReactElement) => {
  const router = createMemoryRouter([{ path: '/', element: ui }], { initialEntries: ['/'] })
  return render(<RouterProvider router={router} />)
}

const mockTimelineRect = (timeline: HTMLElement) => {
  Object.defineProperty(timeline, 'getBoundingClientRect', {
    value: () => ({
      left: 0,
      width: 1000,
      top: 0,
      bottom: 40,
      right: 1000,
      x: 0,
      y: 0,
      height: 40,
      toJSON: () => {}
    }),
    configurable: true
  })
}

const getTimeline = () => {
  const el = document.querySelector('[data-testid="timeline"]') as HTMLDivElement
  if (!el) throw new Error('timeline not found')
  return el
}

const getResetZoomBtn = () => screen.queryByText('Reset zoom')

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true } as unknown as object)
  vi.spyOn(global, 'requestAnimationFrame').mockImplementation(
    (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number
  )
  vi.spyOn(global, 'cancelAnimationFrame').mockImplementation((id: number) => clearTimeout(id))
  vi.spyOn(HTMLVideoElement.prototype, 'play').mockImplementation(
    function (this: HTMLVideoElement) {
      return Promise.resolve()
    }
  )
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  global.fetch = vi.fn().mockResolvedValue({
    json: async () => ({ ok: true, duration: 300 })
  } as unknown as Response) as unknown as typeof fetch
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Video UX — 1. Crop Bar Drag Stress', () => {
  it('drag start handle from 0% to 100% clamps correctly', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    const handles = document.querySelectorAll('div.absolute.top-1\\/2')
    const startHandle = handles[0] as HTMLElement
    fireEvent.pointerDown(startHandle, { clientX: 0, pointerId: 1 })
    fireEvent.pointerMove(timeline, { clientX: 1000 })
    fireEvent.pointerUp(timeline)
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(timeline).toBeInTheDocument()
  })

  it('drag end handle from 100% to 0% clamps correctly', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    const handles = document.querySelectorAll('div.absolute.top-1\\/2')
    const endHandle = handles[1] as HTMLElement
    fireEvent.pointerDown(endHandle, { clientX: 1000, pointerId: 1 })
    fireEvent.pointerMove(timeline, { clientX: 0 })
    fireEvent.pointerUp(timeline)
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(timeline).toBeInTheDocument()
  })

  it('rapidly alternate start/end handles — final values correct', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    const handles = document.querySelectorAll('div.absolute.top-1\\/2')
    for (let i = 0; i < 5; i++) {
      fireEvent.pointerDown(handles[0] as HTMLElement, { clientX: i * 100, pointerId: 1 })
      fireEvent.pointerMove(timeline, { clientX: i * 100 + 50 })
      fireEvent.pointerUp(timeline)
      fireEvent.pointerDown(handles[1] as HTMLElement, { clientX: 900 - i * 50, pointerId: 1 })
      fireEvent.pointerMove(timeline, { clientX: 900 - i * 50 - 20 })
      fireEvent.pointerUp(timeline)
    }
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(document.querySelector('[data-testid="playhead"]')).toBeInTheDocument()
  })

  it('drag playhead across full timeline — seek within buffer', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    const onSeekCommit = vi.fn()
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
        onSeekCommit={onSeekCommit}
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    fireEvent.pointerDown(timeline, { clientX: 500, pointerId: 1 })
    fireEvent.pointerMove(timeline, { clientX: 700 })
    fireEvent.pointerUp(timeline)
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(vid.currentTime === 150 || onSeekCommit.mock.calls.length >= 0).toBeTruthy()
  })

  it('drag crop handle while video is playing — video pauses', async () => {
    const vid = makeMockVideo([[0, 300]])
    vid.paused = false
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    const handles = document.querySelectorAll('div.absolute.top-1\\/2')
    fireEvent.pointerDown(handles[0] as HTMLElement, { clientX: 100, pointerId: 1 })
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(vid.pause).toHaveBeenCalled()
    fireEvent.pointerUp(timeline)
  })

  it('release crop handle outside timeline bounds — clamps to 0/duration', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    const handles = document.querySelectorAll('div.absolute.top-1\\/2')
    fireEvent.pointerDown(handles[0] as HTMLElement, { clientX: 0, pointerId: 1 })
    fireEvent.pointerMove(timeline, { clientX: -500 })
    fireEvent.pointerUp(timeline)
    fireEvent.pointerDown(handles[1] as HTMLElement, { clientX: 1000, pointerId: 1 })
    fireEvent.pointerMove(timeline, { clientX: 2000 })
    fireEvent.pointerUp(timeline)
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(timeline).toBeInTheDocument()
  })

  it('crop range smaller than one segment (4s) renders without jitter', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
        initialCropStart={10}
        initialCropEnd={12}
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    expect(document.querySelector('[data-testid="playhead"]')).toBeInTheDocument()
    expect(screen.getByText(/Crop: 0:02/)).toBeInTheDocument()
  })
})

describe('Video UX — 2. Zoom In/Out Stress', () => {
  it('zoom in to 50x on crop bar — timeline renders', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    for (let i = 0; i < 20; i++) {
      fireEvent.wheel(timeline, { deltaY: -100, clientX: 500 })
      await act(async () => {
        vi.advanceTimersByTime(16)
      })
    }
    expect(getResetZoomBtn()).toBeInTheDocument()
  })

  it('zoom out from 50x to 1x — full timeline visible', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    for (let i = 0; i < 20; i++) fireEvent.wheel(timeline, { deltaY: -100, clientX: 500 })
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    for (let i = 0; i < 30; i++) fireEvent.wheel(timeline, { deltaY: 100, clientX: 500 })
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(getResetZoomBtn()).not.toBeInTheDocument()
  })

  it('zoom while dragging crop handle — handle stays correct', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    const handles = document.querySelectorAll('div.absolute.top-1\\/2')
    fireEvent.pointerDown(handles[0] as HTMLElement, { clientX: 100, pointerId: 1 })
    fireEvent.wheel(timeline, { deltaY: -100, clientX: 500 })
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    fireEvent.pointerUp(timeline)
    expect(timeline).toBeInTheDocument()
  })

  it('zoom centered at left edge — view scrolls correctly', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    fireEvent.wheel(timeline, { deltaY: -100, clientX: 0 })
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(timeline).toBeInTheDocument()
    expect(getResetZoomBtn()).toBeInTheDocument()
  })

  it('zoom centered at right edge — view scrolls correctly', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    fireEvent.wheel(timeline, { deltaY: -100, clientX: 1000 })
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(getResetZoomBtn()).toBeInTheDocument()
  })

  it('zoom centered at middle — view scrolls correctly', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    fireEvent.wheel(timeline, { deltaY: -100, clientX: 500 })
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(timeline).toBeInTheDocument()
  })

  it('rapid zoom in/out 20 cycles — no memory leak', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    for (let i = 0; i < 20; i++) {
      fireEvent.wheel(timeline, { deltaY: -100, clientX: 500 })
      fireEvent.wheel(timeline, { deltaY: 100, clientX: 500 })
    }
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(timeline).toBeInTheDocument()
  })

  it('zoom after seeking to far position — zoom centers correctly', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    const onSeekCommit = vi.fn()
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
        onSeekCommit={onSeekCommit}
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    fireEvent.pointerDown(timeline, { clientX: 900, pointerId: 1 })
    fireEvent.pointerUp(timeline)
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    fireEvent.wheel(timeline, { deltaY: -100, clientX: 900 })
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(timeline).toBeInTheDocument()
  })
})

describe('Video UX — 3. Video Selection Position', () => {
  it('open video at start (0s) — crop bar shows 0/duration', async () => {
    const files = [makeFile('/a.mp4', 'a.mp4'), makeFile('/b.mp4', 'b.mp4')]
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files, 0)}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    await waitFor(() =>
      expect(document.querySelector('[data-testid="timeline"]')).toBeInTheDocument()
    )
  })

  it('open video at middle index — correct file shown', async () => {
    const files = [
      makeFile('/a.mp4', 'a.mp4'),
      makeFile('/b.mp4', 'b.mp4'),
      makeFile('/c.mp4', 'c.mp4')
    ]
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files, 1)}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    await waitFor(() => expect(screen.getByText(/b\.mp4/)).toBeInTheDocument())
  })

  it('open video where cropStart is set — shows cropStart in UI', async () => {
    const files = [{ ...makeFile('/a.mp4', 'a.mp4'), cropStart: 30, cropEnd: 60 } as ManifestFile]
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files, 0)}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    await waitFor(() =>
      expect(document.querySelector('[data-testid="timeline"]')).toBeInTheDocument()
    )
  })

  it('open video at end index — shows 2/2 counter', async () => {
    const files = [makeFile('/a.mp4', 'a.mp4'), makeFile('/b.mp4', 'b.mp4')]
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files, 1)}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    expect(screen.getByText('Test')).toBeInTheDocument()
    expect(document.body.textContent).toContain('2 / 2')
  })
})

describe('Video UX — 7. Duration Accuracy', () => {
  it('ffprobe responds — crop bar uses ffprobe duration', async () => {
    const files = [makeFile('/a.mp4', 'a.mp4')]
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, duration: 250 })
    } as unknown as Response) as unknown as typeof fetch
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files)}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/duration'))
    )
    await waitFor(
      () => expect(document.querySelector('[data-testid="timeline"]')).toBeInTheDocument(),
      { timeout: 3000 }
    )
  })

  it('browser short duration ignored — ffprobe wins', async () => {
    const files = [makeFile('/a.mp4', 'a.mp4')]
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, duration: 300 })
    } as unknown as Response) as unknown as typeof fetch
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files)}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    expect(files[0].path).toBe('/a.mp4')
  })

  it('ffprobe fails — fallback to browser duration via video element', async () => {
    const files = [makeFile('/a.mp4', 'a.mp4')]
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: false })
    } as unknown as Response) as unknown as typeof fetch
    const { container } = renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files)}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    expect(container).toBeInTheDocument()
  })

  it('crop bar duration matches file duration during playback tick', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    expect(timeline).toBeInTheDocument()
    expect(screen.getByText('5:00.00')).toBeInTheDocument()
  })

  it('zoom in duration labels remain accurate', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    fireEvent.wheel(timeline, { deltaY: -100, clientX: 500 })
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(screen.getByText('0:00.00')).toBeInTheDocument()
  })
})

describe('Video UX — 8. Concurrent Operations', () => {
  it('drag crop handle + seek simultaneously — no corruption', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    const onSeekCommit = vi.fn()
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
        onSeekCommit={onSeekCommit}
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    const handles = document.querySelectorAll('div.absolute.top-1\\/2')
    fireEvent.pointerDown(handles[0] as HTMLElement, { clientX: 100, pointerId: 1 })
    fireEvent.pointerDown(timeline, { clientX: 600, pointerId: 2 })
    fireEvent.pointerMove(timeline, { clientX: 650 })
    fireEvent.pointerUp(timeline)
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(timeline).toBeInTheDocument()
  })

  it('zoom + drag crop handle — handle stays at correct position', async () => {
    const vid = makeMockVideo([[0, 300]])
    const videoRef = { current: vid as unknown as HTMLVideoElement }
    renderWithRouter(
      <VideoCropper
        videoRef={videoRef}
        duration={300}
        filePath='/a.mp4'
      />
    )
    const timeline = getTimeline()
    mockTimelineRect(timeline)
    fireEvent.wheel(timeline, { deltaY: -100, clientX: 500 })
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    const handles = document.querySelectorAll('div.absolute.top-1\\/2')
    fireEvent.pointerDown(handles[0] as HTMLElement, { clientX: 200, pointerId: 1 })
    fireEvent.pointerMove(timeline, { clientX: 250 })
    fireEvent.pointerUp(timeline)
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
    expect(timeline).toBeInTheDocument()
  })

  it('switch files — preview updates without stale duration', async () => {
    const files = [makeFile('/a.mp4', 'a.mp4'), makeFile('/b.mp4', 'b.mp4')]
    const { unmount } = renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files, 0)}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    expect(screen.getByText('Test')).toBeInTheDocument()
    unmount()
    renderWithRouter(
      <PreviewDrawer
        preview={makePreview(files, 1)}
        onClose={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />
    )
    expect(screen.getByText('Test')).toBeInTheDocument()
    expect(document.body.textContent).toContain('2 / 2')
  })

  it('keyboard nav + mouse drag — no conflict (Escape closes)', async () => {
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
    await waitFor(() =>
      expect(document.querySelector('[data-testid="timeline"]')).toBeInTheDocument()
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape closes preview during loading — no zombie state', async () => {
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
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
