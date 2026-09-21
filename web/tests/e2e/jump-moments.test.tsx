import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { PreviewDrawer } from '../../app/components/preview-drawer'

/* Where the jump is in a clip, shown on the timeline it belongs to and correctable there. The
   exit decides where the music starts, so it is never beyond argument (RULES, Where the jump is in
   a clip). */

type Moments = { exit: number; opening?: number; canopy?: number; landing?: number }

const clip = (moments: Moments | null | undefined) => ({
  path: '/o/original_files/2026-09-13/GX018663.MP4',
  size: 1,
  mtime: 1,
  filename: 'GX018663.MP4',
  id: 'g1',
  moments
})

const Drawer = ({
  moments,
  onMomentChange,
  tandem = true
}: {
  moments: Moments | null | undefined
  onMomentChange?: (which: 'exit' | 'opening' | 'canopy' | 'landing', seconds: number) => void
  tandem?: boolean
}) =>
  createElement(PreviewDrawer, {
    files: [clip(moments)],
    index: 0,
    frame: null,
    onFrameChange: () => {},
    rotation: 0,
    onRotate: () => {},
    onClose: () => {},
    onPrevious: () => {},
    onNext: () => {},
    cropStart: null,
    cropEnd: null,
    zoom: 1,
    currentTime: 0,
    duration: 191,
    onSeek: () => {},
    onCropChange: () => {},
    onApply: () => {},
    onZoomChange: () => {},
    onDurationChange: () => {},
    onVideoRef: () => {},
    onMomentChange,
    tandem
  })

describe('where the jump is in a clip', () => {
  test('is marked on the timeline, each moment in its place', async () => {
    await render(
      createElement(Drawer, { moments: { exit: 38, opening: 91, canopy: 94, landing: 185 } })
    )

    for (const [which, at] of [
      ['exit', 38],
      ['opening', 91],
      ['canopy', 94],
      ['landing', 185]
    ] as const) {
      const mark = document.querySelector(`[data-moment=${which}]`)
      expect(mark).toBeTruthy()
      /* 191 seconds of clip, so the mark sits at that share of the bar */
      const along = Number(/left: ([\d.]+)%/.exec(mark?.getAttribute('style') ?? '')?.[1])
      expect(along).toBeCloseTo((at / 191) * 100, 1)
    }
  })

  test('is read out as well, so a moment can be gone to', async () => {
    await render(createElement(Drawer, { moments: { exit: 38, opening: 91, canopy: 94 } }))
    await expect.element(page.getByRole('button', { name: /exit 0:38/i })).toBeVisible()
    /* both ends of the canopy: the tug that ends the freefall and the canopy overhead after it */
    await expect.element(page.getByRole('button', { name: /opening 1:31/i })).toBeVisible()
    await expect.element(page.getByRole('button', { name: /canopy 1:34/i })).toBeVisible()
  })

  /* A fun jump is filmed by somebody who follows the group out, so the jump is on screen a second
     before their own camera leaves — and that second is where the cut starts (RULES, Where the jump
     is in a clip). */
  test('starts a fun jump a second before the camera left', async () => {
    await render(createElement(Drawer, { moments: { exit: 38, canopy: 94 }, tandem: false }))
    await expect.element(page.getByRole('button', { name: /exit 0:37/i })).toBeVisible()
    const mark = document.querySelector('[data-moment=exit]')
    const along = Number(/left: ([\d.]+)%/.exec(mark?.getAttribute('style') ?? '')?.[1])
    expect(along).toBeCloseTo((37 / 191) * 100, 1)
    /* only the exit leads; the canopy is where it was measured */
    await expect.element(page.getByRole('button', { name: /canopy 1:34/i })).toBeVisible()
  })

  /* Most clips are not jumps: ground footage, a plane ride, a camera that writes nothing down. */
  test('says plainly when a clip has no jump in it', async () => {
    await render(createElement(Drawer, { moments: null }))
    await expect.element(page.getByText(/no exit found/i)).toBeVisible()
    expect(document.querySelector('[data-moment=exit]')).toBeNull()
  })

  test('shows no marks at all for a clip nobody has asked about', async () => {
    await render(createElement(Drawer, { moments: undefined }))
    expect(document.querySelector('[data-moment]')).toBeNull()
    expect(document.body.textContent).not.toContain('No exit found')
  })

})

/* the exit dragged a quarter of the way along, and what that reported */
const dragExit = async (tandem: boolean) => {
  const moved = vi.fn()
  /* one drawer at a time, since this is asked twice over in one test */
  const drawer = await render(
    createElement(Drawer, { moments: { exit: 38, canopy: 94 }, onMomentChange: moved, tandem })
  )
  const mark = drawer.container.querySelector('[data-moment=exit]')
  if (!mark) throw new Error('the exit was not marked')
  const bar = drawer.container.querySelector('[data-crop-bar]')
  if (!bar) throw new Error('there is no timeline')
  const box = bar.getBoundingClientRect()

  mark.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: box.left + box.width * 0.2 })
  )
  bar.dispatchEvent(
    new PointerEvent('pointermove', { bubbles: true, clientX: box.left + box.width * 0.25 })
  )
  expect(moved).toHaveBeenCalled()
  const said = moved.mock.calls[moved.mock.calls.length - 1] as [
    'exit' | 'opening' | 'canopy' | 'landing',
    number
  ]
  drawer.unmount()
  return said
}

describe('a mark put right by hand', () => {
  /* A camera can be a second or two out, and the music is hung on this — so it is a mark to drag,
     not a verdict. */
  test('is dragged to where it should have been', async () => {
    const [which, seconds] = await dragExit(true)
    expect(which).toBe('exit')
    /* a quarter of the way along 191 seconds */
    expect(seconds).toBeGreaterThan(40)
    expect(seconds).toBeLessThan(56)
  })

  /* What is dragged on a fun jump is the cut, which runs a second ahead of the measurement. What is
     written down is the measurement, or the lead would be eaten a second at a time. */
  test('records the measurement, not the second of lead in front of it', async () => {
    const [, asTandem] = await dragExit(true)
    const [, asFunJump] = await dragExit(false)
    expect(asFunJump).toBeCloseTo(asTandem + 1, 5)
  })
})
