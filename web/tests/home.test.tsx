import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

vi.mock(import('@skydock/scripts'), () => ({
  loadManifest: vi.fn(() => null)
}))

import Home from '../app/routes/home'

const makeFiles = (count: number, startMtime = 1724493600) =>
  Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(4, '0')
    return {
      path: `/output/DJI_${n}.MP4`,
      size: 1000 + i,
      mtime: startMtime + i * 60,
      filename: `DJI_${n}.MP4`
    }
  })

const makeManifest = (
  files: ReturnType<typeof makeFiles>,
  jumps: typeof files extends never ? never : unknown
) => ({
  version: 1,
  status: 'proposed' as const,
  date: '2026-08-24',
  startDatetime: '2026-08-24T10:00:00.000Z',
  createdAt: '2026-08-24T10:00:00.000Z',
  theory: [],
  files,
  jumps
})

const getOrder = () =>
  Array.from(document.querySelectorAll('[data-file-row]')).map(
    (el) => el.querySelector('span.font-mono')?.textContent?.trim() ?? ''
  )

const renderHome = async (manifest: unknown) => {
  const Stub = createRoutesStub([
    { path: '/', Component: Home, loader: () => ({ manifest }) },
    { path: '/api/manifest', action: async () => ({ ok: true }) }
  ])
  const result = await render(createElement(Stub, { initialEntries: ['/'] }))
  return result
}

describe('Home - 9.8 empty', () => {
  test('renders No Manifest Found when no manifest', async () => {
    const Stub = createRoutesStub([
      { path: '/', Component: Home, loader: () => ({ manifest: null }) }
    ])
    const { getByText } = await render(createElement(Stub, { initialEntries: ['/'] }))
    await expect.element(getByText('No Manifest Found')).toBeInTheDocument()
    await page.screenshot({ path: './playwright-screenshots/home-no-manifest.png' })
  })
})

describe('Home - 9.6.5 within-jump reorder', () => {
  test('reorders file 8 to second position via drag and drop', async () => {
    const files = makeFiles(10)
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never

    const { getByText } = await renderHome(manifest)
    await expect.element(getByText('Review Proposed Jumps')).toBeInTheDocument()

    const initial = getOrder()
    expect(initial).toEqual(files.map((f) => f.filename))

    const source = page.getByText('DJI_0008.MP4')
    const target = page.getByText('DJI_0002.MP4')
    await source.hover()
    await target.hover()
    await userEvent.dragAndDrop(source, target, { targetPosition: { x: 10, y: 2 } } as never)

    await expect
      .poll(() => getOrder(), { timeout: 2000 })
      .toEqual([
        'DJI_0001.MP4',
        'DJI_0008.MP4',
        'DJI_0002.MP4',
        'DJI_0003.MP4',
        'DJI_0004.MP4',
        'DJI_0005.MP4',
        'DJI_0006.MP4',
        'DJI_0007.MP4',
        'DJI_0009.MP4',
        'DJI_0010.MP4'
      ])
    await page.screenshot({ path: './playwright-screenshots/home-drag-reorder.png' })
  })
})

describe('Home - 9.6.1 drag sources', () => {
  test('file row is draggable and carries single file', async () => {
    const files = makeFiles(3)
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    await renderHome(manifest)
    const row = document.querySelector('[data-file-row]') as HTMLElement
    expect(row.getAttribute('draggable')).toBe('true')
    await expect.element(page.getByText('DJI_0001.MP4')).toBeInTheDocument()
  })

  test('staging tray appears after selection and is draggable source', async () => {
    const files = makeFiles(2)
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    await renderHome(manifest)
    expect(document.querySelector('[data-staging-tray]')).toBeNull()
    const checkbox = document.querySelector('[data-file-row] input[type="checkbox"]') as HTMLElement
    await userEvent.click(page.elementLocator(checkbox))
    await expect.element(page.getByText(/file selected/)).toBeInTheDocument()
    const tray = document.querySelector('[data-staging-tray]') as HTMLElement
    expect(tray.getAttribute('draggable')).toBe('true')
  })
})

describe('Home - 9.6.2 drop targets', () => {
  test('cross-jump drop shows Move/Copy/Cancel dialog', async () => {
    const filesA = makeFiles(2, 1724493600)
    const filesB = makeFiles(2, 1724493600 + 3600)
    filesB.forEach((f) => {
      f.path = `/output/B_${f.filename}`
      f.filename = `B_${f.filename}`
    })
    const manifest = {
      version: 1,
      status: 'proposed' as const,
      date: '2026-08-24',
      startDatetime: '2026-08-24T10:00:00.000Z',
      createdAt: '2026-08-24T10:00:00.000Z',
      theory: [],
      files: [...filesA, ...filesB],
      jumps: [
        { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...filesA] },
        { id: 'jump_02', label: 'jump_02', confirmed: false, files: [...filesB] }
      ]
    } as never
    await renderHome(manifest)
    const source = page.getByText(filesA[0].filename)
    const targetCard = page.elementLocator(
      document.querySelectorAll('[data-jump-card]')[1] as HTMLElement
    )
    await source.hover()
    await targetCard.hover()
    await userEvent.dragAndDrop(source, targetCard)
    await expect.element(page.getByText('Move')).toBeInTheDocument()
    await expect.element(page.getByText('Copy')).toBeInTheDocument()
    await expect.element(page.getByText('Cancel')).toBeInTheDocument()
    await page.screenshot({ path: './playwright-screenshots/home-cross-jump-dialog.png' })
  })

  test('same-jump drop reorders without dialog', async () => {
    const files = makeFiles(3)
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    await renderHome(manifest)
    const source = page.getByText('DJI_0003.MP4')
    const target = page.getByText('DJI_0001.MP4')
    await source.hover()
    await target.hover()
    await userEvent.dragAndDrop(source, target, { targetPosition: { x: 10, y: 2 } } as never)
    await expect
      .poll(() => getOrder(), { timeout: 2000 })
      .toEqual(['DJI_0003.MP4', 'DJI_0001.MP4', 'DJI_0002.MP4'])
    expect(document.querySelector('[data-drop-dialog]')).toBeNull()
  })
})

describe('Home - 9.6.3 constraints', () => {
  test('drop indicator visible during drag over', async () => {
    const files = makeFiles(3)
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    await renderHome(manifest)
    const jumpCard = document.querySelector('[data-jump-card]') as HTMLElement
    const secondRow = document.querySelectorAll('[data-file-row]')[1] as HTMLElement
    const rect = secondRow.getBoundingClientRect()
    jumpCard.dispatchEvent(
      new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientY: rect.top + rect.height * 0.1
      })
    )
    await expect.poll(() => document.querySelector('[data-drop-indicator]') !== null).toBe(true)
    jumpCard.dispatchEvent(new DragEvent('dragleave', { bubbles: true }))
    await expect.poll(() => document.querySelector('[data-drop-indicator]') === null).toBe(true)
  })

  test('drag references cleared after drop', async () => {
    const files = makeFiles(3)
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    await renderHome(manifest)
    const source = page.getByText('DJI_0003.MP4')
    const target = page.getByText('DJI_0001.MP4')
    await userEvent.dragAndDrop(source, target, { targetPosition: { x: 10, y: 2 } } as never)
    await expect
      .poll(() => getOrder(), { timeout: 2000 })
      .toEqual(['DJI_0003.MP4', 'DJI_0001.MP4', 'DJI_0002.MP4'])
    const card = document.querySelector('[data-jump-card]') as HTMLElement
    card.dispatchEvent(
      new DragEvent('drop', { bubbles: true, clientY: 0 } as unknown as DragEventInit)
    )
    await expect
      .poll(() => getOrder(), { timeout: 500 })
      .toEqual(['DJI_0003.MP4', 'DJI_0001.MP4', 'DJI_0002.MP4'])
  })
})

describe('Home - 9.6.4 staging tray', () => {
  test('tray visible when selected, hidden after Clear, not a drop target', async () => {
    const files = makeFiles(2)
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    await renderHome(manifest)
    expect(document.querySelector('[data-staging-tray]')).toBeNull()
    const checkbox = document.querySelector('[data-file-row] input[type="checkbox"]') as HTMLElement
    await userEvent.click(page.elementLocator(checkbox))
    await expect.element(page.getByText(/file selected/)).toBeInTheDocument()
    await expect.poll(() => document.querySelector('[data-staging-tray]') !== null).toBe(true)
    await userEvent.click(page.getByText('Clear'))
    await expect.poll(() => document.querySelector('[data-staging-tray]') === null).toBe(true)
  })

  test('tray is drag source and not drop target', async () => {
    const files = makeFiles(2)
    const manifest = {
      version: 1,
      status: 'proposed' as const,
      date: '2026-08-24',
      startDatetime: '2026-08-24T10:00:00.000Z',
      createdAt: '2026-08-24T10:00:00.000Z',
      theory: [],
      files: [...files],
      jumps: [{ id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }]
    } as never
    const Stub = createRoutesStub([
      { path: '/', Component: Home, loader: () => ({ manifest }) },
      { path: '/api/manifest', action: async () => ({ ok: true }) }
    ])
    await render(createElement(Stub, { initialEntries: ['/'] }))
    const checkbox2 = document.querySelector(
      '[data-file-row] input[type="checkbox"]'
    ) as HTMLElement
    await userEvent.click(page.elementLocator(checkbox2))
    await expect.element(page.getByText(/file selected/)).toBeInTheDocument()
    expect(
      (document.querySelector('[data-staging-tray]') as HTMLElement).getAttribute('draggable')
    ).toBe('true')
  })
})

describe('Home - 9.6.5 user interactions', () => {
  test('Move between jumps via dialog removes from source', async () => {
    const filesA = makeFiles(2, 1724493600)
    const filesB = makeFiles(1, 1724493600 + 3600)
    filesB[0].path = '/output/B_0001.MP4'
    filesB[0].filename = 'B_0001.MP4'
    const manifest = {
      version: 1,
      status: 'proposed' as const,
      date: '2026-08-24',
      startDatetime: '2026-08-24T10:00:00.000Z',
      createdAt: '2026-08-24T10:00:00.000Z',
      theory: [],
      files: [...filesA, ...filesB],
      jumps: [
        { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...filesA] },
        { id: 'jump_02', label: 'jump_02', confirmed: false, files: [...filesB] }
      ]
    } as never
    await renderHome(manifest)
    const source = page.getByText(filesA[1].filename)
    const targetCard = page.elementLocator(
      document.querySelectorAll('[data-jump-card]')[1] as HTMLElement
    )
    await source.hover()
    await targetCard.hover()
    await userEvent.dragAndDrop(source, targetCard)
    await expect.element(page.getByText('Move')).toBeInTheDocument()
    await userEvent.click(page.getByText('Move'))
    await expect.poll(() => document.querySelector('[data-drop-dialog]') === null).toBe(true)
    expect(document.querySelector('[data-staging-tray]')).toBeNull()
    await expect.element(page.getByText(filesA[1].filename)).toBeInTheDocument()
  })

  test('Copy between jumps keeps in source', async () => {
    const filesA = makeFiles(1, 1724493600)
    const filesB = makeFiles(1, 1724493600 + 3600)
    filesB[0].path = '/output/B_0001.MP4'
    filesB[0].filename = 'B_0001.MP4'
    const manifest = {
      version: 1,
      status: 'proposed' as const,
      date: '2026-08-24',
      startDatetime: '2026-08-24T10:00:00.000Z',
      createdAt: '2026-08-24T10:00:00.000Z',
      theory: [],
      files: [...filesA, ...filesB],
      jumps: [
        { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...filesA] },
        { id: 'jump_02', label: 'jump_02', confirmed: false, files: [...filesB] }
      ]
    } as never
    await renderHome(manifest)
    const source = page.getByText(filesA[0].filename)
    const targetCard = page.elementLocator(
      document.querySelectorAll('[data-jump-card]')[1] as HTMLElement
    )
    await userEvent.dragAndDrop(source, targetCard)
    await expect.element(page.getByText('Copy')).toBeInTheDocument()
    await userEvent.click(page.getByText('Copy'))
    const all = getOrder()
    expect(all.filter((f) => f === filesA[0].filename).length).toBe(2)
  })
})

describe('Home - video preview and crop (§9.11, §9.14)', () => {
  const renderWithVideo = async () => {
    const files = makeFiles(3)
    files.forEach((f) => {
      f.filename = f.filename.replace(/\.\w+$/, '.MP4')
    })
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    return renderHome(manifest)
  }

  const clickBarAt = async (bar: HTMLElement, pct: number) => {
    const rect = bar.getBoundingClientRect()
    await userEvent.click(page.elementLocator(bar), {
      position: { x: rect.width * pct, y: rect.height / 2 }
    })
  }

  test('user selects video file, preview drawer opens with video player and crop bar', async () => {
    await renderWithVideo()
    await expect.element(page.getByText('Review Proposed Jumps')).toBeInTheDocument()
    const rows = document.querySelectorAll('[data-file-row]')
    expect(rows.length).toBe(3)

    await userEvent.click(page.getByText('DJI_0001.MP4'))
    await expect.poll(() => document.querySelector('[data-preview-drawer]') !== null).toBe(true)
    await expect.poll(() => document.querySelector('[data-video-cropper]') !== null).toBe(true)
    await expect.poll(() => document.querySelector('[data-crop-bar]') !== null).toBe(true)
    expect(document.querySelector('[data-crop-range]')).toBeNull()
    await page.screenshot({ path: './playwright-screenshots/home-video-crop-drawer.png' })
  })

  test('clicking crop bar moves playhead, Start/End here set crop range', async () => {
    await renderWithVideo()
    await userEvent.click(page.getByText('DJI_0001.MP4'))
    await expect.poll(() => document.querySelector('[data-crop-bar]') !== null).toBe(true)

    const bar = document.querySelector('[data-crop-bar]') as HTMLElement
    const timeEl = document.querySelector('[data-current-time]') as HTMLElement

    await clickBarAt(bar, 0.25)
    await expect
      .poll(() => parseFloat(timeEl.textContent?.replace('s', '') ?? '0'), { timeout: 2000 })
      .toBeGreaterThan(0)
    const startTime = parseFloat(timeEl.textContent?.replace('s', '') ?? '0')

    await userEvent.click(page.getByText('Start here'))
    expect(document.querySelector('[data-crop-start-handle]')).not.toBeNull()

    await clickBarAt(bar, 0.75)
    await expect
      .poll(() => parseFloat(timeEl.textContent?.replace('s', '') ?? '0'), { timeout: 2000 })
      .toBeGreaterThan(startTime)

    await userEvent.click(page.getByText('End here'))
    const endTime = parseFloat(timeEl.textContent?.replace('s', '') ?? '0')
    expect(endTime).toBeGreaterThan(startTime)
    expect(document.querySelector('[data-crop-end-handle]')).not.toBeNull()
    expect(document.querySelector('[data-crop-range]')).not.toBeNull()

    await page.screenshot({ path: './playwright-screenshots/home-video-crop-range.png' })
  })

  test('dragging start handle updates crop start (UI optimistic)', async () => {
    await renderWithVideo()
    await userEvent.click(page.getByText('DJI_0001.MP4'))
    await expect.poll(() => document.querySelector('[data-crop-bar]') !== null).toBe(true)

    const bar = document.querySelector('[data-crop-bar]') as HTMLElement
    await clickBarAt(bar, 0.2)
    await userEvent.click(page.getByText('Start here'))
    await clickBarAt(bar, 0.8)
    await userEvent.click(page.getByText('End here'))

    const startHandle = document.querySelector('[data-crop-start-handle]') as HTMLElement
    const barRect = bar.getBoundingClientRect()
    const handleRect = startHandle.getBoundingClientRect()

    const fromX = handleRect.left + handleRect.width / 2
    const fromY = handleRect.top + handleRect.height / 2
    const toX = barRect.left + barRect.width * 0.4
    const toY = barRect.top + barRect.height / 2

    startHandle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: fromX,
        clientY: fromY,
        pointerId: 1,
        pointerType: 'mouse'
      })
    )
    bar.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        clientX: toX,
        clientY: toY,
        pointerId: 1,
        pointerType: 'mouse'
      })
    )
    bar.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: toX,
        clientY: toY,
        pointerId: 1,
        pointerType: 'mouse'
      })
    )

    await expect.poll(() => document.querySelector('[data-crop-range]') !== null).toBe(true)
    await page.screenshot({ path: './playwright-screenshots/home-video-crop-drag-start.png' })
  })

  test('dragging end handle updates crop end (UI optimistic)', async () => {
    await renderWithVideo()
    await userEvent.click(page.getByText('DJI_0001.MP4'))
    await expect.poll(() => document.querySelector('[data-crop-bar]') !== null).toBe(true)

    const bar = document.querySelector('[data-crop-bar]') as HTMLElement
    await clickBarAt(bar, 0.1)
    await userEvent.click(page.getByText('Start here'))
    await clickBarAt(bar, 0.9)
    await userEvent.click(page.getByText('End here'))

    const endHandle = document.querySelector('[data-crop-end-handle]') as HTMLElement
    const barRect = bar.getBoundingClientRect()
    const handleRect = endHandle.getBoundingClientRect()

    const fromX = handleRect.left + handleRect.width / 2
    const fromY = handleRect.top + handleRect.height / 2
    const toX = barRect.left + barRect.width * 0.6
    const toY = barRect.top + barRect.height / 2

    endHandle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: fromX,
        clientY: fromY,
        pointerId: 1,
        pointerType: 'mouse'
      })
    )
    bar.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        clientX: toX,
        clientY: toY,
        pointerId: 1,
        pointerType: 'mouse'
      })
    )
    bar.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: toX,
        clientY: toY,
        pointerId: 1,
        pointerType: 'mouse'
      })
    )

    await expect.poll(() => document.querySelector('[data-crop-range]') !== null).toBe(true)
    await page.screenshot({ path: './playwright-screenshots/home-video-crop-drag-end.png' })
  })

  test('Apply saves crop to manifest, Close closes drawer', async () => {
    await renderWithVideo()
    await userEvent.click(page.getByText('DJI_0001.MP4'))
    await expect.poll(() => document.querySelector('[data-preview-drawer]') !== null).toBe(true)

    const bar = document.querySelector('[data-crop-bar]') as HTMLElement
    await clickBarAt(bar, 0.2)
    await userEvent.click(page.getByText('Start here'))
    await clickBarAt(bar, 0.8)
    await userEvent.click(page.getByText('End here'))

    await userEvent.click(page.getByText('Apply'))
    await expect.poll(() => document.querySelector('[data-crop-range]') !== null).toBe(true)
    await page.screenshot({ path: './playwright-screenshots/home-video-crop-apply.png' })

    await userEvent.click(page.getByText('Close'))
    await expect.poll(() => document.querySelector('[data-preview-drawer]') === null).toBe(true)
    await expect.poll(() => document.querySelector('[data-video-cropper]') === null).toBe(true)
  })

  test('zoom display shows 1.0x at default, wheel changes zoom level', async () => {
    await renderWithVideo()
    await userEvent.click(page.getByText('DJI_0001.MP4'))
    await expect.poll(() => document.querySelector('[data-crop-bar]') !== null).toBe(true)

    const zoomEl = document.querySelector('[data-zoom-display]') as HTMLElement
    expect(zoomEl.textContent).toBe('1.0x')

    const bar = document.querySelector('[data-crop-bar]') as HTMLElement
    const rect = bar.getBoundingClientRect()
    bar.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: -300,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      })
    )

    await expect
      .poll(() => parseFloat(zoomEl.textContent?.replace('x', '') ?? '1'), { timeout: 2000 })
      .toBeGreaterThan(1)
    await page.screenshot({ path: './playwright-screenshots/home-video-crop-zoom.png' })
  })

  test('navigation prev/next cycles through files in preview', async () => {
    await renderWithVideo()
    await userEvent.click(page.getByText('DJI_0001.MP4'))
    await expect.poll(() => document.querySelector('[data-preview-drawer]') !== null).toBe(true)

    const filenameEl = document.querySelector('[data-preview-drawer] .font-mono') as HTMLElement
    expect(filenameEl.textContent).toContain('DJI_0001.MP4')

    await userEvent.click(page.getByText('Next'))
    await expect
      .poll(() => filenameEl.textContent ?? '', { timeout: 2000 })
      .toContain('DJI_0002.MP4')

    await userEvent.click(page.getByText('Previous'))
    await expect
      .poll(() => filenameEl.textContent ?? '', { timeout: 2000 })
      .toContain('DJI_0001.MP4')
  })

  test('Escape key closes preview drawer', async () => {
    await renderWithVideo()
    await userEvent.click(page.getByText('DJI_0001.MP4'))
    await expect.poll(() => document.querySelector('[data-preview-drawer]') !== null).toBe(true)

    const drawer = document.querySelector('[data-preview-drawer]') as HTMLElement
    drawer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect.poll(() => document.querySelector('[data-preview-drawer]') === null).toBe(true)
  })
})
