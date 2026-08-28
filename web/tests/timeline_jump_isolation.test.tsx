// @ts-nocheck
import { fireEvent, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Manifest, ManifestFile, ManifestJump } from '../app/lib/types'
import Review from '../app/routes/review'

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

describe('Timeline jump isolation', () => {
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
    const { container } = (() => {
      const routes: any[] = [
        { path: '/review', element: <Review loaderData={{ manifest } as any} /> },
        { path: '/api/manifest', action: actionSpy }
      ]
      const router = createMemoryRouter(routes, { initialEntries: ['/review'] })
      return render(<RouterProvider router={router} />)
    })()

    const bars = container.querySelectorAll('[data-jump-bar="true"]') as NodeListOf<HTMLElement>
    expect(bars.length).toBe(2)
    const bar1 = bars[0]
    const bar2 = bars[1]
    const containerEl = container.querySelector('div.relative.bg-gray-50') as HTMLElement
    Object.defineProperty(containerEl, 'clientWidth', { value: 1000, configurable: true })

    const left1Before = bar1.style.left
    const left2Before = bar2.style.left

    fireEvent.mouseDown(bar1, { clientX: 100 })
    fireEvent.mouseMove(document, { clientX: 300 })
    const left1During = bar1.style.left
    const left2During = bar2.style.left

    expect(left1During).not.toBe(left1Before)
    expect(left2During).toBe(left2Before)

    fireEvent.mouseUp(document)
  })
})
