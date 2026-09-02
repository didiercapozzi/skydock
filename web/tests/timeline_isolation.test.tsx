// @ts-nocheck
import { fireEvent, render } from '@testing-library/react'
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

describe('Timeline isolation detailed', () => {
  it('only dragged jump moves, others stay', async () => {
    const base = Math.floor(new Date('2026-08-24T09:00:00Z').getTime() / 1000)
    const files = [
      makeFile('/a1.mp4', base),
      makeFile('/a2.mp4', base + 90),
      makeFile('/b1.mp4', base + 3600),
      makeFile('/b2.mp4', base + 3690),
      makeFile('/c1.mp4', base + 7200),
      makeFile('/c2.mp4', base + 7290)
    ]
    const manifest = makeManifest(
      [
        makeJump('jump_1', 'Jump 1', [files[0], files[1]]),
        makeJump('jump_2', 'Jump 2', [files[2], files[3]]),
        makeJump('jump_3', 'Jump 3', [files[4], files[5]])
      ],
      files
    )
    const actionSpy = vi.fn(async () => ({ ok: true }))
    const { container } = (() => {
      const routes: any[] = [
        { path: '/', element: <Home loaderData={{ manifest } as any} /> },
        { path: '/api/manifest', action: actionSpy }
      ]
      const router = createMemoryRouter(routes, { initialEntries: ['/'] })
      return render(<RouterProvider router={router} />)
    })()

    const bars = container.querySelectorAll('[data-jump-bar="true"]') as NodeListOf<HTMLElement>
    expect(bars.length).toBe(3)
    const containerEl = container.querySelector('div.relative.bg-gray-50') as HTMLElement
    Object.defineProperty(containerEl, 'clientWidth', { value: 1000, configurable: true })

    const leftsBefore = Array.from(bars).map((b) => b.style.left)
    console.log('before', leftsBefore)

    const _bar1 = bars[0]
    const bar2 = bars[1]
    const _bar3 = bars[2]

    fireEvent.mouseDown(bar2, { clientX: 200 })
    fireEvent.mouseMove(document, { clientX: 400 })
    const leftsDuring = Array.from(bars).map((b) => b.style.left)
    console.log('during', leftsDuring)
    expect(leftsDuring[1]).not.toBe(leftsBefore[1])
    expect(leftsDuring[0]).toBe(leftsBefore[0])
    expect(leftsDuring[2]).toBe(leftsBefore[2])

    fireEvent.mouseUp(document)
    const leftsAfter = Array.from(bars).map((b) => b.style.left)
    console.log('after', leftsAfter)
    // After mouseUp, should stay at dragged position (not snap back) until revalidate
    expect(leftsAfter[1]).toBe(leftsDuring[1])
    expect(leftsAfter[0]).toBe(leftsBefore[0])
    expect(leftsAfter[2]).toBe(leftsBefore[2])
  })
})
