import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Manifest, ManifestFile, ManifestJump } from '../app/lib/types'
import Review from '../app/routes/review'

const makeFile = (path: string, camera: string, mtime: number): ManifestFile => ({
  path,
  camera,
  mtime,
  size: 1000,
  filename: path.split('/').pop() ?? ''
})

const makeJump = (id: string, label: string, files: ManifestFile[] = []): ManifestJump => ({
  id,
  label,
  confirmed: false,
  files
})

const makeManifest = (jumps: ManifestJump[] = [], files: ManifestFile[] = []): Manifest => ({
  version: 1,
  status: 'proposed',
  date: '2026-08-22',
  startDatetime: '2026-08-22T09:00:00Z',
  createdAt: new Date().toISOString(),
  cameras: [
    { id: 'camera1', path: '/camera1', fileCount: 0 },
    { id: 'camera2', path: '/camera2', fileCount: 0 }
  ],
  theory: [],
  jumps,
  files
})

const renderReview = (manifest: Manifest | null, action?: unknown) => {
  const routes: { path: string; element?: React.ReactNode; action?: unknown }[] = [
    {
      path: '/review',
      // @ts-expect-error - testing with partial props
      element: <Review loaderData={{ manifest }} />
    }
  ]
  if (action) {
    routes.push({ path: '/api/manifest', action })
  }
  const router = createMemoryRouter(routes as never, { initialEntries: ['/review'] })
  return render(<RouterProvider router={router} />)
}

const getSubmitBody = async (
  actionSpy: ReturnType<typeof vi.fn>
): Promise<Record<string, unknown>> => {
  await waitFor(() => expect(actionSpy).toHaveBeenCalledTimes(1))
  const request = (actionSpy.mock.calls[0][0] as { request: Request }).request
  return (await request.json()) as Record<string, unknown>
}

const getTextContent = (element: Element | null): string => {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

describe('Review', () => {
  it('renders empty state when no manifest', () => {
    renderReview(null)
    expect(screen.getByText('No Manifest Found')).toBeInTheDocument()
    expect(screen.getByText('Run a scan first to generate proposed jumps.')).toBeInTheDocument()
  })

  it('renders header with title and stats', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [makeFile('/photo1.jpg', 'PHOTO', baseTime)])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime), makeFile('/video1.mp4', 'VIDEO', baseTime)]
    )

    renderReview(manifest)

    expect(screen.getByText('Review Proposed Jumps')).toBeInTheDocument()
    const heading = screen.getByText('Review Proposed Jumps')
    const statsP = heading.parentElement?.querySelector('p')
    const text = getTextContent(statsP ?? null)
    expect(text).toContain('2026-08-22')
    expect(text).toContain('1 jump')
  })

  it('renders camera columns', () => {
    const files = [
      makeFile('/camera1/photo1.jpg', 'camera1', 1787727600),
      makeFile('/camera2/video1.mp4', 'camera2', 1787727600)
    ]
    const manifest = makeManifest([], files)

    renderReview(manifest)

    expect(screen.getAllByText('Camera 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Camera 2').length).toBeGreaterThan(0)
    expect(screen.getByText('Jumps')).toBeInTheDocument()
  })

  it('renders sequence with file count', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const manifest = makeManifest(
      [],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime), makeFile('/photo2.jpg', 'PHOTO', baseTime + 300)]
    )

    renderReview(manifest)

    expect(screen.getByText('Sequence 1')).toBeInTheDocument()
    expect(screen.getByText('2 files')).toBeInTheDocument()
  })

  it('renders single file count in sequence', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const manifest = makeManifest([], [makeFile('/photo1.jpg', 'PHOTO', baseTime)])

    renderReview(manifest)

    expect(screen.getAllByText(/1 file/).length).toBeGreaterThan(0)
  })

  it('renders jump with files', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [makeFile('/photo1.jpg', 'PHOTO', baseTime)])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime)]
    )

    renderReview(manifest)

    expect(screen.getByText('Jump 1')).toBeInTheDocument()
    expect(screen.getAllByText(/1 file/).length).toBeGreaterThan(0)
  })

  it('renders empty jump with drop hint', () => {
    const manifest = makeManifest([makeJump('jump_1', 'Jump 1', [])], [])

    renderReview(manifest)

    expect(screen.getByText('Drop files here')).toBeInTheDocument()
  })

  it('shows start time input', () => {
    const manifest = makeManifest([], [])

    renderReview(manifest)

    expect(screen.getByText('Start Time:')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-08-22T09:00')).toBeInTheDocument()
  })

  it('shows scan button', () => {
    const manifest = makeManifest([], [])

    renderReview(manifest)

    expect(screen.getByText('Scan')).toBeInTheDocument()
  })

  it('shows action buttons', () => {
    const manifest = makeManifest([], [])

    renderReview(manifest)

    expect(screen.getByText('Confirm All')).toBeInTheDocument()
    expect(screen.getByText('+ Add Jump')).toBeInTheDocument()
  })

  it('shows jump count in confirm button', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const manifest = makeManifest(
      [
        makeJump('jump_1', 'Jump 1', [makeFile('/photo1.jpg', 'PHOTO', baseTime)]),
        makeJump('jump_2', 'Jump 2', [makeFile('/video1.mp4', 'VIDEO', baseTime)])
      ],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime), makeFile('/video1.mp4', 'VIDEO', baseTime)]
    )

    renderReview(manifest)

    const buttons = screen.getAllByRole('button')
    const confirmBtn = buttons.find((b) => getTextContent(b).includes('Confirm & Execute'))
    expect(confirmBtn).toBeDefined()
    const btnText = getTextContent(confirmBtn ?? null)
    expect(btnText).toContain('0')
    expect(btnText).toContain('2')
  })
})

describe('Drag and Drop', () => {
  const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000

  it('file rows are draggable', () => {
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [makeFile('/photo1.jpg', 'PHOTO', baseTime)])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime)]
    )

    renderReview(manifest)

    const draggables = document.querySelectorAll('[draggable="true"]')
    expect(draggables.length).toBeGreaterThan(0)
  })

  it('dragging sets effectAllowed to move', () => {
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime)]
    )

    renderReview(manifest)

    const fileRow = document.querySelector('[draggable="true"]') as HTMLElement
    expect(fileRow).toBeTruthy()

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(fileRow, { dataTransfer })

    expect(dataTransfer.effectAllowed).toBe('move')
  })

  it('jump section highlights on drag over', () => {
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime)]
    )

    renderReview(manifest)

    const jumpEl = screen.getByText('Jump 1').closest('[class*="border"]') as HTMLElement
    expect(jumpEl).toBeTruthy()

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: '' }
    fireEvent.dragEnter(jumpEl)
    fireEvent.dragOver(jumpEl, { dataTransfer })

    expect(jumpEl.className).toContain('border-blue-400')
  })

  it('jump section removes highlight on drag leave', () => {
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime)]
    )

    renderReview(manifest)

    const jumpEl = screen.getByText('Jump 1').closest('[class*="border"]') as HTMLElement
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: '' }

    fireEvent.dragEnter(jumpEl)
    fireEvent.dragOver(jumpEl, { dataTransfer })
    expect(jumpEl.className).toContain('border-blue-400')

    fireEvent.dragLeave(jumpEl)
    expect(jumpEl.className).not.toContain('border-blue-400')
  })

  it('unassigned files show yellow background', () => {
    const manifest = makeManifest([], [makeFile('/photo1.jpg', 'PHOTO', baseTime)])

    renderReview(manifest)

    const yellowBg = document.querySelector('.bg-yellow-50')
    expect(yellowBg).toBeTruthy()
  })

  it('assigned files do not show yellow background', () => {
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [makeFile('/photo1.jpg', 'PHOTO', baseTime)])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime)]
    )

    renderReview(manifest)

    const yellowBg = document.querySelector('.bg-yellow-50')
    expect(yellowBg).toBeFalsy()
  })

  it('ctrl+click selects multiple files', () => {
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime), makeFile('/photo2.jpg', 'PHOTO', baseTime + 300)]
    )

    renderReview(manifest)

    const fileRows = document.querySelectorAll('[draggable="true"]')
    expect(fileRows.length).toBeGreaterThanOrEqual(2)

    fireEvent.click(fileRows[0], { ctrlKey: true })
    fireEvent.click(fileRows[1], { ctrlKey: true })

    const selected = document.querySelectorAll('.bg-blue-100')
    expect(selected.length).toBe(2)
  })

  it('dragging an unselected file drops only that file without selecting first', async () => {
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime), makeFile('/photo2.jpg', 'PHOTO', baseTime + 60)]
    )
    const actionSpy = vi.fn(async () => ({ ok: true }))

    renderReview(manifest, actionSpy)

    const fileRow = document.querySelector('[draggable="true"]') as HTMLElement
    const jumpEl = screen.getByText('Jump 1').closest('[class*="border"]') as HTMLElement
    expect(jumpEl).toBeTruthy()

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(fileRow, { dataTransfer })
    fireEvent.dragOver(jumpEl, { dataTransfer })
    fireEvent.drop(jumpEl, { dataTransfer })

    const body = await getSubmitBody(actionSpy)
    expect(body).toEqual({
      action: 'add-to-jump',
      jumpId: 'jump_1',
      filePaths: ['/photo1.jpg']
    })
  })

  it('dragging one unselected file while others are selected moves only the dragged file', async () => {
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime), makeFile('/photo2.jpg', 'PHOTO', baseTime + 60)]
    )
    const actionSpy = vi.fn(async () => ({ ok: true }))

    renderReview(manifest, actionSpy)

    const fileRows = document.querySelectorAll('[draggable="true"]')
    const jumpEl = screen.getByText('Jump 1').closest('[class*="border"]') as HTMLElement

    fireEvent.click(fileRows[0], { ctrlKey: true })
    expect(document.querySelectorAll('.bg-blue-100').length).toBe(1)

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(fileRows[1] as HTMLElement, { dataTransfer })
    fireEvent.dragOver(jumpEl, { dataTransfer })
    fireEvent.drop(jumpEl, { dataTransfer })

    const body = await getSubmitBody(actionSpy)
    expect(body).toEqual({
      action: 'add-to-jump',
      jumpId: 'jump_1',
      filePaths: ['/photo2.jpg']
    })
  })

  it('dragging a selected file carries all selected files of the group', async () => {
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime), makeFile('/photo2.jpg', 'PHOTO', baseTime + 60)]
    )
    const actionSpy = vi.fn(async () => ({ ok: true }))

    renderReview(manifest, actionSpy)

    const fileRows = document.querySelectorAll('[draggable="true"]')
    const jumpEl = screen.getByText('Jump 1').closest('[class*="border"]') as HTMLElement

    fireEvent.click(fileRows[0], { ctrlKey: true })
    fireEvent.click(fileRows[1], { ctrlKey: true })
    expect(document.querySelectorAll('.bg-blue-100').length).toBe(2)

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(fileRows[0] as HTMLElement, { dataTransfer })
    fireEvent.dragOver(jumpEl, { dataTransfer })
    fireEvent.drop(jumpEl, { dataTransfer })

    const body = await getSubmitBody(actionSpy)
    expect(body).toEqual({
      action: 'add-to-jump',
      jumpId: 'jump_1',
      filePaths: ['/photo1.jpg', '/photo2.jpg']
    })
  })

  it('dragging a file between two jumps moves only that file', async () => {
    const manifest = makeManifest(
      [
        makeJump('jump_1', 'Jump 1', [makeFile('/photo1.jpg', 'PHOTO', baseTime)]),
        makeJump('jump_2', 'Jump 2', [])
      ],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime)]
    )
    const actionSpy = vi.fn(async () => ({ ok: true }))

    renderReview(manifest, actionSpy)

    const jumpOne = screen.getByText('Jump 1').closest('[class*="border"]') as HTMLElement
    const jumpTwo = screen.getByText('Jump 2').closest('[class*="border"]') as HTMLElement
    const fileRow = jumpOne.querySelector('[draggable="true"]') as HTMLElement

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(fileRow, { dataTransfer })
    fireEvent.dragOver(jumpTwo, { dataTransfer })
    fireEvent.drop(jumpTwo, { dataTransfer })

    const body = await getSubmitBody(actionSpy)
    expect(body).toEqual({
      action: 'move-files',
      fromJumpId: 'jump_1',
      toJumpId: 'jump_2',
      filePaths: ['/photo1.jpg']
    })
  })
})

describe('Sequence Recalibration', () => {
  const baseTime = new Date('2026-08-26T09:00:00Z').getTime() / 1000

  const driftManifest = () =>
    makeManifest(
      [],
      [
        makeFile('/photo1.jpg', 'PHOTO', baseTime),
        makeFile('/video1.mp4', 'VIDEO', baseTime - 5 * 86400)
      ]
    )

  const calibrateButtons = (): HTMLElement[] =>
    screen.getAllByTitle('Sync this sequence onto another') as HTMLElement[]

  it('sets a reference sequence on first click and shows the banner', () => {
    renderReview(driftManifest())

    expect(calibrateButtons().length).toBe(2)
    fireEvent.click(calibrateButtons()[0])

    expect(screen.getByText(/Reference set:/)).toBeInTheDocument()
  })

  it('clicking the reference sequence again clears it', () => {
    renderReview(driftManifest())

    fireEvent.click(calibrateButtons()[0])
    fireEvent.click(calibrateButtons()[0])

    expect(screen.queryByText(/Reference set:/)).not.toBeInTheDocument()
  })

  it('opens the dialog with computed offset and submits single-sequence alignment', async () => {
    const actionSpy = vi.fn(async () => ({ ok: true }))
    renderReview(driftManifest(), actionSpy)

    fireEvent.click(calibrateButtons()[0])
    fireEvent.click(calibrateButtons()[1])

    expect(screen.getByText('Sync Cameras')).toBeInTheDocument()
    expect(screen.getByText(/offset/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Align this sequence'))

    const body = await getSubmitBody(actionSpy)
    expect(body).toEqual({
      action: 'calibrate-sequences',
      referencePaths: ['/video1.mp4'],
      targetPaths: ['/photo1.jpg'],
      scope: 'single',
      camera: 'PHOTO'
    })
  })

  it('submits camera-wide alignment when choosing Shift all', async () => {
    const actionSpy = vi.fn(async () => ({ ok: true }))
    renderReview(driftManifest(), actionSpy)

    fireEvent.click(calibrateButtons()[0])
    fireEvent.click(calibrateButtons()[1])
    fireEvent.click(screen.getByText('Shift all PHOTO files'))

    const body = await getSubmitBody(actionSpy)
    expect(body).toMatchObject({ action: 'calibrate-sequences', scope: 'camera', camera: 'PHOTO' })
  })

  it('shows Reset Sync once calibration data exists in the manifest', () => {
    const manifest = driftManifest()
    manifest.cameraClockOffsetSeconds = 432000
    renderReview(manifest)

    expect(screen.getByText('Reset Sync')).toBeInTheDocument()
  })
})
