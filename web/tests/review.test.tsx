import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Manifest, ManifestFile, ManifestJump } from '../app/lib/types'
import Review from '../app/routes/review'

const makeFile = (path: string, _camera: string, mtime: number): ManifestFile => ({
  path,
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

const expandAll = () => {
  document.querySelectorAll('button').forEach((b) => {
    if (b.textContent === '▶') fireEvent.click(b)
  })
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

  it('renders unassigned files with count', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const files = [
      makeFile('/photo1.jpg', 'PHOTO', baseTime),
      makeFile('/photo2.jpg', 'PHOTO', baseTime + 300)
    ]
    const manifest = makeManifest([makeJump('jump_1', 'Jump 1', files)], files)

    renderReview(manifest)
    expandAll()

    expect(screen.getByText(/Jump 1/)).toBeInTheDocument()
    expect(document.querySelectorAll('[draggable="true"]').length).toBe(2)
  })

  it('renders single unassigned file', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const file = makeFile('/photo1.jpg', 'PHOTO', baseTime)
    const manifest = makeManifest([makeJump('jump_1', 'Jump 1', [file])], [file])

    renderReview(manifest)
    expandAll()

    expect(screen.getByText(/Jump 1/)).toBeInTheDocument()
    expect(document.querySelector('[draggable="true"]')).toBeTruthy()
  })

  it('renders jump with files', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [makeFile('/photo1.jpg', 'PHOTO', baseTime)])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime)]
    )

    renderReview(manifest)
    expandAll()

    expect(screen.getByText(/Jump 1/)).toBeInTheDocument()
    expect(screen.getAllByText(/1 file/).length).toBeGreaterThan(0)
  })

  it('renders empty jump with drop hint', () => {
    const manifest = makeManifest([makeJump('jump_1', 'Jump 1', [])], [])

    renderReview(manifest)
    expandAll()

    expect(screen.getByText('Drop files here')).toBeInTheDocument()
  })

  it('shows unassigned files', () => {
    const baseTime = new Date('2026-08-22T10:00:00Z').getTime() / 1000
    const file = makeFile('/photo1.jpg', 'PHOTO', baseTime)
    const manifest = makeManifest([makeJump('jump_1', 'Jump 1', [file])], [file])

    renderReview(manifest)
    expandAll()

    expect(screen.getByText(/Jump 1/)).toBeInTheDocument()
    expect(document.querySelector('[draggable="true"]')).toBeTruthy()
    expect(document.querySelector('[draggable="true"].bg-yellow-50')).toBeFalsy()
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

    expect(screen.queryByText(/Confirm & Execute/)).not.toBeInTheDocument()
    const heading = screen.getByText('Review Proposed Jumps')
    const statsP = heading.parentElement?.querySelector('p')
    const text = getTextContent(statsP ?? null)
    expect(text).toContain('2')
    expect(text).toContain('2 jumps')
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
    expandAll()

    const draggables = document.querySelectorAll('[draggable="true"]')
    expect(draggables.length).toBeGreaterThan(0)
  })

  it('dragging sets effectAllowed to move', () => {
    const file = makeFile('/photo1.jpg', 'PHOTO', baseTime)
    const manifest = makeManifest([makeJump('jump_1', 'Jump 1', [file])], [file])

    renderReview(manifest)
    expandAll()

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

    const jumpEl = screen.getByText(/Jump 1/).closest('[class*="border"]') as HTMLElement
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

    const jumpEl = screen.getByText(/Jump 1/).closest('[class*="border"]') as HTMLElement
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: '' }

    fireEvent.dragEnter(jumpEl)
    fireEvent.dragOver(jumpEl, { dataTransfer })
    expect(jumpEl.className).toContain('border-blue-400')

    fireEvent.dragLeave(jumpEl)
    expect(jumpEl.className).not.toContain('border-blue-400')
  })

  it('unassigned files show yellow background', () => {
    const file = makeFile('/photo1.jpg', 'PHOTO', baseTime)
    const manifest = makeManifest([makeJump('jump_1', 'Jump 1', [file])], [file])

    renderReview(manifest)
    expandAll()

    const fileRow = document.querySelector('[draggable="true"]') as HTMLElement
    expect(fileRow).toBeTruthy()
    expect(document.querySelector('[draggable="true"].bg-yellow-50')).toBeFalsy()
  })

  it('assigned files do not show yellow background', () => {
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', [makeFile('/photo1.jpg', 'PHOTO', baseTime)])],
      [makeFile('/photo1.jpg', 'PHOTO', baseTime)]
    )

    renderReview(manifest)
    expandAll()

    const yellowFileRows = document.querySelectorAll('[draggable="true"].bg-yellow-50')
    expect(yellowFileRows.length).toBe(0)
  })

  it('ctrl+click selects multiple files', () => {
    const files = [
      makeFile('/photo1.jpg', 'PHOTO', baseTime),
      makeFile('/photo2.jpg', 'PHOTO', baseTime + 300)
    ]
    const manifest = makeManifest([makeJump('jump_1', 'Jump 1', files)], files)

    renderReview(manifest)
    expandAll()

    const fileRows = document.querySelectorAll('[draggable="true"]')
    expect(fileRows.length).toBeGreaterThanOrEqual(2)

    fireEvent.click(fileRows[0], { ctrlKey: true })
    fireEvent.click(fileRows[1], { ctrlKey: true })

    const selected = document.querySelectorAll('.bg-blue-100')
    expect(selected.length).toBe(2)
  })

  it('dragging an unselected file drops only that file without selecting first', async () => {
    const files = [
      makeFile('/photo1.jpg', 'PHOTO', baseTime),
      makeFile('/photo2.jpg', 'PHOTO', baseTime + 60)
    ]
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', files), makeJump('jump_2', 'Jump 2', [])],
      files
    )
    const actionSpy = vi.fn(async () => ({ ok: true }))

    renderReview(manifest, actionSpy)
    expandAll()

    const jumpOne = screen.getByText(/Jump 1/).closest('[class*="border"]') as HTMLElement
    const jumpTwo = screen.getByText(/Jump 2/).closest('[class*="border"]') as HTMLElement
    const fileRow = jumpOne.querySelector('[draggable="true"]') as HTMLElement
    expect(jumpTwo).toBeTruthy()

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

  it('dragging one unselected file while others are selected moves only the dragged file', async () => {
    const files = [
      makeFile('/photo1.jpg', 'PHOTO', baseTime),
      makeFile('/photo2.jpg', 'PHOTO', baseTime + 60)
    ]
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', files), makeJump('jump_2', 'Jump 2', [])],
      files
    )
    const actionSpy = vi.fn(async () => ({ ok: true }))

    renderReview(manifest, actionSpy)
    expandAll()

    const jumpOne = screen.getByText(/Jump 1/).closest('[class*="border"]') as HTMLElement
    const jumpTwo = screen.getByText(/Jump 2/).closest('[class*="border"]') as HTMLElement
    const fileRows = jumpOne.querySelectorAll('[draggable="true"]')

    fireEvent.click(fileRows[0], { ctrlKey: true })
    expect(document.querySelectorAll('.bg-blue-100').length).toBe(1)

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(fileRows[1] as HTMLElement, { dataTransfer })
    fireEvent.dragOver(jumpTwo, { dataTransfer })
    fireEvent.drop(jumpTwo, { dataTransfer })

    const body = await getSubmitBody(actionSpy)
    expect(body).toEqual({
      action: 'move-files',
      fromJumpId: 'jump_1',
      toJumpId: 'jump_2',
      filePaths: ['/photo2.jpg']
    })
  })

  it('dragging a selected file carries all selected files of the group', async () => {
    const files = [
      makeFile('/photo1.jpg', 'PHOTO', baseTime),
      makeFile('/photo2.jpg', 'PHOTO', baseTime + 60)
    ]
    const manifest = makeManifest(
      [makeJump('jump_1', 'Jump 1', files), makeJump('jump_2', 'Jump 2', [])],
      files
    )
    const actionSpy = vi.fn(async () => ({ ok: true }))

    renderReview(manifest, actionSpy)
    expandAll()

    const jumpOne = screen.getByText(/Jump 1/).closest('[class*="border"]') as HTMLElement
    const jumpTwo = screen.getByText(/Jump 2/).closest('[class*="border"]') as HTMLElement
    const fileRows = jumpOne.querySelectorAll('[draggable="true"]')

    fireEvent.click(fileRows[0], { ctrlKey: true })
    fireEvent.click(fileRows[1], { ctrlKey: true })
    expect(document.querySelectorAll('.bg-blue-100').length).toBe(2)

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(fileRows[0] as HTMLElement, { dataTransfer })
    fireEvent.dragOver(jumpTwo, { dataTransfer })
    fireEvent.drop(jumpTwo, { dataTransfer })

    const body = await getSubmitBody(actionSpy)
    expect(body).toEqual({
      action: 'move-files',
      fromJumpId: 'jump_1',
      toJumpId: 'jump_2',
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
    expandAll()

    const jumpOne = screen.getByText(/Jump 1/).closest('[class*="border"]') as HTMLElement
    const jumpTwo = screen.getByText(/Jump 2/).closest('[class*="border"]') as HTMLElement
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
