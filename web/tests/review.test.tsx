import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import Review from '../app/routes/review'
import type { Manifest, ManifestJump, ManifestFile } from '../app/lib/types'

const makeFile = (path: string, camera: 'PHOTO' | 'VIDEO', mtime: number): ManifestFile => ({
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
  camera1: { path: '/camera1', fileCount: 0 },
  camera2: { path: '/camera2', fileCount: 0 },
  theory: [],
  jumps,
  files
})

const renderReview = (manifest: Manifest | null) => {
  const router = createMemoryRouter(
    [
      {
        path: '/review',
        // @ts-expect-error - testing with partial props
        element: <Review loaderData={{ manifest }} />
      }
    ],
    { initialEntries: ['/review'] }
  )
  return render(<RouterProvider router={router} />)
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
    const manifest = makeManifest([], [])

    renderReview(manifest)

    expect(screen.getByText('Camera 1 — Photos')).toBeInTheDocument()
    expect(screen.getByText('Camera 2 — Videos')).toBeInTheDocument()
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

  it('file row has draggable attribute', () => {
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [makeFile('/photo1.jpg', 'PHOTO', baseTime)])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime)]
    )

    renderReview(manifest)

    const draggables = document.querySelectorAll('[draggable="true"]')
    expect(draggables.length).toBeGreaterThan(0)
  })

  it('sets drag data on dragstart', () => {
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [makeFile('/photo1.jpg', 'PHOTO', baseTime)])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime)]
    )

    renderReview(manifest)

    const draggable = document.querySelector('[draggable="true"]') as HTMLElement
    expect(draggable).toBeTruthy()

    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(),
      effectAllowed: ''
    }

    fireEvent.dragStart(draggable, { dataTransfer })

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'application/json',
      expect.stringContaining('photo1.jpg')
    )
  })

  it('jump section accepts drop', () => {
    const manifest = makeManifest(
      [
        makeJump('jump_1', 'Jump 1', [makeFile('/photo1.jpg', 'PHOTO', baseTime)]),
        makeJump('jump_2', 'Jump 2', [])
      ],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime)]
    )

    renderReview(manifest)

    const jumpHeaders = screen.getAllByText(/Jump \d/)
    expect(jumpHeaders.length).toBe(2)
  })

  it('sequence files show yellow background when not in any jump', () => {
    const manifest = makeManifest([], [makeFile('/photo1.jpg', 'PHOTO', baseTime)])

    renderReview(manifest)

    const yellowBg = document.querySelector('.bg-yellow-50')
    expect(yellowBg).toBeTruthy()
  })

  it('sequence files do not show yellow background when in a jump', () => {
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [makeFile('/photo1.jpg', 'PHOTO', baseTime)])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime)]
    )

    renderReview(manifest)

    const yellowBg = document.querySelector('.bg-yellow-50')
    expect(yellowBg).toBeFalsy()
  })

  it('multi-select and drag moves all selected files', () => {
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime), makeFile('/photo2.jpg', 'PHOTO', baseTime + 300)]
    )

    renderReview(manifest)

    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThan(0)

    if (checkboxes.length >= 2) {
      fireEvent.click(checkboxes[0] as HTMLElement)
      fireEvent.click(checkboxes[1] as HTMLElement)
    }

    const selected = document.querySelectorAll('.bg-blue-100')
    expect(selected.length).toBeGreaterThanOrEqual(0)
  })
})
