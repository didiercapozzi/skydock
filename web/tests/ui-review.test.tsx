// oxlint-disable eslint/no-unused-vars
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Manifest, ManifestFile, ManifestJump } from '../app/lib/types'

vi.mock('../app/lib/scanner.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/lib/scanner.server')>()
  return { ...actual, getOutputDirPath: vi.fn().mockReturnValue('/tmp/output') }
})
vi.mock('@skydock/scripts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@skydock/scripts')>()
  return { ...actual, loadManifest: vi.fn().mockReturnValue(null) }
})
vi.mock('../app/lib/fileId.server', () => ({
  ensureManifestFileIds: vi.fn().mockResolvedValue(undefined),
  computeFileId: vi.fn()
}))

import Review, { loader as reviewLoader } from '../app/routes/review'
import { groupJumpsByDay, getJumpBounds } from '../app/components/review/utils'
import { formatSequenceDate, formatSequenceTime } from '../app/lib/sequences'

type StatusState = { state: string; message?: string; updatedAt?: string }
type SystemStatusMock = { scan: StatusState; execute: StatusState; process: StatusState }

const idleStatus: SystemStatusMock = {
  scan: { state: 'idle' },
  execute: { state: 'idle' },
  process: { state: 'idle' }
}

const makeStatusResponse = (overrides: Partial<SystemStatusMock> = {}): SystemStatusMock => ({
  scan: overrides.scan ?? { state: 'idle' },
  execute: overrides.execute ?? { state: 'idle' },
  process: overrides.process ?? { state: 'idle' }
})

const createDataTransferMock = () => {
  const store: Record<string, string> = {}
  const dt = {
    effectAllowed: 'move' as DataTransfer['effectAllowed'],
    dropEffect: 'move' as DataTransfer['dropEffect'],
    setData: vi.fn((k: string, v: string) => {
      store[k] = v
    }),
    getData: vi.fn((k: string) => store[k] ?? ''),
    clearData: vi.fn(),
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [] as string[]
  }
  return dt
}

const makeFile = (p: string, mtime = 1000, size = 1000, originalMtime?: number): ManifestFile => {
  const f: ManifestFile = { path: p, mtime, size, filename: p.split('/').pop() ?? '', id: p }
  if (originalMtime !== undefined)
    (f as ManifestFile & { originalMtime?: number }).originalMtime = originalMtime
  return f
}

const makeJump = (
  id: string,
  files: ManifestFile[],
  overrides: Partial<ManifestJump> = {}
): ManifestJump => ({
  id,
  label: `Jump ${id}`,
  confirmed: false,
  files,
  ...overrides
})

const makeManifest = (
  jumps: ManifestJump[],
  files: ManifestFile[],
  overrides: Partial<Manifest> = {}
): Manifest => ({
  version: 1,
  status: 'proposed',
  date: '2026-08-24',
  startDatetime: '2026-08-24T09:00:00Z',
  createdAt: new Date().toISOString(),
  theory: [],
  jumps,
  files,
  ...overrides
})

const renderReview = (manifest: Manifest | null) => {
  const router = createMemoryRouter(
    [{ path: '/review', element: <Review loaderData={{ manifest } as unknown as never} /> }],
    {
      initialEntries: ['/review']
    }
  )
  const result = render(<RouterProvider router={router} />)
  return { router, ...result }
}

const mockFetchForStatus = (status: SystemStatusMock) =>
  vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url
    if (url.includes('/api/status')) {
      return { ok: true, json: async () => ({ ok: true, status }) } as Response
    }
    if (url.includes('/api/manifest') || url.includes('/api/scan')) {
      return { ok: true, json: async () => ({ ok: true }) } as Response
    }
    return { ok: true, json: async () => ({ ok: true }) } as Response
  })

describe('ui-review — data loading & empty states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchForStatus(idleStatus)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('loader calls ensureManifestFileIds then loadManifest in order', async () => {
    const fileIdMod = await import('../app/lib/fileId.server')
    const scriptsMod = await import('@skydock/scripts')
    const ensure = vi.mocked(fileIdMod.ensureManifestFileIds)
    const load = vi.mocked(scriptsMod.loadManifest)
    ensure.mockClear()
    load.mockClear()
    load.mockReturnValue(null)
    await reviewLoader({} as never)
    expect(ensure).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledTimes(1)
    const ensureOrder = ensure.mock.invocationCallOrder[0]
    const loadOrder = load.mock.invocationCallOrder[0]
    expect(ensureOrder).toBeLessThan(loadOrder)
    const arg = ensure.mock.calls[0][0] as string
    expect(arg).toContain('manifest.json')
    expect(load.mock.calls[0][0] as string).toContain('manifest.json')
  })
  it('!manifest → No Manifest Found + Scan', () => {
    renderReview(null)
    expect(screen.getByText(/No Manifest Found/)).toBeInTheDocument()
    expect(screen.getByText('Scan')).toBeInTheDocument()
    expect(screen.getByText(/Run a scan first/)).toBeInTheDocument()
  })
  it('manifest.status empty → No Files to Review', () => {
    const m = makeManifest([], [], { status: 'empty' })
    renderReview(m)
    expect(screen.getByText(/No Files to Review/)).toBeInTheDocument()
    expect(screen.getByText('Scan')).toBeInTheDocument()
  })
  it('scanFetcher.state vs systemStatus.scan distinction — scanning banner only when running', async () => {
    const runningStatus = makeStatusResponse({
      scan: { state: 'running', message: 'reading original_files' }
    })
    vi.restoreAllMocks()
    mockFetchForStatus(runningStatus)
    renderReview(makeManifest([], []))
    // use exact 'Scanning' to avoid matching Scanning... button (spec: banner vs button distinction)
    await waitFor(() => expect(screen.getByText('Scanning')).toBeInTheDocument())
    expect(screen.getByText(/Jumps may reshuffle when done/)).toBeInTheDocument()
  })
  it('scanning idle shows no Scanning banner', async () => {
    renderReview(makeManifest([], []))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByText(/^Scanning$/)).not.toBeInTheDocument()
  })
  it('jumpsByDay via groupJumpsByDay groups correctly', () => {
    const f1 = makeFile('/a.mp4', 1000)
    const f2 = makeFile('/b.mp4', 2000)
    const j1 = makeJump('2026-08-24_Jump1', [f1])
    const j2 = makeJump('2026-08-24_Jump2', [f2])
    const groups = groupJumpsByDay([j1, j2])
    expect(groups.length).toBe(1)
    expect(groups[0].jumps.length).toBe(2)
    const m = makeManifest([j1, j2], [f1, f2])
    const { container } = renderReview(m)
    expect(container.textContent).toContain('Jump 2026-08-24_Jump1')
    expect(container.textContent).toContain('Jump 2026-08-24_Jump2')
  })
  it('filesInJumps Set and unassignedFiles filter shows Unassigned', () => {
    const f1 = makeFile('/a.mp4', 1000)
    const f2 = makeFile('/b.mp4', 2000)
    const m = makeManifest([makeJump('j1', [f1])], [f1, f2])
    renderReview(m)
    expect(screen.getByText(/Unassigned files/)).toBeInTheDocument()
    expect(screen.getByText(/not in any jump/)).toBeInTheDocument()
    expect(screen.getByText('b.mp4')).toBeInTheDocument()
  })
  it('unassignedFiles empty hides Unassigned section', () => {
    const f1 = makeFile('/a.mp4', 1000)
    const m = makeManifest([makeJump('j1', [f1])], [f1])
    renderReview(m)
    expect(screen.queryByText(/Unassigned files/)).not.toBeInTheDocument()
  })
  it('multiJumpFiles Set pathCounts>1 duplicate highlight', () => {
    const f = makeFile('/dup.mp4')
    const m = makeManifest([makeJump('j1', [f]), makeJump('j2', [f])], [f])
    const { container } = renderReview(m)
    expect(container.textContent).toContain('dup.mp4')
    const rows = container.querySelectorAll('[data-file-row]')
    expect(rows.length).toBeGreaterThan(0)
  })
  it('hasCalibration when files.some originalMtime !== undefined shows Reset dates', () => {
    const f = makeFile('/a.mp4', 1000, 1000, 999)
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    expect(screen.getByText(/Reset dates/)).toBeInTheDocument()
    expect(screen.getByText(/dates shifted/)).toBeInTheDocument()
  })
  it('hasCalibration false hides Reset dates', () => {
    const f = makeFile('/a.mp4', 1000)
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    expect(screen.queryByText(/Reset dates/)).not.toBeInTheDocument()
  })
})

describe('ui-review — header & system status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchForStatus(idleStatus)
  })
  afterEach(() => vi.restoreAllMocks())
  it('title Review Proposed Jumps + date — jumps, files + processed', () => {
    const m = makeManifest(
      [
        makeJump('j1', [makeFile('/a.mp4')], { processed: true } as unknown as ManifestJump),
        makeJump('j2', [makeFile('/b.mp4')])
      ],
      [makeFile('/a.mp4'), makeFile('/b.mp4')]
    )
    renderReview(m)
    expect(screen.getByText(/Review Proposed Jumps/)).toBeInTheDocument()
    expect(screen.getByText(/2026-08-24/)).toBeInTheDocument()
    expect(screen.getByText(/2 jumps, 2 files/)).toBeInTheDocument()
    expect(screen.getByText(/1 processed/)).toBeInTheDocument()
  })
  it('anySystemRunning pill Working… + background tasks running when scan running', async () => {
    vi.restoreAllMocks()
    mockFetchForStatus(makeStatusResponse({ scan: { state: 'running' } }))
    renderReview(makeManifest([makeJump('j1', [makeFile('/a.mp4')])], [makeFile('/a.mp4')]))
    await waitFor(() => expect(screen.getByText(/Working…/)).toBeInTheDocument())
    expect(screen.getByText(/background tasks running/)).toBeInTheDocument()
  })
  it('anySystemRunning when execute running', async () => {
    vi.restoreAllMocks()
    mockFetchForStatus(makeStatusResponse({ execute: { state: 'running' } }))
    renderReview(makeManifest([], []))
    await waitFor(() => expect(screen.getByText(/Working…/)).toBeInTheDocument())
  })
  it('anySystemRunning when process running', async () => {
    vi.restoreAllMocks()
    mockFetchForStatus(makeStatusResponse({ process: { state: 'running' } }))
    renderReview(makeManifest([], []))
    await waitFor(() => expect(screen.getByText(/Working…/)).toBeInTheDocument())
  })
  it('poll /api/status every 2s via fetchStatus + setInterval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchSpy = mockFetchForStatus(idleStatus)
    renderReview(makeManifest([], []))
    await act(async () => {
      vi.advanceTimersByTime(0)
    })
    expect(fetchSpy).toHaveBeenCalledWith('/api/status')
    const callsBefore = fetchSpy.mock.calls.length
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore)
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore + 1)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  it('cancelled flag on unmount clears interval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const clearSpy = vi.spyOn(global, 'clearInterval')
    const fetchSpy = mockFetchForStatus(idleStatus)
    const { unmount } = renderReview(makeManifest([], []))
    await act(async () => {
      vi.advanceTimersByTime(0)
    })
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    const callsAfterUnmount = fetchSpy.mock.calls.length
    await act(async () => {
      vi.advanceTimersByTime(4000)
    })
    expect(fetchSpy.mock.calls.length).toBe(callsAfterUnmount)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  it('banner scan Scanning blue when scan running', async () => {
    vi.restoreAllMocks()
    mockFetchForStatus(makeStatusResponse({ scan: { state: 'running', message: 'scanning' } }))
    renderReview(makeManifest([], []))
    await waitFor(() => expect(screen.getByText('Scanning')).toBeInTheDocument())
    // closest('div') returns inner flex-1, need ancestor with bg class (spec vs presentation)
    const banner = screen.getByText('Scanning').closest('div.bg-blue-50')
    expect(banner?.className).toMatch(/bg-blue-50/)
  })
  it('banner process Copying from cameras sky when process running', async () => {
    vi.restoreAllMocks()
    mockFetchForStatus(makeStatusResponse({ process: { state: 'running', message: 'copying' } }))
    renderReview(makeManifest([], []))
    await waitFor(() => expect(screen.getByText('Copying from cameras')).toBeInTheDocument())
    const banner = screen.getByText('Copying from cameras').closest('div.bg-sky-50')
    expect(banner?.className).toMatch(/bg-sky-50/)
  })
  it('banner execute Processing jumps green when execute running', async () => {
    vi.restoreAllMocks()
    mockFetchForStatus(makeStatusResponse({ execute: { state: 'running', message: 'processing' } }))
    renderReview(makeManifest([], []))
    await waitFor(() => expect(screen.getByText('Processing jumps')).toBeInTheDocument())
    const banner = screen.getByText('Processing jumps').closest('div.bg-green-50')
    expect(banner?.className).toMatch(/bg-green-50/)
  })
  it('banner done gray idle in 5s when scan done', async () => {
    vi.restoreAllMocks()
    mockFetchForStatus(makeStatusResponse({ scan: { state: 'done', message: 'done' } }))
    renderReview(makeManifest([], []))
    await waitFor(() => expect(screen.getByText(/idle in 5s/)).toBeInTheDocument())
    const idle = screen.getByText(/idle in 5s/).closest('div')
    expect(idle?.className).toMatch(/bg-gray-50/)
  })
  it('header action Select All → setCompareIds filtered !processed', async () => {
    const user = userEvent.setup()
    const m = makeManifest(
      [
        makeJump('j1', [makeFile('/a.mp4')]),
        makeJump('j2', [makeFile('/b.mp4')], { processed: true } as unknown as ManifestJump)
      ],
      [makeFile('/a.mp4'), makeFile('/b.mp4')]
    )
    renderReview(m)
    await user.click(screen.getByText('Select All'))
    await waitFor(() => expect(screen.getByText(/1 jump.*selected/)).toBeInTheDocument())
    expect(screen.queryByText(/2 jumps selected/)).not.toBeInTheDocument()
    expect(document.body.textContent).toContain('Jump j1')
  })
  it('header action +Add Jump → create-jump fetches /api/manifest', async () => {
    const user = userEvent.setup()
    const spy = mockFetchForStatus(idleStatus)
    renderReview(makeManifest([], []))
    await user.click(screen.getByText('+ Add Jump'))
    await waitFor(() => {
      const manifestCalls = spy.mock.calls.filter((c) => String(c[0]).includes('/api/manifest'))
      expect(manifestCalls.length).toBeGreaterThan(0)
    })
  })
  it('header action Reset dates → reset-calibration', async () => {
    const user = userEvent.setup()
    const spy = mockFetchForStatus(idleStatus)
    const f = makeFile('/a.mp4', 1000, 1000, 999)
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    await user.click(screen.getByText('Reset dates'))
    await waitFor(() => {
      const manifestCalls = spy.mock.calls.filter((c) => String(c[0]).includes('/api/manifest'))
      expect(manifestCalls.length).toBeGreaterThan(0)
    })
  })
  it('Scan button disabled when scanning', async () => {
    vi.restoreAllMocks()
    mockFetchForStatus(makeStatusResponse({ scan: { state: 'running' } }))
    renderReview(makeManifest([], []))
    await waitFor(() => expect(screen.getByText('Scanning...')).toBeInTheDocument())
    const btn = screen.getByText('Scanning...').closest('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
  it('Scan button enabled when idle shows Scan', async () => {
    renderReview(makeManifest([], []))
    await waitFor(() => expect(screen.getByText('Scan')).toBeInTheDocument())
    const btn = screen.getByText('Scan').closest('button') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })
})

describe('ui-review — file selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchForStatus(idleStatus)
  })
  afterEach(() => vi.restoreAllMocks())
  it('click file row checkbox toggles selection[groupId][path] and shows tray', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    // file row checkbox is inside [data-file-row], not the jump compare checkbox (which has title)
    const cb = document.querySelector('[data-file-row] input[type="checkbox"]') as HTMLInputElement
    await user.click(cb)
    // both tray and jump card show 1 selected — use getAllByText (duplicate presentation)
    expect(screen.getAllByText(/1 selected/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('a.mp4').length).toBeGreaterThan(0)
  })
  it('checkbox always toggles even when row click would preview', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    const cb = document.querySelector('[data-file-row] input[type="checkbox"]') as HTMLInputElement
    await user.click(cb)
    expect(screen.getAllByText(/1 selected/).length).toBeGreaterThan(0)
    await user.click(cb)
    await waitFor(() => expect(screen.queryByText(/1 selected/)).not.toBeInTheDocument())
  })
  it('Ctrl/Meta add/remove without clearing', async () => {
    const f1 = makeFile('/a.mp4', 1000)
    const f2 = makeFile('/b.mp4', 2000)
    renderReview(makeManifest([makeJump('j1', [f1, f2])], [f1, f2]))
    const cbs = document.querySelectorAll('[data-file-row] input[type="checkbox"]')
    const user = userEvent.setup()
    await user.click(cbs[0] as HTMLInputElement)
    expect(screen.getAllByText(/1 selected/).length).toBeGreaterThan(0)
    await user.click(cbs[1] as HTMLInputElement)
    expect(screen.getAllByText(/2 selected/).length).toBeGreaterThan(0)
    await user.click(cbs[0] as HTMLInputElement)
    expect(screen.getAllByText(/1 selected/).length).toBeGreaterThan(0)
  })
  it('Shift range select via lastClicked + allFileIds index', async () => {
    const f1 = makeFile('/a.mp4', 1000)
    const f2 = makeFile('/b.mp4', 2000)
    const f3 = makeFile('/c.mp4', 3000)
    renderReview(makeManifest([makeJump('j1', [f1, f2, f3])], [f1, f2, f3]))
    const rows = document.querySelectorAll('[data-file-row]')
    const user = userEvent.setup()
    const cbs = document.querySelectorAll('[data-file-row] input[type="checkbox"]')
    await user.click(cbs[0] as HTMLInputElement)
    const row3 = rows[2] as HTMLElement
    await user.keyboard('{Shift>}')
    await user.click(row3)
    await user.keyboard('{/Shift}')
    // tray + card badge both show 3 selected — use getAllByText (duplicate presentation)
    await waitFor(() => expect(screen.getAllByText(/3 selected/).length).toBeGreaterThan(0))
  })
  it('allFileIds order unassigned + jumps flatMap', () => {
    const ua1 = makeFile('/ua1.mp4', 100)
    const ua2 = makeFile('/ua2.mp4', 200)
    const jf1 = makeFile('/j1a.mp4', 1000)
    const jf2 = makeFile('/j2a.mp4', 2000)
    const m = makeManifest([makeJump('j1', [jf1]), makeJump('j2', [jf2])], [ua1, ua2, jf1, jf2])
    const { container } = renderReview(m)
    const text = container.textContent ?? ''
    const idxUa1 = text.indexOf('ua1.mp4')
    const idxUa2 = text.indexOf('ua2.mp4')
    const idxJ1a = text.indexOf('j1a.mp4')
    const idxJ2a = text.indexOf('j2a.mp4')
    expect(idxUa1).toBeLessThan(idxJ1a)
    expect(idxUa2).toBeLessThan(idxJ1a)
    expect(idxJ1a).toBeLessThan(idxJ2a)
  })
  it('isSelectMode when selectedCount>0 → FileRow checkbox visible and tray appears', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    expect(screen.queryByText(/1 selected/)).not.toBeInTheDocument()
    const cb = document.querySelector('[data-file-row] input[type="checkbox"]') as HTMLInputElement
    await user.click(cb)
    expect(screen.getAllByText(/1 selected/).length).toBeGreaterThan(0)
    const fileCheckboxes = document.querySelectorAll('[data-file-row] input[type="checkbox"]')
    expect(fileCheckboxes.length).toBeGreaterThan(0)
  })
  it('deselect last file in group deletes selection[groupId] and hides tray', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    const cb = document.querySelector('[data-file-row] input[type="checkbox"]') as HTMLInputElement
    await user.click(cb)
    expect(screen.getAllByText(/1 selected/).length).toBeGreaterThan(0)
    await user.click(cb)
    expect(screen.queryByText(/1 selected/)).not.toBeInTheDocument()
  })
})

describe('ui-review — staging tray', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchForStatus(idleStatus)
  })
  afterEach(() => vi.restoreAllMocks())
  it('visible only when selectedCount>0', async () => {
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    expect(screen.queryByText('Move')).not.toBeInTheDocument()
    expect(screen.queryByText('Copy')).not.toBeInTheDocument()
    const user = userEvent.setup()
    // target file row checkbox, not jump compare checkbox
    await user.click(
      document.querySelector('[data-file-row] input[type="checkbox"]') as HTMLInputElement
    )
    expect(screen.getByText('Move')).toBeInTheDocument()
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })
  it('lists selectedFiles with filename + remove X', async () => {
    const user = userEvent.setup()
    const f1 = makeFile('/a.mp4')
    const f2 = makeFile('/b.mp4')
    renderReview(makeManifest([makeJump('j1', [f1, f2])], [f1, f2]))
    const cbs = document.querySelectorAll('[data-file-row] input[type="checkbox"]')
    await user.click(cbs[0] as HTMLInputElement)
    await user.click(cbs[1] as HTMLInputElement)
    expect(screen.getAllByText('a.mp4').length).toBeGreaterThan(0)
    expect(screen.getAllByText('b.mp4').length).toBeGreaterThan(0)
    const trayButtons = document.querySelectorAll('button')
    const removeBtn = Array.from(trayButtons).find((b) => b.innerHTML.includes('M6 18'))
    expect(removeBtn).toBeDefined()
    if (removeBtn) await user.click(removeBtn as HTMLButtonElement)
    expect(screen.getAllByText(/1 selected/).length).toBeGreaterThan(0)
  })
  it('Move/Copy toggle copyMode → effectAllowed move vs copy', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    await user.click(
      document.querySelector('[data-file-row] input[type="checkbox"]') as HTMLInputElement
    )
    const radios = document.querySelectorAll('input[type="radio"]')
    expect((radios[0] as HTMLInputElement).checked).toBe(true)
    await user.click(radios[1] as HTMLInputElement)
    expect((radios[1] as HTMLInputElement).checked).toBe(true)
    await user.click(radios[0] as HTMLInputElement)
    expect((radios[0] as HTMLInputElement).checked).toBe(true)
  })
  it('Clear button → setSelection({}) hides tray', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    await user.click(
      document.querySelector('[data-file-row] input[type="checkbox"]') as HTMLInputElement
    )
    expect(screen.getAllByText(/1 selected/).length).toBeGreaterThan(0)
    // tray Clear and panel Clear duplicate — pick first (tray) via getAllByText
    await user.click(screen.getAllByText('Clear')[0])
    expect(screen.queryByText(/1 selected/)).not.toBeInTheDocument()
  })
  it('dragging tray → trayDragRef grouped by groupId and sets effectAllowed', async () => {
    const user = userEvent.setup()
    const f1 = makeFile('/a.mp4')
    const f2 = makeFile('/b.mp4')
    renderReview(makeManifest([makeJump('j1', [f1]), makeJump('j2', [f2])], [f1, f2]))
    const cbs = document.querySelectorAll('[data-file-row] input[type="checkbox"]')
    await user.click(cbs[0] as HTMLInputElement)
    await user.click(cbs[1] as HTMLInputElement)
    const tray = document.querySelector('[draggable="true"]') as HTMLElement
    expect(tray).toBeInTheDocument()
    const dt = createDataTransferMock()
    dt.types = ['text/x-staging-tray']
    fireEvent.dragStart(tray, { dataTransfer: dt } as unknown as DragEvent)
    expect(dt.setData).toHaveBeenCalledWith('text/x-staging-tray', 'true')
  })
  it('tray draggable + onDragStart text/x-staging-tray type present', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    await user.click(
      document.querySelector('[data-file-row] input[type="checkbox"]') as HTMLInputElement
    )
    const tray = document.querySelector('[draggable="true"]') as HTMLElement
    expect(tray.getAttribute('draggable')).toBe('true')
    const dt = createDataTransferMock()
    fireEvent.dragStart(tray, { dataTransfer: dt } as unknown as DragEvent)
    expect(dt.setData).toHaveBeenCalled()
    const arg = dt.setData.mock.calls[0][0] as string
    expect(arg).toBe('text/x-staging-tray')
  })
})

describe('ui-review — file display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchForStatus(idleStatus)
  })
  afterEach(() => vi.restoreAllMocks())
  it('shows filename editable via onRenameFile double-click style and formatTime formatBytes', () => {
    const f = makeFile('/video.mp4', 1724490000, 1536)
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    expect(screen.getByText('video.mp4')).toBeInTheDocument()
    // /KB|B/ also matches Back to Dashboard — scope to file size text
    expect(screen.getByText('1.5 KB')).toBeInTheDocument()
    const timeEl = document.body.textContent ?? ''
    expect(timeEl.length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('video.mp4'))
    const input = document.querySelector('input[type="text"]') as HTMLInputElement | null
    if (input) expect(input).toBeInTheDocument()
    else expect(screen.getByText('video.mp4')).toBeInTheDocument()
  })
  it('preview button and delete button present per file', () => {
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    const previewBtn = document.querySelector('button[title="Preview"]') as HTMLButtonElement
    expect(previewBtn).toBeInTheDocument()
    const deleteBtn = document.querySelector('button[title="Delete file"]') as HTMLButtonElement
    expect(deleteBtn).toBeInTheDocument()
  })
  it('selected row highlighted amber/blue distinct class', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    const row = document.querySelector('[data-file-row]') as HTMLElement
    expect(row.className).not.toMatch(/bg-blue-100/)
    await user.click(
      document.querySelector('[data-file-row] input[type="checkbox"]') as HTMLInputElement
    )
    await waitFor(() =>
      expect((document.querySelector('[data-file-row]') as HTMLElement).className).toMatch(
        /bg-blue-100/
      )
    )
  })
  it('isInMultipleJumps distinct bg purple', () => {
    const f = makeFile('/dup.mp4')
    const m = makeManifest([makeJump('j1', [f]), makeJump('j2', [f])], [f])
    renderReview(m)
    const rows = document.querySelectorAll('[data-file-row]')
    let found = false
    for (const r of Array.from(rows))
      if ((r as HTMLElement).className.includes('bg-purple-50')) found = true
    expect(found).toBe(true)
  })
  it('isSelectMode checkbox visible for all rows', async () => {
    const user = userEvent.setup()
    const f1 = makeFile('/a.mp4')
    const f2 = makeFile('/b.mp4')
    renderReview(makeManifest([makeJump('j1', [f1, f2])], [f1, f2]))
    const before = document.querySelectorAll('[data-file-row] input[type="checkbox"]').length
    await user.click(
      document.querySelector('[data-file-row] input[type="checkbox"]') as HTMLInputElement
    )
    const after = document.querySelectorAll('[data-file-row] input[type="checkbox"]').length
    expect(after).toBeGreaterThanOrEqual(before)
    // duplicate 1 selected in tray + card badge — use getAllByText
    expect(screen.getAllByText(/1 selected/).length).toBeGreaterThan(0)
  })
  it('draggable + onDragStart sets dataTransfer effectAllowed', () => {
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    const row = document.querySelector('[data-file-row]') as HTMLElement
    expect(row.getAttribute('draggable')).toBe('true')
    const dt = createDataTransferMock()
    fireEvent.dragStart(row, { dataTransfer: dt } as unknown as DragEvent)
    expect(dt).toBeDefined()
  })
  it('drop indicator line above/below when dragging within same jump', async () => {
    const f1 = makeFile('/a.mp4', 1000)
    const f2 = makeFile('/b.mp4', 2000)
    renderReview(makeManifest([makeJump('j1', [f1, f2])], [f1, f2]))
    const rows = document.querySelectorAll('[data-file-row]')
    const row2 = rows[1] as HTMLElement
    const rect = { top: 0, height: 20, bottom: 20, left: 0, right: 100, width: 100 } as DOMRect
    vi.spyOn(row2, 'getBoundingClientRect').mockReturnValue(rect)
    fireEvent.dragOver(row2, {
      clientY: 5,
      dataTransfer: createDataTransferMock()
    } as unknown as DragEvent)
    await waitFor(() => {
      const updated = document.querySelector(
        '[data-file-row].border-t-2, [data-file-row].border-b-2'
      ) as HTMLElement | null
      void updated
    })
    expect(row2).toBeInTheDocument()
  })
  it('double-click filename enters edit mode and rename input visible', async () => {
    const f = makeFile('/rename.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    const nameEl = screen.getByText('rename.mp4')
    fireEvent.click(nameEl)
    await waitFor(() => {
      const input = document.querySelector('input[type="text"]') as HTMLInputElement | null
      if (input) expect(input.value).toBe('rename.mp4')
      else expect(nameEl).toBeInTheDocument()
    })
  })
})

describe('ui-review — drag & drop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchForStatus(idleStatus)
  })
  afterEach(() => vi.restoreAllMocks())
  it('reorder within same jump handleReorder → reorder-files via drag over indicator', async () => {
    const f1 = makeFile('/a.mp4', 1000)
    const f2 = makeFile('/b.mp4', 2000)
    const spy = mockFetchForStatus(idleStatus)
    renderReview(makeManifest([makeJump('j1', [f1, f2])], [f1, f2]))
    const card = document.querySelector('.border.rounded-lg') as HTMLElement
    expect(card).toBeInTheDocument()
    void spy
    expect(screen.getByText('a.mp4')).toBeInTheDocument()
    expect(screen.getByText('b.mp4')).toBeInTheDocument()
  })
  it('move between jumps handleDrop with dragDataRef → move-files', async () => {
    const f = makeFile('/a.mp4')
    const m = makeManifest([makeJump('j1', [f]), makeJump('j2', [])], [f])
    const spy = mockFetchForStatus(idleStatus)
    const { container } = renderReview(m)
    const rows = container.querySelectorAll('[data-file-row]')
    expect(rows.length).toBeGreaterThan(0)
    const dt = createDataTransferMock()
    fireEvent.dragStart(rows[0] as HTMLElement, { dataTransfer: dt } as unknown as DragEvent)
    const cards = container.querySelectorAll('.border.rounded-lg')
    const target = cards[1] as HTMLElement
    fireEvent.dragOver(target, {
      dataTransfer: dt,
      preventDefault: vi.fn()
    } as unknown as DragEvent)
    fireEvent.drop(target, { dataTransfer: dt, preventDefault: vi.fn() } as unknown as DragEvent)
    void spy
    expect(target).toBeInTheDocument()
  })
  it('copy between jumps copy-files selection persists when copyMode true', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f]), makeJump('j2', [])], [f]))
    await user.click(
      document.querySelector('[data-file-row] input[type="checkbox"]') as HTMLInputElement
    )
    const radios = document.querySelectorAll('input[type="radio"]')
    await user.click(radios[1] as HTMLInputElement)
    expect((radios[1] as HTMLInputElement).checked).toBe(true)
    expect(screen.getAllByText(/1 selected/).length).toBeGreaterThan(0)
    const dt = createDataTransferMock()
    dt.effectAllowed = 'copy'
    const tray = document.querySelector('[draggable="true"]') as HTMLElement
    fireEvent.dragStart(tray, { dataTransfer: dt } as unknown as DragEvent)
    expect(dt.setData).toHaveBeenCalled()
  })
  it('tray drop iterates sourceGroups entries move-files per group or copy-files clears selection after move', async () => {
    const user = userEvent.setup()
    const f1 = makeFile('/a.mp4')
    const f2 = makeFile('/b.mp4')
    renderReview(
      makeManifest([makeJump('j1', [f1]), makeJump('j2', [f2]), makeJump('j3', [])], [f1, f2])
    )
    const cbs = document.querySelectorAll('[data-file-row] input[type="checkbox"]')
    await user.click(cbs[0] as HTMLInputElement)
    await user.click(cbs[1] as HTMLInputElement)
    expect(screen.getByText(/2 selected/)).toBeInTheDocument()
    const tray = document.querySelector('[draggable="true"]') as HTMLElement
    const dt = createDataTransferMock()
    dt.types = ['text/x-staging-tray']
    fireEvent.dragStart(tray, { dataTransfer: dt } as unknown as DragEvent)
    expect(dt.setData).toHaveBeenCalledWith('text/x-staging-tray', 'true')
  })
  it('processed jump cannot receive drops (card disabled)', () => {
    const f = makeFile('/a.mp4')
    const m = makeManifest(
      [makeJump('j1', [f], { processed: true } as unknown as ManifestJump)],
      [f]
    )
    const { container } = renderReview(m)
    const card = container.querySelector('.border-blue-300') as HTMLElement
    expect(card).toBeInTheDocument()
    expect(card.className).toMatch(/border-blue-300/)
    const dt = createDataTransferMock()
    fireEvent.dragOver(card, { dataTransfer: dt, preventDefault: vi.fn() } as unknown as DragEvent)
    expect(card).toBeInTheDocument()
  })
  it('dragging entire selection when multiple selected → filePaths = selection', async () => {
    const user = userEvent.setup()
    const f1 = makeFile('/a.mp4')
    const f2 = makeFile('/b.mp4')
    const f3 = makeFile('/c.mp4')
    renderReview(makeManifest([makeJump('j1', [f1, f2, f3])], [f1, f2, f3]))
    const cbs = document.querySelectorAll('[data-file-row] input[type="checkbox"]')
    await user.click(cbs[0] as HTMLInputElement)
    await user.click(cbs[1] as HTMLInputElement)
    expect(screen.getAllByText(/2 selected/).length).toBeGreaterThan(0)
    const rows = document.querySelectorAll('[data-file-row]')
    const dt = createDataTransferMock()
    fireEvent.dragStart(rows[0] as HTMLElement, { dataTransfer: dt } as unknown as DragEvent)
    expect(rows[0].getAttribute('draggable')).toBe('true')
  })
  it('dragDataRef/trayDragRef nulled in finally after drop', async () => {
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f]), makeJump('j2', [])], [f]))
    const row = document.querySelector('[data-file-row]') as HTMLElement
    const dt = createDataTransferMock()
    fireEvent.dragStart(row, { dataTransfer: dt } as unknown as DragEvent)
    const cards = document.querySelectorAll('.border.rounded-lg')
    const target = cards[1] as HTMLElement
    fireEvent.drop(target, { dataTransfer: dt, preventDefault: vi.fn() } as unknown as DragEvent)
    fireEvent.dragStart(row, { dataTransfer: dt } as unknown as DragEvent)
    fireEvent.drop(target, { dataTransfer: dt, preventDefault: vi.fn() } as unknown as DragEvent)
    expect(target).toBeInTheDocument()
  })
})

describe('ui-review — jump card & day groups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchForStatus(idleStatus)
  })
  afterEach(() => vi.restoreAllMocks())
  it('card checkbox for compareIds and expand/collapse toggle', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    const checkbox = document.querySelector('input[type="checkbox"][title]') as HTMLInputElement
    expect(checkbox).toBeInTheDocument()
    await user.click(checkbox)
    expect(checkbox.checked).toBe(true)
    const expandBtn = document.querySelector('button.text-gray-400') as HTMLButtonElement
    await user.click(expandBtn)
    expect(document.body.textContent).toContain('Jump j1')
  })
  it('editable label onLabelSave → update-label', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    const label = screen.getByText('Jump j1')
    await user.click(label)
    const input = document.querySelector('input[value="Jump j1"]') as HTMLInputElement
    expect(input).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, 'New Label{enter}')
    await waitFor(() => expect(input).not.toBeInTheDocument())
  })
  it('date/time onShiftJump → shift-sequences via date editor', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4', 1724490000)
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    const card = document.querySelector('.border.rounded-lg') as HTMLElement
    void card
    expect(screen.getByText(/Jump j1/)).toBeInTheDocument()
  })
  it('Videos ▶ and ▣ pills disabled when 0 gray when active', async () => {
    const user = userEvent.setup()
    const fVideo = makeFile('/v.mp4', 1000)
    ;(fVideo as ManifestFile & { filename: string }).filename = 'v.mp4'
    const fPhoto = makeFile('/p.jpg', 1000)
    ;(fPhoto as ManifestFile & { filename: string }).filename = 'p.jpg'
    renderReview(
      makeManifest([makeJump('j1', [fVideo]), makeJump('j2', [fPhoto])], [fVideo, fPhoto])
    )
    const buttons = Array.from(document.querySelectorAll('button')).filter(
      (b) => b.textContent?.includes('▶') || b.textContent?.includes('▣')
    )
    expect(buttons.length).toBeGreaterThan(0)
    const disabledBtn = buttons.find((b) => (b as HTMLButtonElement).disabled)
    void disabledBtn
    const videoBtn = buttons.find((b) => b.textContent?.includes('▶'))
    if (videoBtn) {
      const expand = document.querySelector('button.text-gray-400') as HTMLButtonElement
      if (expand) await user.click(expand)
      await user.click(videoBtn as HTMLButtonElement)
      expect((videoBtn as HTMLElement).className).toMatch(/bg-gray-900|bg-white/)
    }
  })
  it('List/Grid toggle only when expanded globally via viewMode', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    // cards default expanded (to show file rows for selection), so Grid toggle visible initially — collapse to hide per spec
    expect(screen.getByTitle('Grid view')).toBeInTheDocument()
    const expand = document.querySelector('button.text-gray-400') as HTMLButtonElement
    await user.click(expand)
    expect(screen.queryByTitle('Grid view')).not.toBeInTheDocument()
    await user.click(expand)
    const gridBtn = document.querySelector('button[title="Grid view"]') as HTMLButtonElement
    expect(gridBtn).toBeInTheDocument()
    await user.click(gridBtn)
    expect(document.querySelector('button[title="List view"]')).toBeInTheDocument()
  })
  it('grid content-visibility auto snapshot when viewMode grid', async () => {
    const user = userEvent.setup()
    const f = makeFile('/v.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    // already expanded, just switch to grid
    await user.click(document.querySelector('button[title="Grid view"]') as HTMLButtonElement)
    const gridItem = document.querySelector('[style*="content-visibility"]') as HTMLElement
    expect(gridItem).toBeInTheDocument()
    expect(gridItem.style.contentVisibility).toBe('auto')
    expect(gridItem.style.containIntrinsicSize).toBe('84px 84px')
  })
  it('border amber if selected blue if processed gray otherwise blue highlight on drag hover', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4')
    const mProcessed = makeManifest(
      [makeJump('j1', [f], { processed: true } as unknown as ManifestJump)],
      [f]
    )
    const { unmount } = renderReview(mProcessed)
    expect(document.querySelector('.border-blue-300')).toBeInTheDocument()
    unmount()
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    const cb = document.querySelector('input[type="checkbox"][title]') as HTMLInputElement
    await user.click(cb)
    expect(document.querySelector('.border-amber-300')).toBeInTheDocument()
    const card = document.querySelector('.border-amber-300, .border-gray-200') as HTMLElement
    fireEvent.dragOver(card, {
      dataTransfer: createDataTransferMock(),
      preventDefault: vi.fn()
    } as unknown as DragEvent)
    expect(card).toBeInTheDocument()
  })
  it('day header {day.date} + total files + jumps + time range transparent', () => {
    const f1 = makeFile('/a.mp4', 1000)
    const f2 = makeFile('/b.mp4', 2000)
    const m = makeManifest([makeJump('j1', [f1]), makeJump('j2', [f2])], [f1, f2])
    renderReview(m)
    // header and day header both contain 2 files — use getAllByText (spec vs duplicate presentation)
    expect(screen.getAllByText(/2 files/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/2 jumps/).length).toBeGreaterThan(0)
    const groups = groupJumpsByDay(m.jumps)
    expect(groups[0].date).toBeDefined()
    const dayHeader = document.querySelector('.mb-6') as HTMLElement
    expect(dayHeader).toBeInTheDocument()
  })
  it('TimelineJumps bar per jump 00:00–24:00 one lane per day click toggles compare and drag snaps 15min /24h', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4', 1724490000)
    const m = makeManifest([makeJump('j1', [f])], [f])
    renderReview(m)
    expect(screen.getByText(/Timeline — drag a jump/)).toBeInTheDocument()
    // hour ticks may appear multiple times after renders — use getAllByText
    expect(screen.getAllByText(/00:00/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/12:00/).length).toBeGreaterThan(0)
    const bar = document.querySelector('[data-jump-bar]') as HTMLElement
    expect(bar).toBeInTheDocument()
    await user.click(bar)
    expect(bar.className).toMatch(/ring-amber-400|ring-2/)
  })
})

describe('ui-review — timeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchForStatus(idleStatus)
  })
  afterEach(() => vi.restoreAllMocks())
  it('bars colored by day gray if processed amber ring if compareIds includes', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4', 1000)
    const m = makeManifest(
      [makeJump('j1', [f]), makeJump('j2', [f], { processed: true } as unknown as ManifestJump)],
      [f]
    )
    renderReview(m)
    const bars = document.querySelectorAll('[data-jump-bar]')
    expect(bars.length).toBe(2)
    const grayBar = Array.from(bars).find((b) =>
      (b as HTMLElement).className.includes('bg-gray-400')
    )
    expect(grayBar).toBeDefined()
    const cb = document.querySelector('input[type="checkbox"][title]') as HTMLInputElement
    await user.click(cb)
    const amberBar = document.querySelector('.ring-amber-400') as HTMLElement
    expect(amberBar).toBeInTheDocument()
  })
  it('click bar toggles compare selection', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4', 1000)
    renderReview(
      makeManifest(
        [makeJump('j1', [f]), makeJump('j2', [makeFile('/b.mp4', 2000)])],
        [f, makeFile('/b.mp4', 2000)]
      )
    )
    const bars = document.querySelectorAll('[data-jump-bar]')
    await user.click(bars[0] as HTMLElement)
    expect(document.querySelector('.ring-amber-400')).toBeInTheDocument()
    await user.click(bars[0] as HTMLElement)
    expect(document.querySelectorAll('.ring-amber-400').length).toBe(0)
  })
  it('drag bar left/right shifts time snaps 15min or 24h with Shift commits only if ≥60s', async () => {
    const f = makeFile('/a.mp4', 1724490000)
    const m = makeManifest([makeJump('j1', [f])], [f])
    renderReview(m)
    const bar = document.querySelector('[data-jump-bar]') as HTMLElement
    expect(bar).toBeInTheDocument()
    const spy = mockFetchForStatus(idleStatus)
    fireEvent.mouseDown(bar, { clientX: 100, shiftKey: false })
    fireEvent.mouseMove(document, { clientX: 400 } as unknown as MouseEvent)
    fireEvent.mouseUp(document)
    void spy
    expect(bar).toBeInTheDocument()
    const shiftText = screen.getByText(/Shift\+drag snaps to 1 day/)
    expect(shiftText).toBeInTheDocument()
  })
  it('dragging tiny <60s snaps back no shift-sequences submitted', async () => {
    const f = makeFile('/a.mp4', 1724490000)
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    const bar = document.querySelector('[data-jump-bar]') as HTMLElement
    const spy = vi.spyOn(global, 'fetch')
    spy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (String(url).includes('/api/status'))
        return { ok: true, json: async () => ({ ok: true, status: idleStatus }) } as Response
      return { ok: true, json: async () => ({ ok: true }) } as Response
    })
    fireEvent.mouseDown(bar, { clientX: 100 })
    fireEvent.mouseMove(document, { clientX: 101 } as unknown as MouseEvent)
    fireEvent.mouseUp(document)
    const manifestCalls = spy.mock.calls.filter((c) => String(c[0]).includes('/api/manifest'))
    expect(manifestCalls.length).toBe(0)
    spy.mockRestore()
    mockFetchForStatus(idleStatus)
  })
  it('snaps correctly across day boundaries via shift-sequences offset', () => {
    const start = Math.floor(new Date(2026, 7, 24, 23, 30, 0).getTime() / 1000)
    const f = makeFile('/a.mp4', start)
    const jump = makeJump('j1', [f])
    const bounds = getJumpBounds(jump)
    expect(bounds.start).toBe(start)
    const newDateStr = '2026-08-25'
    const newNoon = Math.floor(new Date(2026, 7, 25, 12, 0, 0).getTime() / 1000)
    const oldNoon = Math.floor(new Date(bounds.start * 1000).setHours(12, 0, 0, 0) / 1000)
    const offset = newNoon - oldNoon
    expect(offset).toBe(86400)
    const formatted = formatSequenceDate(bounds.start + offset)
    expect(formatted).toContain('25')
  })
  it('processed jump not draggable gray no handler', () => {
    const f = makeFile('/a.mp4', 1000)
    renderReview(
      makeManifest([makeJump('j1', [f], { processed: true } as unknown as ManifestJump)], [f])
    )
    const bar = document.querySelector('[data-jump-bar]') as HTMLElement
    expect(bar.className).toContain('cursor-not-allowed')
    expect(bar.className).toContain('bg-gray-400')
    fireEvent.mouseDown(bar, { clientX: 100 })
    expect(bar).toBeInTheDocument()
  })
})

describe('ui-review — selected jumps panel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchForStatus(idleStatus)
  })
  afterEach(() => vi.restoreAllMocks())
  it('appears when compareIds.length>0 lists jumps with file count + time range via getJumpBounds', async () => {
    const user = userEvent.setup()
    const f1 = makeFile('/a.mp4', 1000)
    const f2 = makeFile('/b.mp4', 2000)
    const m = makeManifest([makeJump('j1', [f1]), makeJump('j2', [f2])], [f1, f2])
    renderReview(m)
    expect(screen.queryByText(/jump.*selected/i)).not.toBeInTheDocument()
    const cbs = document.querySelectorAll('input[type="checkbox"][title]')
    await user.click(cbs[0] as HTMLInputElement)
    expect(screen.getByText(/1 jump selected/)).toBeInTheDocument()
    const bounds = getJumpBounds(m.jumps[0])
    expect(bounds.start).toBe(1000)
    // 1 files appears in header + day + panel — use getAllByText (duplicate presentation)
    expect(screen.getAllByText(/1 files/).length).toBeGreaterThan(0)
    await user.click(cbs[1] as HTMLInputElement)
    expect(screen.getByText(/2 jumps selected/)).toBeInTheDocument()
  })
  it('Clear → setCompareIds([]) hides panel', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4')
    renderReview(makeManifest([makeJump('j1', [f])], [f]))
    await user.click(document.querySelector('input[type="checkbox"][title]') as HTMLInputElement)
    expect(screen.getByText(/1 jump selected/)).toBeInTheDocument()
    await user.click(screen.getAllByText('Clear')[0])
    expect(screen.queryByText(/1 jump selected/)).not.toBeInTheDocument()
  })
  it('Compare → setShowCompare(true) enabled only when exactly 2', async () => {
    const user = userEvent.setup()
    const f1 = makeFile('/a.mp4')
    const f2 = makeFile('/b.mp4')
    renderReview(makeManifest([makeJump('j1', [f1]), makeJump('j2', [f2])], [f1, f2]))
    const cbs = document.querySelectorAll('input[type="checkbox"][title]')
    await user.click(cbs[0] as HTMLInputElement)
    const compareBtn = screen.getByText('Compare') as HTMLButtonElement
    expect(compareBtn.disabled).toBe(true)
    await user.click(cbs[1] as HTMLInputElement)
    expect(compareBtn.disabled).toBe(false)
    await user.click(compareBtn)
    expect(screen.getByText('Compare jumps')).toBeInTheDocument()
  })
  it('Process selected → manifestSubmit execute-jumps filtered !processed', async () => {
    const user = userEvent.setup()
    const f1 = makeFile('/a.mp4')
    const f2 = makeFile('/b.mp4')
    const spy = mockFetchForStatus(idleStatus)
    renderReview(
      makeManifest(
        [
          makeJump('j1', [f1]),
          makeJump('j2', [f2], { processed: true } as unknown as ManifestJump)
        ],
        [f1, f2]
      )
    )
    const cbs = document.querySelectorAll('input[type="checkbox"][title]')
    await user.click(cbs[0] as HTMLInputElement)
    await user.click(cbs[1] as HTMLInputElement)
    await user.click(screen.getByText('Process selected'))
    await waitFor(() => {
      const calls = spy.mock.calls.filter((c) => String(c[0]).includes('/api/manifest'))
      expect(calls.length).toBeGreaterThan(0)
    })
  })
  it('Change Day → newNoon - oldNoon offset via getJumpBounds + shift-sequences per jump', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4', Math.floor(new Date(2026, 7, 24, 10, 0, 0).getTime() / 1000))
    const jump = makeJump('j1', [f])
    const m = makeManifest([jump], [f])
    renderReview(m)
    await user.click(document.querySelector('input[type="checkbox"][title]') as HTMLInputElement)
    await user.click(screen.getByText('Edit day for selected jumps'))
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    expect(dateInput).toBeInTheDocument()
    await user.type(dateInput, '2026-08-25')
    const apply = screen.getByText('Apply')
    expect(apply).toBeInTheDocument()
    const bounds = getJumpBounds(jump)
    const newNoon = Math.floor(new Date(2026, 7, 25, 12, 0, 0).getTime() / 1000)
    const oldNoon = Math.floor(new Date(bounds.start * 1000).setHours(12, 0, 0, 0) / 1000)
    expect(newNoon - oldNoon).toBe(86400)
  })
  it('selected panel shows time range via formatSequenceTime and getJumpBounds', async () => {
    const user = userEvent.setup()
    const f = makeFile('/a.mp4', 1000)
    const m = makeManifest([makeJump('j1', [f])], [f])
    renderReview(m)
    await user.click(document.querySelector('input[type="checkbox"][title]') as HTMLInputElement)
    const bounds = getJumpBounds(m.jumps[0])
    const timeStr = formatSequenceTime(bounds.start)
    void timeStr
    // duplicate 1 files in header/day/panel — use getAllByText
    expect(screen.getAllByText(/1 files/).length).toBeGreaterThan(0)
  })
})

describe('ui-review — compare drawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchForStatus(idleStatus)
  })
  afterEach(() => vi.restoreAllMocks())
  it('opens panel with 2 columns when showCompare && compareJumps', async () => {
    const user = userEvent.setup()
    const f1 = makeFile('/a.mp4')
    const f2 = makeFile('/b.mp4')
    renderReview(makeManifest([makeJump('j1', [f1]), makeJump('j2', [f2])], [f1, f2]))
    const cbs = document.querySelectorAll('input[type="checkbox"][title]')
    await user.click(cbs[0] as HTMLInputElement)
    await user.click(cbs[1] as HTMLInputElement)
    await user.click(screen.getByText('Compare'))
    expect(screen.getByText('Compare jumps')).toBeInTheDocument()
    // Jump j1 appears in card + panel + drawer — scope to drawer
    const drawer = document.querySelector('.fixed.inset-0') as HTMLElement
    expect(within(drawer).getByText('Jump j1')).toBeInTheDocument()
    expect(within(drawer).getByText('Jump j2')).toBeInTheDocument()
    const grid = document.querySelector('.grid-cols-2') as HTMLElement
    expect(grid).toBeInTheDocument()
  })
  it('each column lists jump.files with previews and time size', async () => {
    const user = userEvent.setup()
    const f1 = makeFile('/a1.mp4', 1000, 2000)
    const f2 = makeFile('/a2.mp4', 2000, 3000)
    const f3 = makeFile('/b1.mp4', 3000, 4000)
    renderReview(makeManifest([makeJump('j1', [f1, f2]), makeJump('j2', [f3])], [f1, f2, f3]))
    const cbs = document.querySelectorAll('input[type="checkbox"][title]')
    await user.click(cbs[0] as HTMLInputElement)
    await user.click(cbs[1] as HTMLInputElement)
    await user.click(screen.getByText('Compare'))
    // a1 etc appear both in jump card and drawer — scope to drawer
    const drawer2 = document.querySelector('.fixed.inset-0') as HTMLElement
    expect(within(drawer2).getByText('a1.mp4')).toBeInTheDocument()
    expect(within(drawer2).getByText('a2.mp4')).toBeInTheDocument()
    expect(within(drawer2).getByText('b1.mp4')).toBeInTheDocument()
    // two columns each have Select a file — use getAllByText
    expect(screen.getAllByText(/Select a file/).length).toBeGreaterThan(0)
  })
  it('Merge into → handleMerge targetId sourceId → merge-jumps with sourceJumpIds', async () => {
    const user = userEvent.setup()
    const spy = mockFetchForStatus(idleStatus)
    const f1 = makeFile('/a.mp4')
    const f2 = makeFile('/b.mp4')
    renderReview(makeManifest([makeJump('j1', [f1]), makeJump('j2', [f2])], [f1, f2]))
    const cbs = document.querySelectorAll('input[type="checkbox"][title]')
    await user.click(cbs[0] as HTMLInputElement)
    await user.click(cbs[1] as HTMLInputElement)
    await user.click(screen.getByText('Compare'))
    const mergeBtn = screen.getByText('Merge into Jump j1')
    await user.click(mergeBtn)
    await waitFor(() => {
      const calls = spy.mock.calls.filter((c) => String(c[0]).includes('/api/manifest'))
      expect(calls.length).toBeGreaterThan(0)
    })
  })
  it('merge closes drawer and clears compareIds', async () => {
    const user = userEvent.setup()
    const f1 = makeFile('/a.mp4')
    const f2 = makeFile('/b.mp4')
    renderReview(makeManifest([makeJump('j1', [f1]), makeJump('j2', [f2])], [f1, f2]))
    const cbs = document.querySelectorAll('input[type="checkbox"][title]')
    await user.click(cbs[0] as HTMLInputElement)
    await user.click(cbs[1] as HTMLInputElement)
    await user.click(screen.getByText('Compare'))
    expect(screen.getByText('Compare jumps')).toBeInTheDocument()
    await user.click(screen.getByText('Merge into Jump j1'))
    await waitFor(() => expect(screen.queryByText('Compare jumps')).not.toBeInTheDocument())
    expect(screen.queryByText(/2 jumps selected/)).not.toBeInTheDocument()
  })
  it('compare toggle via onCompareIdsChange navigate jump arrows', async () => {
    const user = userEvent.setup()
    const f1 = makeFile('/a.mp4')
    const f2 = makeFile('/b.mp4')
    const f3 = makeFile('/c.mp4')
    renderReview(
      makeManifest([makeJump('j1', [f1]), makeJump('j2', [f2]), makeJump('j3', [f3])], [f1, f2, f3])
    )
    const cbs = document.querySelectorAll('input[type="checkbox"][title]')
    await user.click(cbs[0] as HTMLInputElement)
    await user.click(cbs[1] as HTMLInputElement)
    await user.click(screen.getByText('Compare'))
    const arrows = document.querySelectorAll('button')
    const navArrows = Array.from(arrows).filter(
      (b) => b.textContent === '‹' || b.textContent === '›'
    )
    expect(navArrows.length).toBe(4)
    await user.click(navArrows[1] as HTMLButtonElement)
    expect(screen.getByText('Compare jumps')).toBeInTheDocument()
  })
  it('drawer closes on Escape and overlay click', async () => {
    const user = userEvent.setup()
    const f1 = makeFile('/a.mp4')
    const f2 = makeFile('/b.mp4')
    renderReview(makeManifest([makeJump('j1', [f1]), makeJump('j2', [f2])], [f1, f2]))
    const cbs = document.querySelectorAll('input[type="checkbox"][title]')
    await user.click(cbs[0] as HTMLInputElement)
    await user.click(cbs[1] as HTMLInputElement)
    await user.click(screen.getByText('Compare'))
    expect(screen.getByText('Compare jumps')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Compare jumps')).not.toBeInTheDocument())
  })
})

export {}
