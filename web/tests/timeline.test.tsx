// @ts-nocheck
import { fireEvent, render, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Manifest, ManifestFile, ManifestJump } from '../app/lib/types'
import Home from '../app/routes/home'

const makeFile = (path: string, mtime: number): ManifestFile => ({
  path,
  mtime,
  size: 1000,
  filename: path.split('/').pop() ?? ''
})
const makeJump = (id: string, label: string, files: ManifestFile[]): ManifestJump => ({
  id,
  label,
  confirmed: false,
  files
})
const makeManifest = (jumps: ManifestJump[], files: ManifestFile[]): Manifest => ({
  version: 1,
  status: 'proposed',
  date: '2026-08-24',
  startDatetime: '2026-08-24T09:00:00Z',
  createdAt: new Date().toISOString(),
  theory: [],
  jumps,
  files
})

const renderReview = (manifest: Manifest, actionSpy?: ReturnType<typeof vi.fn>) => {
  const routes: any[] = [{ path: '/', element: <Home loaderData={{ manifest } as any} /> }]
  if (actionSpy) routes.push({ path: '/api/manifest', action: actionSpy })
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })
  return render(<RouterProvider router={router} />)
}

describe('Timeline per-jump drag', () => {
  it('dragging one jump does not move others', async () => {
    const base = Math.floor(new Date('2026-08-24T09:00:00Z').getTime() / 1000)
    const files = [
      makeFile('/a1.mp4', base),
      makeFile('/a2.mp4', base + 90),
      makeFile('/b1.mp4', base + 3600),
      makeFile('/b2.mp4', base + 3690)
    ]
    const manifest = makeManifest(
      [
        makeJump('jump_1', 'Jump 1', [files[0], files[1]]),
        makeJump('jump_2', 'Jump 2', [files[2], files[3]])
      ],
      files
    )
    const actionSpy = vi.fn(async () => ({ ok: true }))
    const { container } = renderReview(manifest, actionSpy)
    const bars = container.querySelectorAll('[data-jump-bar="true"]') as NodeListOf<HTMLElement>
    expect(bars.length).toBe(2)
    const bar1 = bars[0]
    const bar2 = bars[1]
    const containerEl = container.querySelector('div.relative.bg-gray-50') as HTMLElement
    Object.defineProperty(containerEl, 'clientWidth', { value: 1000, configurable: true })
    const initialLeft1 = bar1.style.left
    const initialLeft2 = bar2.style.left
    fireEvent.mouseDown(bar1, { clientX: 100 })
    fireEvent.mouseMove(document, { clientX: 300 })
    const duringLeft1 = bar1.style.left
    const duringLeft2 = bar2.style.left
    expect(duringLeft1).not.toBe(initialLeft1)
    expect(duringLeft2).toBe(initialLeft2)
    fireEvent.mouseUp(document)
    await waitFor(() => expect(actionSpy).toHaveBeenCalled())
    const afterLeft1 = bar1.style.left
    const afterLeft2 = bar2.style.left
    expect(afterLeft1).toBe(duringLeft1)
    expect(afterLeft2).toBe(initialLeft2)
  })

  it('dragging snaps back only for tiny drag (<60s), otherwise stays', async () => {
    const base = Math.floor(new Date('2026-08-24T09:00:00Z').getTime() / 1000)
    const files = [makeFile('/a1.mp4', base), makeFile('/a2.mp4', base + 90)]
    const manifest = makeManifest([makeJump('jump_1', 'Jump 1', files)], files)
    const actionSpy = vi.fn(async () => ({ ok: true }))
    const { container } = renderReview(manifest, actionSpy)
    const bar = container.querySelector('[data-jump-bar="true"]') as HTMLElement
    const containerEl = container.querySelector('div.relative.bg-gray-50') as HTMLElement
    Object.defineProperty(containerEl, 'clientWidth', { value: 1000, configurable: true })
    const initialLeft = bar.style.left
    fireEvent.mouseDown(bar, { clientX: 100 })
    fireEvent.mouseMove(document, { clientX: 101 })
    fireEvent.mouseUp(document)
    expect(actionSpy).not.toHaveBeenCalled()
    expect(bar.style.left).toBe(initialLeft)
  })

  it('processed jump is not draggable', async () => {
    const base = Math.floor(new Date('2026-08-24T09:00:00Z').getTime() / 1000)
    const files = [makeFile('/a1.mp4', base)]
    const manifest = makeManifest([makeJump('jump_1', 'Jump 1', files)], files)
    manifest.jumps[0].processed = true
    const actionSpy = vi.fn(async () => ({ ok: true }))
    const { container } = renderReview(manifest, actionSpy)
    const bar = container.querySelector('[data-jump-bar="true"]') as HTMLElement
    expect(bar.className).toContain('bg-gray-400')
    fireEvent.mouseDown(bar, { clientX: 100 })
    fireEvent.mouseMove(document, { clientX: 300 })
    fireEvent.mouseUp(document)
    expect(actionSpy).not.toHaveBeenCalled()
  })
})
