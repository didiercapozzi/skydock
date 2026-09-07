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

const renderHome = async (
  manifest: unknown,
  action: (args: { request: Request }) => Promise<unknown> = async () => ({ ok: true })
) => {
  const Stub = createRoutesStub([
    { path: '/', Component: Home, loader: () => ({ manifest }) },
    { path: '/api/manifest', action }
  ])
  const result = await render(createElement(Stub, { initialEntries: ['/'] }))
  return result
}

type StubFile = { path: string; mtime: number; filename: string; size: number }

type StubJump = {
  id: string
  label: string
  confirmed: boolean
  processed?: boolean | null
  files: StubFile[]
}

const mergeStubJumps = (jumps: StubJump[], leftId: string, rightId: string): StubJump[] => {
  if (leftId === rightId) return jumps
  const left = jumps.find((j) => j.id === leftId)
  const right = jumps.find((j) => j.id === rightId)
  if (!left || !right) return jumps
  const seen = new Set(left.files.map((f) => f.path))
  const additions = right.files.filter((f) => !seen.has(f.path))
  const files = [...left.files, ...additions].sort((a, b) => a.mtime - b.mtime)
  return jumps
    .filter((j) => j.id !== rightId)
    .map((j) =>
      j.id === leftId
        ? { ...j, files, confirmed: left.confirmed && right.confirmed, processed: false }
        : j
    )
}

const makeMergeAction =
  (manifest: { jumps: StubJump[] }) =>
  async ({ request }: { request: Request }) => {
    const body = (await request.json()) as {
      intent: string
      leftId?: string
      rightId?: string
      anchorEpoch?: number
    }
    if (body.intent === 'merge-jumps' && body.leftId && body.rightId) {
      const merged = mergeStubJumps(manifest.jumps, body.leftId, body.rightId)
      if (typeof body.anchorEpoch === 'number' && Number.isFinite(body.anchorEpoch)) {
        const target = merged.find((j) => j.id === body.leftId)
        if (target && target.files.length > 0) {
          const min = Math.min(...target.files.map((f) => f.mtime))
          const offset = Math.round(body.anchorEpoch) - min
          if (offset !== 0) {
            for (const f of target.files) f.mtime += offset
          }
        }
      }
      return { jumps: merged }
    }
    return { ok: true }
  }

const expandAllJumpCards = async () => {
  const toggles = document.querySelectorAll('[data-jump-card-toggle]')
  for (const toggle of Array.from(toggles)) {
    await userEvent.click(page.elementLocator(toggle as HTMLElement))
  }
}

describe('Home - 9.4.1 empty', () => {
  test('renders No Manifest Found when no manifest', async () => {
    const Stub = createRoutesStub([
      { path: '/', Component: Home, loader: () => ({ manifest: null }) }
    ])
    const { getByText } = await render(createElement(Stub, { initialEntries: ['/'] }))
    await expect.element(getByText('No Manifest Found')).toBeInTheDocument()
    await page.screenshot({ path: './playwright-screenshots/home-no-manifest.png' })
  })
})

describe('Home - 9.3.3 within-jump reorder', () => {
  test('reorders file 8 to second position via drag and drop', async () => {
    const files = makeFiles(10)
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never

    const { getByText } = await renderHome(manifest)
    await expect.element(getByText('Review Proposed Jumps')).toBeInTheDocument()

    await expandAllJumpCards()

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

describe('Home - 9.3.3 drag sources', () => {
  test('file row is draggable and carries single file', async () => {
    const files = makeFiles(3)
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    await renderHome(manifest)
    await expandAllJumpCards()
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
    await expandAllJumpCards()
    expect(document.querySelector('[data-staging-tray]')).toBeNull()
    const checkbox = document.querySelector('[data-file-row] input[type="checkbox"]') as HTMLElement
    await userEvent.click(page.elementLocator(checkbox))
    await expect.element(page.getByText(/file selected/)).toBeInTheDocument()
    const tray = document.querySelector('[data-staging-tray]') as HTMLElement
    expect(tray.getAttribute('draggable')).toBe('true')
  })
})

describe('Home - 9.3.3 drop targets', () => {
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
    await expandAllJumpCards()
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
    await expandAllJumpCards()
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

describe('Home - 9.3.3 constraints', () => {
  test('drop indicator visible during drag over', async () => {
    const files = makeFiles(3)
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    await renderHome(manifest)
    await expandAllJumpCards()
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
    await expandAllJumpCards()
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

describe('Home - 9.3.2 staging tray', () => {
  test('tray visible when selected, hidden after Clear, not a drop target', async () => {
    const files = makeFiles(2)
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    await renderHome(manifest)
    await expandAllJumpCards()
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
    await expandAllJumpCards()
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

describe('Home - 9.3.3 user interactions', () => {
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
    await expandAllJumpCards()
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
    await expandAllJumpCards()
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

describe('Home - collapsible jump cards', () => {
  test('jump cards are collapsed by default, click to expand', async () => {
    const files = makeFiles(3)
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    await renderHome(manifest)

    const fileRows = document.querySelectorAll('[data-file-row]')
    expect(fileRows.length).toBe(0)

    const toggleButton = document.querySelector('[data-jump-card-toggle]') as HTMLElement
    expect(toggleButton).not.toBeNull()
    await page.screenshot({ path: './playwright-screenshots/home-collapsed-card.png' })

    await userEvent.click(page.elementLocator(toggleButton))

    await expect.poll(() => document.querySelectorAll('[data-file-row]').length).toBe(3)
    await page.screenshot({ path: './playwright-screenshots/home-expanded-card.png' })
  })

  test('click toggle again collapses the card', async () => {
    const files = makeFiles(3)
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    await renderHome(manifest)

    const toggleButton = document.querySelector('[data-jump-card-toggle]') as HTMLElement
    await userEvent.click(page.elementLocator(toggleButton))
    await expect.poll(() => document.querySelectorAll('[data-file-row]').length).toBe(3)

    await userEvent.click(page.elementLocator(toggleButton))
    await expect.poll(() => document.querySelectorAll('[data-file-row]').length).toBe(0)
    await page.screenshot({ path: './playwright-screenshots/home-recollapsed-card.png' })
  })
})

describe('Home - selected file distinct background when preview open', () => {
  test('file being previewed has distinct background styling', async () => {
    const files = makeFiles(3)
    files.forEach((f) => {
      f.filename = f.filename.replace(/\.\w+$/, '.MP4')
    })
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    await renderHome(manifest)
    await expandAllJumpCards()

    const firstRow = document.querySelector('[data-file-row]') as HTMLElement
    const initialClasses = firstRow.className

    await userEvent.click(page.getByText('DJI_0001.MP4'))
    await expect.poll(() => document.querySelector('[data-preview-drawer]') !== null).toBe(true)

    const previewedRow = document.querySelector('[data-file-row]') as HTMLElement
    expect(previewedRow.className).not.toBe(initialClasses)
    expect(previewedRow.className).toContain('ring-purple')
    await page.screenshot({ path: './playwright-screenshots/home-previewed-file-highlight.png' })
  })
})

describe('Home - jump comparison dialog', () => {
  const makeTwoJumpManifest = () => {
    const filesA = makeFiles(3, 1724493600)
    const filesB = makeFiles(2, 1724493600 + 3600)
    filesB.forEach((f) => {
      f.path = `/output/B_${f.filename}`
      f.filename = `B_${f.filename}`
    })
    return {
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
  }

  test('compare checkbox selects jumps, max 2', async () => {
    await renderHome(makeTwoJumpManifest())
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    expect(checkboxes.length).toBe(2)

    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await expect.element(page.getByText('1 jump selected')).toBeInTheDocument()

    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))
    await expect.element(page.getByText('2 jumps selected')).toBeInTheDocument()

    await page.screenshot({ path: './playwright-screenshots/home-compare-selected.png' })
  })

  test('compare button opens comparison dialog', async () => {
    await renderHome(makeTwoJumpManifest())
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))

    await userEvent.click(page.getByText('Compare'))
    await expect.poll(() => document.querySelector('[data-comparison-dialog]') !== null).toBe(true)
    await page.screenshot({ path: './playwright-screenshots/home-comparison-dialog.png' })
  })

  test('comparison dialog shows both jumps side by side', async () => {
    await renderHome(makeTwoJumpManifest())
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))
    await userEvent.click(page.getByText('Compare'))

    await expect.poll(() => document.querySelector('[data-comparison-dialog]') !== null).toBe(true)
    const leftSide = document.querySelector('[data-compare-side="left"]') as HTMLElement
    const rightSide = document.querySelector('[data-compare-side="right"]') as HTMLElement
    expect(leftSide).not.toBeNull()
    expect(rightSide).not.toBeNull()
    expect(leftSide.textContent).toContain('jump_01')
    expect(rightSide.textContent).toContain('jump_02')
  })

  test('comparison dialog shows files for each jump', async () => {
    await renderHome(makeTwoJumpManifest())
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))
    await userEvent.click(page.getByText('Compare'))

    await expect.poll(() => document.querySelector('[data-comparison-dialog]') !== null).toBe(true)
    const leftFiles = document.querySelectorAll('[data-compare-side="left"] [data-compare-file]')
    const rightFiles = document.querySelectorAll('[data-compare-side="right"] [data-compare-file]')
    expect(leftFiles.length).toBe(3)
    expect(rightFiles.length).toBe(2)
  })

  test('comparison dialog has navigation to browse files', async () => {
    await renderHome(makeTwoJumpManifest())
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))
    await userEvent.click(page.getByText('Compare'))

    await expect.poll(() => document.querySelector('[data-comparison-dialog]') !== null).toBe(true)
    await expect.element(page.getByText('Merge')).toBeInTheDocument()
    await expect.element(page.getByText('Close')).toBeInTheDocument()
  })

  test('comparison dialog close button closes dialog', async () => {
    await renderHome(makeTwoJumpManifest())
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))
    await userEvent.click(page.getByText('Compare'))

    await expect.poll(() => document.querySelector('[data-comparison-dialog]') !== null).toBe(true)
    await userEvent.click(page.getByText('Close'))
    await expect.poll(() => document.querySelector('[data-comparison-dialog]') === null).toBe(true)
  })

  test('merge combines both jumps sorted by mtime and closes dialog', async () => {
    const manifest = makeTwoJumpManifest()
    await renderHome(manifest, makeMergeAction(manifest))
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))
    await userEvent.click(page.getByText('Compare'))

    await expect.poll(() => document.querySelector('[data-comparison-dialog]') !== null).toBe(true)
    await userEvent.click(page.getByText('Merge'))
    await expect.poll(() => document.querySelector('[data-merge-date-popup]') !== null).toBe(true)
    await userEvent.click(page.getByText('Confirm merge'))
    await expect.poll(() => document.querySelector('[data-comparison-dialog]') === null).toBe(true)
    await expect.element(page.getByText('1 jump')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('jumps selected')
    expect(document.body.textContent).not.toContain('jump selected')

    await expandAllJumpCards()
    expect(getOrder()).toEqual([
      'DJI_0001.MP4',
      'DJI_0002.MP4',
      'DJI_0003.MP4',
      'B_DJI_0001.MP4',
      'B_DJI_0002.MP4'
    ])
  })

  test('merge dedupes files present in both jumps', async () => {
    const filesA = makeFiles(3, 1724493600)
    const extra = makeFiles(1, 1724493600 + 3600)
    extra[0].path = `/output/B_${extra[0].filename}`
    extra[0].filename = `B_${extra[0].filename}`
    const manifest = {
      version: 1,
      status: 'proposed' as const,
      date: '2026-08-24',
      startDatetime: '2026-08-24T10:00:00.000Z',
      createdAt: '2026-08-24T10:00:00.000Z',
      theory: [],
      files: [...filesA, ...extra],
      jumps: [
        { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...filesA] },
        { id: 'jump_02', label: 'jump_02', confirmed: false, files: [filesA[0], ...extra] }
      ]
    } as never
    await renderHome(manifest, makeMergeAction(manifest))
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))
    await userEvent.click(page.getByText('Compare'))

    await expect.poll(() => document.querySelector('[data-comparison-dialog]') !== null).toBe(true)
    await userEvent.click(page.getByText('Merge'))
    await expect.poll(() => document.querySelector('[data-merge-date-popup]') !== null).toBe(true)
    await userEvent.click(page.getByText('Confirm merge'))
    await expect.poll(() => document.querySelector('[data-comparison-dialog]') === null).toBe(true)

    await expandAllJumpCards()
    expect(document.querySelectorAll('[data-file-row]').length).toBe(4)
  })

  test('merge opens date popup with jump choices and cancel keeps dialog', async () => {
    const manifest = makeTwoJumpManifest()
    await renderHome(manifest, makeMergeAction(manifest))
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))
    await userEvent.click(page.getByText('Compare'))

    await expect.poll(() => document.querySelector('[data-comparison-dialog]') !== null).toBe(true)
    await userEvent.click(page.getByText('Merge'))
    await expect.poll(() => document.querySelector('[data-merge-date-popup]') !== null).toBe(true)
    expect(document.querySelectorAll('[data-date-choice]').length).toBe(3)
    await expect.element(page.getByText('Merge date')).toBeInTheDocument()
    await expect.element(page.getByText('Custom')).toBeInTheDocument()

    await userEvent.click(page.getByText('Cancel'))
    await expect.poll(() => document.querySelector('[data-merge-date-popup]') === null).toBe(true)
    await expect.poll(() => document.querySelector('[data-comparison-dialog]') !== null).toBe(true)
  })

  test('merge with right date shifts jump to that day', async () => {
    const day1 = 1724493600
    const day2 = day1 + 86400 * 3
    const filesA = makeFiles(3, day1)
    const filesB = makeFiles(2, day2)
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
    await renderHome(manifest, makeMergeAction(manifest))
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))
    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await userEvent.click(page.getByText('Compare'))

    await expect.poll(() => document.querySelector('[data-comparison-dialog]') !== null).toBe(true)
    await userEvent.click(page.getByText('Merge'))
    await expect.poll(() => document.querySelector('[data-merge-date-popup]') !== null).toBe(true)
    const rightChoice = document.querySelector('[data-date-choice="right"]') as HTMLElement
    await userEvent.click(page.elementLocator(rightChoice))
    await userEvent.click(page.getByText('Confirm merge'))
    await expect.poll(() => document.querySelector('[data-comparison-dialog]') === null).toBe(true)

    const expectedDate = new Date(day2 * 1000).toLocaleDateString('de-CH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    await expect.element(page.getByText(expectedDate)).toBeInTheDocument()
    await expandAllJumpCards()
    expect(document.querySelectorAll('[data-file-row]').length).toBe(5)
  })

  test('merge with custom date anchors earliest file', async () => {
    const manifest = makeTwoJumpManifest()
    await renderHome(manifest, makeMergeAction(manifest))
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))
    await userEvent.click(page.getByText('Compare'))

    await expect.poll(() => document.querySelector('[data-comparison-dialog]') !== null).toBe(true)
    await userEvent.click(page.getByText('Merge'))
    await expect.poll(() => document.querySelector('[data-merge-date-popup]') !== null).toBe(true)
    const customChoice = document.querySelector('[data-date-choice="custom"]') as HTMLElement
    await userEvent.click(page.elementLocator(customChoice))
    const dateInput = document.querySelector('[data-custom-date]') as HTMLElement
    const timeInput = document.querySelector('[data-custom-time]') as HTMLElement
    await userEvent.fill(page.elementLocator(dateInput), '2026-09-05')
    await userEvent.fill(page.elementLocator(timeInput), '08:30')
    await userEvent.click(page.getByText('Confirm merge'))
    await expect.poll(() => document.querySelector('[data-comparison-dialog]') === null).toBe(true)

    const expectedDate = new Date(2026, 8, 5).toLocaleDateString('de-CH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    await expect.element(page.getByText(expectedDate)).toBeInTheDocument()
  })

  test('merge button disabled when a displayed jump is processed', async () => {
    const filesA = makeFiles(3, 1724493600)
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
        { id: 'jump_02', label: 'jump_02', confirmed: false, processed: true, files: [...filesB] }
      ]
    } as never
    await renderHome(manifest)
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))
    await userEvent.click(page.getByText('Compare'))

    await expect.poll(() => document.querySelector('[data-comparison-dialog]') !== null).toBe(true)
    const mergeBtn = document.querySelector('[data-action="merge"]') as HTMLButtonElement
    expect(mergeBtn.disabled).toBe(true)
  })

  test('clear button deselects all jumps', async () => {
    await renderHome(makeTwoJumpManifest())
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))
    await expect.element(page.getByText('2 jumps selected')).toBeInTheDocument()

    await userEvent.click(page.getByText('Clear'))
    await expect.poll(() => document.querySelector('[data-comparison-dialog]') === null).toBe(true)
    expect(document.querySelector('[data-compare-left]')).toBeNull()
  })

  test('passenger add shows name as title and display labels', async () => {
    const files = makeFiles(2)
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    let saved: unknown = null
    await renderHome(manifest, async ({ request }: { request: Request }) => {
      saved = await request.json()
      return { ok: true }
    })
    await expect.element(page.getByText('jump_01')).toBeInTheDocument()
    await expandAllJumpCards()
    await expect.element(page.getByText('Add passenger')).toBeInTheDocument()
    expect(document.querySelector('[data-passenger-display]')).toBeNull()

    await userEvent.click(page.getByText('Add passenger'))
    const fillField = async (label: string, value: string) => {
      const input = document.querySelector(`input[aria-label="${label}"]`) as HTMLElement
      await userEvent.fill(page.elementLocator(input), value)
    }
    await fillField('Passenger firstname', 'John')
    await fillField('Passenger lastname', 'Doe')
    await fillField('Passenger email', 'john@example.com')
    await userEvent.click(page.getByText('Done'))

    await expect.poll(() => document.querySelector('[data-passenger-display]') !== null).toBe(true)
    await expect.element(page.getByRole('heading', { name: 'John Doe' })).toBeInTheDocument()
    expect(document.querySelector('[data-passenger-display]')?.textContent).toContain('John Doe')
    await expect
      .poll(
        () =>
          (saved as { jumps: Array<{ passenger?: { email?: string } }> } | null)?.jumps?.[0]
            ?.passenger?.email ?? null,
        { timeout: 5000 }
      )
      .toBe('john@example.com')
    const jumps = (saved as { jumps: Array<{ passenger: unknown }> }).jumps
    expect(jumps[0].passenger).toEqual({
      firstname: 'John',
      lastname: 'Doe',
      email: 'john@example.com'
    })
  })

  test('clearing passenger restores label and add button', async () => {
    const files = makeFiles(2)
    const manifest = makeManifest(files, [
      {
        id: 'jump_01',
        label: 'jump_01',
        confirmed: false,
        passenger: { firstname: 'John', lastname: 'Doe', email: 'john@example.com' },
        files: [...files]
      }
    ]) as never
    let saved: unknown = null
    await renderHome(manifest, async ({ request }: { request: Request }) => {
      saved = await request.json()
      return { ok: true }
    })
    await expect.element(page.getByText('John Doe')).toBeInTheDocument()
    await expandAllJumpCards()
    await expect.poll(() => document.querySelector('[data-passenger-display]') !== null).toBe(true)

    const display = document.querySelector('[data-passenger-display]') as HTMLElement
    await userEvent.click(page.elementLocator(display))
    const firstnameInput = document.querySelector(
      'input[aria-label="Passenger firstname"]'
    ) as HTMLInputElement
    expect(firstnameInput.value).toBe('John')

    const clearField = async (label: string) => {
      const input = document.querySelector(`input[aria-label="${label}"]`) as HTMLElement
      await userEvent.fill(page.elementLocator(input), '')
    }
    await clearField('Passenger firstname')
    await clearField('Passenger lastname')
    await clearField('Passenger email')
    await userEvent.click(page.getByText('Done'))

    await expect.poll(() => document.querySelector('[data-passenger-display]') === null).toBe(true)
    await expect.element(page.getByText('jump_01')).toBeInTheDocument()
    await expect.element(page.getByText('Add passenger')).toBeInTheDocument()
    await expect.poll(() => saved !== null, { timeout: 5000 }).toBe(true)
    const jumps = (saved as { jumps: Array<Record<string, unknown>> }).jumps
    expect('passenger' in jumps[0]).toBe(false)
  })

  test('process button disabled without complete passenger', async () => {
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
        {
          id: 'jump_02',
          label: 'jump_02',
          confirmed: false,
          passenger: { firstname: 'John', lastname: '', email: '' },
          files: [...filesB]
        }
      ]
    } as never
    await renderHome(manifest)
    const buttons = document.querySelectorAll(
      '[data-action="process"]'
    ) as NodeListOf<HTMLButtonElement>
    expect(buttons.length).toBe(2)
    for (const btn of Array.from(buttons)) {
      expect(btn.disabled).toBe(true)
      expect(btn.title).toBe('Add complete passenger details to process')
    }
  })

  test('process button processes jump and shows processed badge', async () => {
    const files = makeFiles(2)
    const manifest = makeManifest(files, [
      {
        id: 'jump_01',
        label: 'jump_01',
        confirmed: false,
        passenger: { firstname: 'John', lastname: 'Doe', email: 'john@example.com' },
        files: [...files]
      }
    ]) as never
    const processAction = async ({ request }: { request: Request }) => {
      const body = (await request.json()) as { intent: string; jumpId?: string }
      if (body.intent === 'process-jump' && body.jumpId) {
        const jumps = (manifest as unknown as { jumps: Array<{ id: string; processed?: boolean }> })
          .jumps
        const target = jumps.find((j) => j.id === body.jumpId)
        if (target) target.processed = true
        return { jumps }
      }
      return { ok: true }
    }
    await renderHome(manifest, processAction)
    const button = document.querySelector('[data-action="process"]') as HTMLButtonElement
    expect(button.disabled).toBe(false)
    expect(button.textContent).toBe('Process')

    await userEvent.click(page.elementLocator(button))
    await expect.poll(() => document.querySelector('[data-processed-badge]') !== null).toBe(true)
    await expect.element(page.getByText('Reprocess')).toBeInTheDocument()
  })

  test('upload button disabled until jump is processed', async () => {
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
        {
          id: 'jump_02',
          label: 'jump_02',
          confirmed: false,
          processed: true,
          passenger: { firstname: 'John', lastname: 'Doe', email: 'john@example.com' },
          files: [...filesB]
        }
      ]
    } as never
    await renderHome(manifest)
    const buttons = document.querySelectorAll(
      '[data-action="upload"]'
    ) as NodeListOf<HTMLButtonElement>
    expect(buttons.length).toBe(2)
    expect(buttons[0].disabled).toBe(true)
    expect(buttons[0].title).toBe('Process the jump first')
    expect(buttons[1].disabled).toBe(false)
  })

  test('upload flow shows share link and enables mail', async () => {
    const files = makeFiles(2)
    const manifest = makeManifest(files, [
      {
        id: 'jump_01',
        label: 'jump_01',
        confirmed: false,
        processed: true,
        passenger: { firstname: 'John', lastname: 'Doe', email: 'john@example.com' },
        files: [...files]
      }
    ]) as never
    const uploadAction = async ({ request }: { request: Request }) => {
      const body = (await request.json()) as { intent: string; jumpId?: string }
      if (body.intent === 'upload-jump' && body.jumpId) {
        const jumps = (manifest as unknown as { jumps: Array<{ id: string; publish?: unknown }> })
          .jumps
        const target = jumps.find((j) => j.id === body.jumpId)
        if (target) target.publish = { shareUrl: 'https://nas.local:5001/sharing/demo123' }
        return { jumps }
      }
      return { ok: true }
    }
    await renderHome(manifest, uploadAction)
    await expandAllJumpCards()
    await expect.element(page.getByText('Upload to get a share link.')).toBeInTheDocument()

    const uploadBtn = document.querySelector('[data-action="upload"]') as HTMLButtonElement
    await userEvent.click(page.elementLocator(uploadBtn))
    await expect
      .poll(() => document.querySelector('[data-share-section] a[href]') !== null, {
        timeout: 5000
      })
      .toBe(true)
    const link = document.querySelector('[data-share-section] a[href]') as HTMLAnchorElement
    expect(link.href).toBe('https://nas.local:5001/sharing/demo123')
    const mailBtn = document.querySelector('[data-action="mail"]') as HTMLButtonElement
    expect(mailBtn.disabled).toBe(false)
  })

  test('mail opens gmail and mark as sent disables it', async () => {
    const opened: string[] = []
    vi.stubGlobal('open', (url: string) => {
      opened.push(url)
      return null
    })
    try {
      const files = makeFiles(2)
      const manifest = makeManifest(files, [
        {
          id: 'jump_01',
          label: 'jump_01',
          confirmed: false,
          processed: true,
          passenger: { firstname: 'John', lastname: 'Doe', email: 'john@example.com' },
          publish: { shareUrl: 'https://nas.local:5001/sharing/demo123' },
          files: [...files]
        }
      ]) as never
      let saved: unknown = null
      await renderHome(manifest, async ({ request }: { request: Request }) => {
        saved = await request.json()
        return { ok: true }
      })
      await expandAllJumpCards()

      const mailto = document.querySelector('[data-action="mailto"]') as HTMLAnchorElement
      expect(mailto.href.startsWith('mailto:john@example.com?')).toBe(true)
      expect(mailto.href).toContain(encodeURIComponent('https://nas.local:5001/sharing/demo123'))

      await userEvent.click(
        page.elementLocator(document.querySelector('[data-action="mail"]') as HTMLElement)
      )
      await expect.poll(() => opened.length > 0, { timeout: 5000 }).toBe(true)
      expect(opened[0]).toContain('mail.google.com/mail')
      expect(opened[0]).toContain(encodeURIComponent('john@example.com'))
      expect(opened[0]).toContain(encodeURIComponent('https://nas.local:5001/sharing/demo123'))

      await expect.element(page.getByText('Mark as sent')).toBeInTheDocument()
      await userEvent.click(page.getByText('Mark as sent'))
      await expect.poll(() => document.querySelector('[data-mailed-badge]') !== null).toBe(true)
      const mailed = document.querySelector('[data-mailed-badge]') as HTMLElement
      expect(mailed.title).toContain('Sent on')
      await expect
        .poll(
          () =>
            (saved as { jumps: Array<{ publish?: { emailedAt?: string } }> } | null)?.jumps?.[0]
              ?.publish?.emailedAt ?? null,
          { timeout: 5000 }
        )
        .not.toBe(null)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('header buttons do not collapse an expanded card', async () => {
    const files = makeFiles(2)
    const manifest = makeManifest(files, [
      {
        id: 'jump_01',
        label: 'jump_01',
        confirmed: false,
        processed: true,
        passenger: { firstname: 'John', lastname: 'Doe', email: 'john@example.com' },
        files: [...files]
      }
    ]) as never
    await renderHome(manifest)
    await expandAllJumpCards()
    await expect.element(page.getByText('Upload to get a share link.')).toBeInTheDocument()
    const uploadBtn = document.querySelector('[data-action="upload"]') as HTMLElement
    await userEvent.click(page.elementLocator(uploadBtn))
    await expect.element(page.getByText('Upload to get a share link.')).toBeInTheDocument()
  })

  test('jump navigation buttons cycle through jumps', async () => {
    const filesC = makeFiles(2, 1724493600 + 7200)
    filesC.forEach((f) => {
      f.path = `/output/C_${f.filename}`
      f.filename = `C_${f.filename}`
    })
    const manifest = (() => {
      const filesA = makeFiles(3, 1724493600)
      const filesB = makeFiles(2, 1724493600 + 3600)
      filesB.forEach((f) => {
        f.path = `/output/B_${f.filename}`
        f.filename = `B_${f.filename}`
      })
      return {
        version: 1,
        status: 'proposed' as const,
        date: '2026-08-24',
        startDatetime: '2026-08-24T10:00:00.000Z',
        createdAt: '2026-08-24T10:00:00.000Z',
        theory: [],
        files: [...filesA, ...filesB, ...filesC],
        jumps: [
          { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...filesA] },
          { id: 'jump_02', label: 'jump_02', confirmed: false, files: [...filesB] },
          { id: 'jump_03', label: 'jump_03', confirmed: false, files: [...filesC] }
        ]
      }
    })() as never
    await renderHome(manifest)
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))
    await userEvent.click(page.getByText('Compare'))

    await expect.poll(() => document.querySelector('[data-comparison-dialog]') !== null).toBe(true)
    const leftSide = () => document.querySelector('[data-compare-side="left"]') as HTMLElement
    expect(leftSide().textContent).toContain('jump_01')

    const nextBtn = document.querySelector('[data-action="jump-next-left"]') as HTMLElement
    expect(nextBtn).not.toBeNull()
    nextBtn.scrollIntoView()
    await userEvent.click(page.elementLocator(nextBtn))

    await expect.poll(() => leftSide().textContent ?? '').toContain('jump_03')
    await page.screenshot({ path: './playwright-screenshots/home-comparison-navigate.png' })
  })

  test('clicking file shows preview area', async () => {
    const manifest = (() => {
      const filesA = makeFiles(3, 1724493600)
      filesA.forEach((f) => {
        f.filename = f.filename.replace(/\.\w+$/, '.MP4')
      })
      const filesB = makeFiles(2, 1724493600 + 3600)
      filesB.forEach((f) => {
        f.path = `/output/B_${f.filename}`
        f.filename = `B_${f.filename.replace(/\.\w+$/, '.MP4')}`
      })
      return {
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
      }
    })() as never
    await renderHome(manifest)
    const checkboxes = document.querySelectorAll('input[title="Select for comparison"]')
    await userEvent.click(page.elementLocator(checkboxes[0] as HTMLElement))
    await userEvent.click(page.elementLocator(checkboxes[1] as HTMLElement))
    await userEvent.click(page.getByText('Compare'))

    await expect.poll(() => document.querySelector('[data-comparison-dialog]') !== null).toBe(true)
    const leftFiles = document.querySelectorAll('[data-compare-side="left"] [data-compare-file]')
    await userEvent.click(page.elementLocator(leftFiles[1] as HTMLElement))

    await expect.poll(() => document.querySelector('[data-video-cropper]') !== null).toBe(true)
    await page.screenshot({ path: './playwright-screenshots/home-comparison-preview.png' })
  })
})

describe('Home - video preview and crop (§9.6)', () => {
  const renderWithVideo = async () => {
    const files = makeFiles(3)
    files.forEach((f) => {
      f.filename = f.filename.replace(/\.\w+$/, '.MP4')
    })
    const manifest = makeManifest(files, [
      { id: 'jump_01', label: 'jump_01', confirmed: false, files: [...files] }
    ]) as never
    const result = await renderHome(manifest)
    await expandAllJumpCards()
    return result
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
