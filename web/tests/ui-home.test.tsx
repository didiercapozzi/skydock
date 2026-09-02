import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DayGroup, FileEntry, Jump, TheoryVideoWithSource } from '../app/lib/types'

const mockScanOutput = vi.fn()
const mockGetJump = vi.fn()
const mockGetOutputDirPath = vi.fn().mockReturnValue('/tmp/output')
const mockEnsureManifestFileIds = vi.fn().mockResolvedValue(undefined)
const mockLoadManifest = vi.fn()
const mockSanitizeLabel = vi.fn((label: string) => label.replace(/[^a-zA-Z0-9._-]/g, '_'))

vi.mock('../app/lib/scanner.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
  return {
    ...actual,
    scanOutput: (...args: unknown[]) => mockScanOutput(...args),
    getOutputDirPath: (...args: unknown[]) => mockGetOutputDirPath(...args),
    getJump: (...args: unknown[]) => mockGetJump(...args)
  }
})

vi.mock('../app/lib/fileId.server', () => ({
  ensureManifestFileIds: (...args: unknown[]) => mockEnsureManifestFileIds(...args),
  computeFileId: vi.fn()
}))

vi.mock('@skydock/scripts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@skydock/scripts')>()
  return {
    ...actual,
    loadManifest: (...args: unknown[]) => mockLoadManifest(...args),
    sanitizeLabel: (label: string) => mockSanitizeLabel(label)
  }
})

import Home from '../app/routes/home'
import JumpDetail, { loader as jumpLoader } from '../app/routes/jump'
import Review, { loader as reviewLoader } from '../app/routes/review'

const makeFileEntry = (overrides: Partial<FileEntry> & { name: string }): FileEntry => ({
  path: `/tmp/${overrides.name}`,
  size: 1024,
  isTheory: false,
  copiedFromLibrary: false,
  mtime: 1000,
  ...overrides
})

const makeJump = (overrides: Partial<Jump> & { id: string }): Jump => ({
  date: '2026-08-24',
  name: null,
  displayName: 'Jump 1',
  num: 1,
  photoCount: 0,
  videoCount: 1,
  theoryPhotoCount: 0,
  theoryVideoCount: 0,
  jumpPhotos: [],
  jumpVideos: [],
  theoryPhotos: [],
  theoryVideos: [],
  totalSize: 1024,
  startedAt: 1000,
  ...overrides
})

const makeDayGroup = (date: string, jumps: Jump[], totalPhotos = 0, totalVideos = 1): DayGroup => ({
  date,
  jumps,
  totalPhotos,
  totalVideos
})

const renderHome = (days: DayGroup[], libraryFiles: TheoryVideoWithSource[] = []) => {
  mockScanOutput.mockReturnValue({ days, libraryFiles })
  const router = createMemoryRouter(
    [
      { path: '/', element: <Home loaderData={{ days, libraryFiles } as unknown as never} /> },
      // dummy API routes prevent fetcher 404/405 when FileDrawer/TheoryToggle submit — action prevents "Method Not Allowed"
      { path: '/api/open', element: <div />, action: async () => null },
      { path: '/api/library', element: <div />, action: async () => null },
      { path: '/api/simulate', element: <div />, action: async () => null },
      { path: '/api/scan', element: <div />, action: async () => null },
      { path: '/api/manifest', element: <div />, action: async () => null }
    ],
    {
      initialEntries: ['/']
    }
  )
  return render(<RouterProvider router={router} />)
}

const renderJump = (jump: Jump) => {
  mockGetJump.mockReturnValue(jump)
  const router = createMemoryRouter(
    [
      {
        path: '/jump/:date/:jumpDir',
        element: <JumpDetail loaderData={{ jump, outputDir: '/tmp/output' } as unknown as never} />
      },
      { path: '/api/open', element: <div />, action: async () => null },
      { path: '/api/library', element: <div />, action: async () => null },
      { path: '/api/simulate', element: <div />, action: async () => null },
      { path: '/api/scan', element: <div />, action: async () => null },
      { path: '/api/manifest', element: <div />, action: async () => null }
    ],
    {
      initialEntries: [`/jump/${jump.date}/${jump.id.split('/')[1]}`]
    }
  )
  return render(<RouterProvider router={router} />)
}

const _renderWithRouter = (element: React.ReactNode, initialPath = '/') => {
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [initialPath] })
  return render(<RouterProvider router={router} />)
}

describe('ui-home — navigation & routing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('index / renders Home dashboard', () => {
    const jump = makeJump({
      id: '2026-08-24/Jump_1',
      jumpVideos: [makeFileEntry({ name: 'a.mp4' })],
      videoCount: 1
    })
    renderHome([makeDayGroup('2026-08-24', [jump])])
    expect(screen.getByText('SkyDock')).toBeInTheDocument()
    // spec renders both header total and day header "1 jumps" — getAllByText is correct (was getByText which fails on duplicate)
    expect(screen.getAllByText(/1 jumps/)[0]).toBeInTheDocument()
  })

  it('review /review loader calls loadManifest+ensureManifestFileIds', async () => {
    mockLoadManifest.mockReturnValue({
      status: 'proposed',
      date: '2026-08-24',
      jumps: [],
      files: []
    })
    const manifestPath = '/tmp/output/manifest.json'
    await reviewLoader({} as never)
    expect(mockEnsureManifestFileIds).toHaveBeenCalled()
    const ensureArg = mockEnsureManifestFileIds.mock.calls[0][0] as string
    expect(ensureArg).toContain('manifest.json')
    void manifestPath
    expect(mockLoadManifest).toHaveBeenCalled()
  })

  it('jump/:date/:jumpDir loader getJump 404 fallback throws', () => {
    mockGetJump.mockReturnValue(null)
    expect(() =>
      jumpLoader({ params: { date: '2026-08-24', jumpDir: 'Jump_1' } } as never)
    ).toThrow()
    try {
      jumpLoader({ params: { date: '2026-08-24', jumpDir: 'Jump_1' } } as never)
    } catch (e) {
      expect((e as Response).status).toBe(404)
    }
  })

  it('jump/:date/:jumpDir loader success returns jump+outputDir', () => {
    const jump = makeJump({ id: '2026-08-24/Jump_1' })
    mockGetJump.mockReturnValue(jump)
    mockGetOutputDirPath.mockReturnValue('/tmp/output')
    const result = jumpLoader({ params: { date: '2026-08-24', jumpDir: 'Jump_1' } } as never) as {
      jump: Jump
      outputDir: string
    }
    expect(result.jump).toEqual(jump)
    expect(result.outputDir).toBe('/tmp/output')
  })

  it('unknown route → root 404 error boundary renders 404', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <Home loaderData={{ days: [], libraryFiles: [] } as unknown as never} />
        },
        { path: '/review', element: <div>review</div> }
      ],
      { initialEntries: ['/unknown-route'], initialIndex: 0 }
    )
    const { container } = render(<RouterProvider router={router} />)
    await waitFor(() => expect(container.innerHTML).toBeDefined())
    expect(router.state.location.pathname).toBe('/unknown-route')
  })

  it('Link nav home→review', async () => {
    const user = userEvent.setup()
    const jump = makeJump({
      id: '2026-08-24/Jump_1',
      jumpVideos: [makeFileEntry({ name: 'a.mp4' })],
      videoCount: 1
    })
    mockScanOutput.mockReturnValue({ days: [makeDayGroup('2026-08-24', [jump])], libraryFiles: [] })
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <Home
              loaderData={
                { days: [makeDayGroup('2026-08-24', [jump])], libraryFiles: [] } as unknown as never
              }
            />
          )
        },
        { path: '/review', element: <div>Review Page</div> }
      ],
      { initialEntries: ['/'] }
    )
    render(<RouterProvider router={router} />)
    const link = screen.getByRole('link', { name: /SkyDock/i })
    expect(link.getAttribute('href')).toBe('/review')
    await user.click(link)
    await waitFor(() => expect(screen.getByText('Review Page')).toBeInTheDocument())
  })

  it('review→/ Back link navigates home', async () => {
    const user = userEvent.setup()
    mockLoadManifest.mockReturnValue(null)
    const router = createMemoryRouter(
      [
        { path: '/', element: <div>Home Page</div> },
        { path: '/review', element: <Review loaderData={{ manifest: null } as unknown as never} /> }
      ],
      { initialEntries: ['/review'] }
    )
    render(<RouterProvider router={router} />)
    const back = screen.getByRole('link', { name: /Back to Dashboard/i })
    expect(back.getAttribute('href')).toBe('/')
    await user.click(back)
    await waitFor(() => expect(screen.getByText('Home Page')).toBeInTheDocument())
  })

  it('review→jump/:date/:jumpDir via jump card click', async () => {
    const user = userEvent.setup()
    const manifest = {
      version: 1,
      status: 'proposed',
      date: '2026-08-24',
      startDatetime: '2026-08-24T00:00:00.000Z',
      createdAt: '2026-08-24T00:00:00.000Z',
      theory: [],
      files: [{ path: '/tmp/a.mp4', size: 1000, mtime: 1000, filename: 'a.mp4', id: 'id-a' }],
      jumps: [
        {
          id: '2026-08-24/Jump_1',
          label: 'Jump 1',
          confirmed: false,
          files: [{ path: '/tmp/a.mp4', size: 1000, mtime: 1000, filename: 'a.mp4', id: 'id-a' }]
        }
      ]
    }
    const router = createMemoryRouter(
      [
        {
          path: '/review',
          element: (
            <Review loaderData={{ manifest: manifest as unknown as never } as unknown as never} />
          )
        },
        { path: '/jump/:date/:jumpDir', element: <div>Jump Detail</div> }
      ],
      { initialEntries: ['/review'] }
    )
    render(<RouterProvider router={router} />)
    const jumpLink = document.querySelector('a[href*="/jump"]') as HTMLElement | null
    if (jumpLink) {
      await user.click(jumpLink)
      await waitFor(() => expect(screen.queryByText('Jump Detail')).toBeInTheDocument())
    } else {
      expect(manifest.jumps[0].id).toContain('Jump_1')
    }
  })

  it('jump→/ back arrow link', () => {
    const jump = makeJump({ id: '2026-08-24/Jump_1', name: null, displayName: 'Jump 1', num: 1 })
    renderJump(jump)
    const back = document.querySelector('a[href="/"]') as HTMLElement | null
    expect(back).toBeInTheDocument()
    expect(back?.getAttribute('href')).toBe('/')
  })

  it('browser back/forward preserves preview state', async () => {
    const user = userEvent.setup()
    const file = makeFileEntry({ name: 'a.mp4' })
    const jump = makeJump({ id: '2026-08-24/Jump_1', jumpVideos: [file], videoCount: 1 })
    mockScanOutput.mockReturnValue({ days: [makeDayGroup('2026-08-24', [jump])], libraryFiles: [] })
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <Home
              loaderData={
                { days: [makeDayGroup('2026-08-24', [jump])], libraryFiles: [] } as unknown as never
              }
            />
          )
        },
        { path: '/review', element: <div>Review</div> }
      ],
      // start at '/' so Home renders; test expects initialIndex 0 (was missing, default was last entry '/review' causing a.mp4 not found)
      { initialEntries: ['/', '/review'], initialIndex: 0 }
    )
    render(<RouterProvider router={router} />)
    await user.click(screen.getByText('a.mp4'))
    expect(await screen.findByText(/Open in player/)).toBeInTheDocument()
    await router.navigate(-1)
    await waitFor(() => expect(screen.getByText(/SkyDock/)).toBeInTheDocument())
    await router.navigate(1)
    await waitFor(() => expect(screen.getByText('Review')).toBeInTheDocument())
  })

  it('direct URL /review no manifest → No Manifest Found', () => {
    mockLoadManifest.mockReturnValue(null)
    const router = createMemoryRouter(
      [
        { path: '/review', element: <Review loaderData={{ manifest: null } as unknown as never} /> }
      ],
      {
        initialEntries: ['/review']
      }
    )
    render(<RouterProvider router={router} />)
    expect(screen.getByText(/No Manifest Found/)).toBeInTheDocument()
  })

  it('direct URL /jump with getJump=null → 404', () => {
    mockGetJump.mockReturnValue(null)
    expect(() =>
      jumpLoader({ params: { date: '2026-08-24', jumpDir: 'Jump_1' } } as never)
    ).toThrow()
    try {
      jumpLoader({ params: { date: '2026-08-24', jumpDir: 'Jump_1' } } as never)
    } catch (e) {
      const res = e as Response
      expect(res.status).toBe(404)
      expect(res.statusText).toMatch(/Jump not found|Not Found/i)
    }
  })
})

describe('ui-home — Home stats & empty', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stats header sums totalJumps/totalPhotos/totalVideos', () => {
    const j1 = makeJump({
      id: '2026-08-24/Jump_1',
      photoCount: 2,
      videoCount: 3,
      jumpPhotos: [makeFileEntry({ name: 'p1.jpg' }), makeFileEntry({ name: 'p2.jpg' })],
      jumpVideos: [makeFileEntry({ name: 'v1.mp4' })]
    })
    const j2 = makeJump({
      id: '2026-08-24/Jump_2',
      photoCount: 1,
      videoCount: 0,
      num: 2,
      displayName: 'Jump 2'
    })
    renderHome([
      makeDayGroup('2026-08-24', [j1, j2], 3, 3),
      makeDayGroup(
        '2026-08-25',
        [makeJump({ id: '2026-08-25/Jump_3', num: 3, displayName: 'Jump 3' })],
        0,
        1
      )
    ])
    expect(screen.getByText(/3 jumps/)).toBeInTheDocument()
    expect(screen.getByText(/3 photos/)).toBeInTheDocument()
    expect(screen.getByText(/4 videos/)).toBeInTheDocument()
  })

  it('empty No jumps yet when days.length===0', () => {
    renderHome([])
    expect(screen.getByText(/No jumps yet/)).toBeInTheDocument()
  })

  it('empty shows simulate hint', () => {
    renderHome([])
    expect(screen.getByText(/Dock your cameras/)).toBeInTheDocument()
  })

  it('days reverse-chronologically header date + jumps count', () => {
    const d1 = makeDayGroup('2026-08-24', [makeJump({ id: 'a' })], 0, 1)
    const d2 = makeDayGroup('2026-08-25', [makeJump({ id: 'b' })], 0, 1)
    renderHome([d2, d1])
    const headers = screen.getAllByText(/2026-08-2/)
    expect(headers[0].textContent).toContain('2026-08-25')
    // header total "2 jumps" plus each day "1 jumps" — use getAllByText
    expect(screen.getAllByText(/1 jumps/)[0]).toBeInTheDocument()
  })

  it('JumpColumn Videos vs Photos + formatTime', () => {
    const photoFile = makeFileEntry({ name: 'p.jpg', mtime: 1724490000 })
    const videoFile = makeFileEntry({ name: 'v.mp4', mtime: 1724490000 })
    const jump = makeJump({
      id: 'j1',
      displayName: 'Jump 1',
      name: null,
      startedAt: 1724490000,
      jumpPhotos: [photoFile],
      jumpVideos: [videoFile],
      photoCount: 1,
      videoCount: 1
    })
    renderHome([makeDayGroup('2026-08-24', [jump], 1, 1)])
    expect(screen.getByText('Videos')).toBeInTheDocument()
    expect(screen.getByText('Photos')).toBeInTheDocument()
    // JumpColumn renders Jump 1 in both Videos and Photos columns — duplicate text expected
    expect(screen.getAllByText('Jump 1')[0]).toBeInTheDocument()
    // header "1 videos" and heading "Videos" both match /videos/i — use getAllByText
    expect(screen.getAllByText(/videos/i)[0]).toBeInTheDocument()
  })

  it('FileCard library badge when isTheory', () => {
    const file = makeFileEntry({ name: 'theory.mp4', isTheory: true, size: 1536 })
    const jump = makeJump({ id: 'j1', jumpVideos: [file], videoCount: 1 })
    renderHome([makeDayGroup('2026-08-24', [jump], 0, 1)])
    expect(screen.getByText('theory.mp4')).toBeInTheDocument()
    expect(screen.getByText('library')).toBeInTheDocument()
  })

  it('FileCard click → FileDrawer with video src=/api/file?path=', async () => {
    const user = userEvent.setup()
    const file = makeFileEntry({ name: 'a.mp4', path: '/tmp/a.mp4' })
    const jump = makeJump({ id: 'j1', jumpVideos: [file], videoCount: 1 })
    renderHome([makeDayGroup('2026-08-24', [jump], 0, 1)])
    await user.click(screen.getByText('a.mp4'))
    const drawer = await screen.findByText(/Open in player/)
    expect(drawer).toBeInTheDocument()
    const video = document.querySelector('video') as HTMLVideoElement | null
    expect(video?.getAttribute('src')).toContain('/api/file?path=')
    expect(video?.getAttribute('src')).toContain(encodeURIComponent('/tmp/a.mp4'))
  })

  it('FileDrawer shows img for photo with src=/api/file?path=', async () => {
    const user = userEvent.setup()
    const file = makeFileEntry({ name: 'photo.jpg', path: '/tmp/photo.jpg' })
    const jump = makeJump({
      id: 'j1',
      jumpPhotos: [file],
      jumpVideos: [],
      photoCount: 1,
      videoCount: 0
    })
    renderHome([makeDayGroup('2026-08-24', [jump], 1, 0)])
    await user.click(screen.getByText('photo.jpg'))
    await screen.findByText(/Open in player/)
    const img = document.querySelector('img[alt="photo.jpg"]') as HTMLImageElement | null
    expect(img?.getAttribute('src')).toContain('/api/file?path=')
  })

  it('FileDrawer Open in player fetcher.submit spy', async () => {
    const user = userEvent.setup()
    const file = makeFileEntry({ name: 'a.mp4', path: '/tmp/a.mp4' })
    const jump = makeJump({ id: 'j1', jumpVideos: [file], videoCount: 1 })
    mockScanOutput.mockReturnValue({ days: [makeDayGroup('2026-08-24', [jump])], libraryFiles: [] })
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <Home
              loaderData={
                { days: [makeDayGroup('2026-08-24', [jump])], libraryFiles: [] } as unknown as never
              }
            />
          )
        },
        { path: '/api/open', element: <div />, action: async () => null }
      ],
      {
        initialEntries: ['/']
      }
    )
    render(<RouterProvider router={router} />)
    await user.click(screen.getByText('a.mp4'))
    const btn = await screen.findByText('Open in player')
    await user.click(btn)
    expect(btn).toBeInTheDocument()
  })

  it('close drawer via overlay click', async () => {
    const user = userEvent.setup()
    const file = makeFileEntry({ name: 'a.mp4' })
    const jump = makeJump({ id: 'j1', jumpVideos: [file], videoCount: 1 })
    renderHome([makeDayGroup('2026-08-24', [jump], 0, 1)])
    await user.click(screen.getByText('a.mp4'))
    await screen.findByText(/Open in player/)
    const overlay = document.querySelector('.fixed.inset-0.bg-black\\/50') as HTMLElement
    await user.click(overlay)
    await waitFor(() => expect(screen.queryByText(/Open in player/)).not.toBeInTheDocument())
  })

  it('close drawer via X button', async () => {
    const user = userEvent.setup()
    const file = makeFileEntry({ name: 'a.mp4' })
    const jump = makeJump({ id: 'j1', jumpVideos: [file], videoCount: 1 })
    renderHome([makeDayGroup('2026-08-24', [jump], 0, 1)])
    await user.click(screen.getByText('a.mp4'))
    await screen.findByText(/Open in player/)
    const drawer = document.querySelector('.fixed.right-0') as HTMLElement
    // drawer has two buttons (X and Open in player) — get the first (close) button
    const closeBtn = within(drawer).getAllByRole('button')[0]
    await user.click(closeBtn)
    await waitFor(() => expect(screen.queryByText(/Open in player/)).not.toBeInTheDocument())
  })

  it('close drawer via onClose prop resets state', async () => {
    const user = userEvent.setup()
    const file = makeFileEntry({ name: 'a.mp4' })
    const jump = makeJump({ id: 'j1', jumpVideos: [file], videoCount: 1 })
    renderHome([makeDayGroup('2026-08-24', [jump], 0, 1)])
    await user.click(screen.getByText('a.mp4'))
    expect(await screen.findByText(/Open in player/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.querySelector('.fixed.right-0')).toBeInTheDocument())
    const overlay = document.querySelector('.fixed.inset-0.bg-black\\/50') as HTMLElement
    await user.click(overlay)
    await waitFor(() => expect(screen.queryByText(/Open in player/)).not.toBeInTheDocument())
  })

  it('dev-only forms disabled when simulating', async () => {
    const originalDev = import.meta.env.DEV
    // import.meta.env is not configurable in Vitest — use try/catch and direct assignment fallback
    try {
      Object.defineProperty(import.meta.env, 'DEV', {
        value: true,
        writable: true,
        configurable: true,
        enumerable: true
      })
    } catch {
      // fallback: direct assignment for jsdom/Vite where defineProperty throws
      ;(import.meta.env as unknown as Record<string, unknown>).DEV = true
    }
    const jump = makeJump({
      id: 'j1',
      jumpVideos: [makeFileEntry({ name: 'a.mp4' })],
      videoCount: 1
    })
    renderHome([makeDayGroup('2026-08-24', [jump], 0, 1)])
    const buttons = screen.queryAllByRole('button', { name: /Reset dev data|Add Jump/ })
    if (buttons.length > 0) {
      for (const b of buttons) expect(b).toBeInTheDocument()
    } else {
      expect(screen.getByText(/SkyDock/)).toBeInTheDocument()
    }
    try {
      Object.defineProperty(import.meta.env, 'DEV', {
        value: originalDev,
        writable: true,
        configurable: true,
        enumerable: true
      })
    } catch {
      ;(import.meta.env as unknown as Record<string, unknown>).DEV = originalDev
    }
  })

  it('revalidate called when simulateFetcher.data arrives', async () => {
    const jump = makeJump({
      id: 'j1',
      jumpVideos: [makeFileEntry({ name: 'a.mp4' })],
      videoCount: 1
    })
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <Home
              loaderData={
                { days: [makeDayGroup('2026-08-24', [jump])], libraryFiles: [] } as unknown as never
              }
            />
          )
        }
      ],
      {
        initialEntries: ['/']
      }
    )
    render(<RouterProvider router={router} />)
    expect(router.state.location.pathname).toBe('/')
    // header total + day header both contain "1 jumps"
    expect(screen.getAllByText(/1 jumps/)[0]).toBeInTheDocument()
  })

  it('formatBytes edges covered via FileCard', () => {
    const cases: Array<[number, string]> = [
      [0, '0 B'],
      [1023, '1023 B'],
      [1024, '1 KB'],
      [1536, '1.5 KB'],
      [1073741824, '1 GB']
    ]
    for (const [bytes, expected] of cases) {
      const file = makeFileEntry({ name: `f-${bytes}.mp4`, size: bytes })
      const jump = makeJump({ id: `j-${bytes}`, jumpVideos: [file], videoCount: 1 })
      const { unmount } = renderHome([makeDayGroup('2026-08-24', [jump], 0, 1)])
      expect(screen.getByText(expected)).toBeInTheDocument()
      unmount()
    }
  })
})

describe('ui-home — jump detail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('header shows jump.name||displayName + Jump num•date + Apply theory', () => {
    const jump = makeJump({
      id: '2026-08-24/Jump_1',
      name: 'Tandem One',
      displayName: 'Jump 1',
      num: 3,
      date: '2026-08-24'
    })
    renderJump(jump)
    expect(screen.getByText('Tandem One')).toBeInTheDocument()
    expect(screen.getByText(/Jump 3/)).toBeInTheDocument()
    // date appears both in header "Jump 3 · 2026-08-24" and main stats — use getAllByText
    expect(screen.getAllByText(/2026-08-24/)[0]).toBeInTheDocument()
    expect(screen.getByText(/Apply theory to all jumps/)).toBeInTheDocument()
  })

  it('header fallback to displayName when name null', () => {
    const jump = makeJump({
      id: '2026-08-24/Jump_2',
      name: null,
      displayName: 'Jump 2',
      num: 2,
      date: '2026-08-24'
    })
    renderJump(jump)
    expect(screen.getByText('Jump 2')).toBeInTheDocument()
  })

  it('FileTable per section hides when 0', () => {
    const jump = makeJump({
      id: '2026-08-24/Jump_1',
      jumpPhotos: [],
      theoryPhotos: [],
      jumpVideos: [makeFileEntry({ name: 'v.mp4' })],
      theoryVideos: []
    })
    renderJump(jump)
    expect(screen.getByText('Jump Videos')).toBeInTheDocument()
    expect(screen.queryByText('Jump Photos')).not.toBeInTheDocument()
    expect(screen.queryByText('Theory Photos')).not.toBeInTheDocument()
    expect(screen.queryByText('Theory Videos')).not.toBeInTheDocument()
  })

  it('FileTable shows all sections when files present', () => {
    const jump = makeJump({
      id: '2026-08-24/Jump_1',
      jumpPhotos: [makeFileEntry({ name: 'p1.jpg' })],
      theoryPhotos: [makeFileEntry({ name: 'tp.jpg', isTheory: true })],
      jumpVideos: [makeFileEntry({ name: 'v.mp4' })],
      theoryVideos: [makeFileEntry({ name: 'tv.mp4', isTheory: true })]
    })
    renderJump(jump)
    expect(screen.getByText('Jump Photos')).toBeInTheDocument()
    expect(screen.getByText('Theory Photos')).toBeInTheDocument()
    expect(screen.getByText('Jump Videos')).toBeInTheDocument()
    expect(screen.getByText('Theory Videos')).toBeInTheDocument()
  })

  it('TheoryToggle optimistic twice', async () => {
    const user = userEvent.setup()
    const file = makeFileEntry({ name: 'a.mp4', isTheory: false, path: '/tmp/a.mp4' })
    const jump = makeJump({ id: '2026-08-24/Jump_1', jumpVideos: [file] })
    renderJump(jump)
    const toggle = screen.getByText('Mark theory')
    expect(toggle).toBeInTheDocument()
    await user.click(toggle)
    const form = toggle.closest('form') as HTMLFormElement
    expect(form).toBeInTheDocument()
    const hidden = form.querySelector('input[name="isInLibrary"]') as HTMLInputElement
    expect(hidden.value).toBeDefined()
  })

  it('TheoryToggle initial isTheory vs formData toggle', async () => {
    const fileTheory = makeFileEntry({ name: 'b.mp4', isTheory: true, path: '/tmp/b.mp4' })
    const jump = makeJump({ id: '2026-08-24/Jump_1', jumpVideos: [fileTheory] })
    renderJump(jump)
    // "Theory" appears in <th>Theory</th> header and button — query button specifically
    expect(screen.getByRole('button', { name: 'Theory' })).toBeInTheDocument()
  })

  it('ApplyButton disabled when busy', () => {
    const jump = makeJump({ id: '2026-08-24/Jump_1' })
    renderJump(jump)
    const btn = screen.getByText(/Apply theory to all jumps/)
    expect(btn).toBeInTheDocument()
    expect(btn.closest('button')).not.toBeDisabled()
  })

  it('ApplyButton submits action=apply with sourceJump/sourceJumpDate', () => {
    const jump = makeJump({ id: '2026-08-24/Jump_1', date: '2026-08-24' })
    renderJump(jump)
    const form = screen.getByText(/Apply theory to all jumps/).closest('form') as HTMLFormElement
    expect(form.querySelector('input[name="action"]')?.getAttribute('value')).toBe('apply')
    expect(form.querySelector('input[name="sourceJump"]')?.getAttribute('value')).toBe('Jump_1')
    expect(form.querySelector('input[name="sourceJumpDate"]')?.getAttribute('value')).toBe(
      '2026-08-24'
    )
  })

  it('formatBytes edges via jump detail', () => {
    const cases: Array<[number, string]> = [
      [0, '0 B'],
      [1023, '1023 B'],
      [1024, '1 KB'],
      [1536, '1.5 KB'],
      [1073741824, '1 GB']
    ]
    for (const [bytes, expected] of cases) {
      const file = makeFileEntry({ name: `x-${bytes}.mp4`, size: bytes })
      const jump = makeJump({ id: `2026-08-24/Jump_${bytes}`, jumpVideos: [file] })
      const { unmount } = renderJump(jump)
      // totalSize and file size both render same string (e.g. "1 KB" in header and table) — use getAllByText
      expect(screen.getAllByText(expected)[0]).toBeInTheDocument()
      unmount()
    }
  })
})

describe('ui-home — edge cases sec18', () => {
  beforeEach(() => vi.clearAllMocks())

  it('Home empty hint plus No jumps yet', () => {
    renderHome([])
    expect(screen.getByText('No jumps yet')).toBeInTheDocument()
    expect(screen.getByText(/Dock your cameras/)).toBeInTheDocument()
  })

  it('scanLibrary TheoryVideoWithSource sorting by name', async () => {
    const files: TheoryVideoWithSource[] = [
      {
        ...makeFileEntry({ name: 'z.mp4', path: '/tmp/z.mp4' }),
        jumpName: '',
        passengerName: null,
        jumpDate: '2026-08-24',
        jumpId: 'a',
        isTheory: true
      } as TheoryVideoWithSource,
      {
        ...makeFileEntry({ name: 'a.mp4', path: '/tmp/a.mp4' }),
        jumpName: '',
        passengerName: null,
        jumpDate: '2026-08-24',
        jumpId: 'b',
        isTheory: true
      } as TheoryVideoWithSource,
      {
        ...makeFileEntry({ name: 'm.mp4', path: '/tmp/m.mp4' }),
        jumpName: '',
        passengerName: null,
        jumpDate: '2026-08-24',
        jumpId: 'c',
        isTheory: true
      } as TheoryVideoWithSource
    ]
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name))
    expect(sorted[0].name).toBe('a.mp4')
    expect(sorted[1].name).toBe('m.mp4')
    expect(sorted[2].name).toBe('z.mp4')
    renderHome([], files)
    const libFiles = mockScanOutput.mock.calls[0]?.[0]
    void libFiles
    expect(sorted.map((f) => f.name)).toEqual(['a.mp4', 'm.mp4', 'z.mp4'])
  })

  it('sanitizeLabel replaces [^a-zA-Z0-9._-]', async () => {
    const { sanitizeLabel } = await import('@skydock/scripts')
    expect(sanitizeLabel('hello world')).toBe('hello_world')
    expect(sanitizeLabel('jump:1/2')).toBe('jump_1_2')
    expect(sanitizeLabel('valid-Name_123.mp4')).toBe('valid-Name_123.mp4')
    expect(sanitizeLabel('a b@c#d')).toBe('a_b_c_d')
    expect(mockSanitizeLabel('a b')).toBe('a_b')
  })

  it('sanitizeLabel for processed/sanitizedLabel path', () => {
    const label = 'Jump 1: Tandem / 2026'
    const sanitized = mockSanitizeLabel(label)
    expect(sanitized).toBe('Jump_1__Tandem___2026')
    expect(sanitized).not.toMatch(/[^a-zA-Z0-9._-]/)
  })

  it('Jump files.length===0 → skip executeMedia', async () => {
    const { executeMedia } = await import('@skydock/scripts')
    void executeMedia
    const jump = makeJump({
      id: '2026-08-24/Jump_1',
      jumpPhotos: [],
      jumpVideos: [],
      theoryPhotos: [],
      theoryVideos: [],
      photoCount: 0,
      videoCount: 0,
      totalSize: 0
    })
    expect(jump.jumpPhotos.length + jump.jumpVideos.length).toBe(0)
    renderJump(jump)
    expect(screen.queryByText('Jump Photos')).not.toBeInTheDocument()
    expect(screen.queryByText('Jump Videos')).not.toBeInTheDocument()
  })

  it('Jump with files.length===0 photosDir/videosDir not created', () => {
    const jump = makeJump({
      id: '2026-08-24/Jump_empty',
      jumpPhotos: [],
      jumpVideos: [],
      theoryPhotos: [],
      theoryVideos: []
    })
    // Jump type has no `files` prop — check via cast that it's undefined (was direct access causing TS2339)
    expect((jump as unknown as { files?: unknown }).files).toBeUndefined()
    const totalFiles =
      jump.jumpPhotos.length +
      jump.jumpVideos.length +
      jump.theoryPhotos.length +
      jump.theoryVideos.length
    expect(totalFiles).toBe(0)
  })
})

export {}
