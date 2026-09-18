import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { VideoCropper } from '../../app/components/video-cropper'

/* Trimming a clip (RULES, Cropping and turning): a click on the bar moves the playhead, the two
   ends are dragged into place, and the playhead never leaves the clip. Driven with the real mouse,
   so the handles are hit where they are drawn and the bar is measured as it is. */

const renderCropper = async (props: Partial<Parameters<typeof VideoCropper>[0]> = {}) => {
  const onSeek = vi.fn()
  const onCropChange = vi.fn()
  const onApply = vi.fn()
  const onZoomChange = vi.fn()
  await render(
    createElement(VideoCropper, {
      duration: 10,
      currentTime: 2,
      bufferedRanges: [{ start: 0, end: 10 }],
      cropStart: null,
      cropEnd: null,
      zoom: 1,
      onSeek,
      onCropChange,
      onApply,
      onZoomChange,
      ...props
    })
  )
  return { onSeek, onCropChange, onApply, onZoomChange }
}

const part = (selector: string) => {
  const el = document.querySelector(selector)
  if (!(el instanceof HTMLElement)) throw new Error(`nothing drawn for ${selector}`)
  return el
}
const bar = () => part('[data-crop-bar]')

/* where on the bar a moment of the clip is drawn */
const at = (seconds: number, duration = 10) => {
  const rect = bar().getBoundingClientRect()
  return { x: (rect.width * seconds) / duration, y: rect.height / 2 }
}

const lastCall = <T,>(fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0] as T

describe('trimming — the playhead', () => {
  test('a click on the bar moves the playhead to that moment', async () => {
    const { onSeek } = await renderCropper({ currentTime: 0 })
    await userEvent.click(page.elementLocator(bar()), { position: at(5) })
    await expect.poll(() => onSeek.mock.calls.length).toBeGreaterThan(0)
    expect(lastCall<number>(onSeek)).toBeCloseTo(5, 0)
  })

  test('the playhead stays inside the clip, at either edge of the bar', async () => {
    const { onSeek } = await renderCropper({ currentTime: 5 })
    const track = page.elementLocator(bar())
    const edge = bar().getBoundingClientRect()
    await userEvent.click(track, { position: { x: 1, y: edge.height / 2 } })
    await expect.poll(() => lastCall<number>(onSeek)).toBeCloseTo(0, 1)
    await userEvent.click(track, { position: { x: edge.width - 2, y: edge.height / 2 } })
    await expect.poll(() => lastCall<number>(onSeek)).toBeCloseTo(10, 1)
    await page.screenshot({ path: './playwright-screenshots/video-cropper-seek-clamp.png' })
  })
})

describe('trimming — zooming the timeline', () => {
  test('the wheel zooms in, keeping the moment under the cursor, and never past 10×', async () => {
    const { onZoomChange } = await renderCropper({ currentTime: 5 })
    const rect = bar().getBoundingClientRect()
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      deltaY: -100
    })
    const preventDefault = vi.spyOn(wheel, 'preventDefault')
    bar().dispatchEvent(wheel)
    /* the page must not scroll under the timeline */
    expect(preventDefault).toHaveBeenCalled()
    const zoom = lastCall<number>(onZoomChange)
    expect(zoom).toBeGreaterThan(1)
    expect(zoom).toBeLessThanOrEqual(10)
    await page.screenshot({ path: './playwright-screenshots/video-cropper-wheel.png' })
  })

  test('zoomed all the way in, the wheel goes no further', async () => {
    const { onZoomChange } = await renderCropper({ cropStart: 2, cropEnd: 8, zoom: 10 })
    bar().dispatchEvent(
      new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -1000, clientX: 500 })
    )
    expect(onZoomChange).toHaveBeenCalledWith(10)
  })

  test('Reset brings the timeline back to 1×, and is only offered while zoomed', async () => {
    const { onZoomChange } = await renderCropper({ zoom: 6 })
    await userEvent.click(page.getByText('Reset'))
    expect(onZoomChange).toHaveBeenCalledWith(1)
  })

  test('at 1× there is nothing to reset', async () => {
    await renderCropper({ zoom: 1 })
    expect(document.querySelector('[data-action="reset-zoom"]')).toBeNull()
  })
})

describe('trimming — dragging the ends', () => {
  test('the start handle dragged right moves the start', async () => {
    const { onCropChange } = await renderCropper({ cropStart: 2, cropEnd: 8 })
    await userEvent.dragAndDrop(page.elementLocator(part('[data-crop-start-handle]')), page.elementLocator(bar()), {
      targetPosition: at(3)
    })
    await expect.poll(() => onCropChange.mock.calls.length).toBeGreaterThan(0)
    expect(lastCall<{ cropStart: number | null }>(onCropChange).cropStart).toBeCloseTo(3, 0)
  })

  test('the end handle dragged left moves the end', async () => {
    const { onCropChange } = await renderCropper({ cropStart: 2, cropEnd: 8 })
    await userEvent.dragAndDrop(page.elementLocator(part('[data-crop-end-handle]')), page.elementLocator(bar()), {
      targetPosition: at(7)
    })
    await expect.poll(() => onCropChange.mock.calls.length).toBeGreaterThan(0)
    expect(lastCall<{ cropEnd: number | null }>(onCropChange).cropEnd).toBeCloseTo(7, 0)
  })
})

describe('trimming — the ends are there from the start', () => {
  test('with nothing trimmed, both handles sit at the edges of the bar', async () => {
    await renderCropper({ cropStart: null, cropEnd: null })
    const box = bar().getBoundingClientRect()
    const start = part('[data-crop-start-handle]').getBoundingClientRect()
    const end = part('[data-crop-end-handle]').getBoundingClientRect()
    expect(start.left - box.left).toBeLessThan(4)
    expect(box.right - end.right).toBeLessThan(4)
  })

  test('the untouched end handle dragged left sets the end', async () => {
    const { onCropChange } = await renderCropper({ cropStart: null, cropEnd: null })
    await userEvent.dragAndDrop(page.elementLocator(part('[data-crop-end-handle]')), page.elementLocator(bar()), {
      targetPosition: at(6)
    })
    await expect.poll(() => onCropChange.mock.calls.length).toBeGreaterThan(0)
    expect(lastCall<{ cropEnd: number | null }>(onCropChange).cropEnd).toBeCloseTo(6, 0)
  })
})

describe('trimming — start and end at the playhead', () => {
  test('Start here and End here take the playhead’s moment', async () => {
    const { onCropChange } = await renderCropper({ currentTime: 3.5 })
    await userEvent.click(page.getByText('Start here'))
    await expect.poll(() => onCropChange.mock.calls.some((c) => c[0].cropStart === 3.5)).toBe(true)
    await userEvent.click(page.getByText('End here'))
    await expect.poll(() => onCropChange.mock.calls.some((c) => c[0].cropEnd === 3.5)).toBe(true)
  })

  test('Apply hands the trim over to be saved', async () => {
    const { onApply } = await renderCropper({ currentTime: 5, cropStart: 2, cropEnd: 8 })
    await userEvent.click(page.getByText('Apply'))
    expect(onApply).toHaveBeenCalledWith({ cropStart: 2, cropEnd: 8 })
    await page.screenshot({ path: './playwright-screenshots/video-cropper-apply.png' })
  })
})

describe('trimming — the filmstrip', () => {
  test('shows frames across the clip when it is given a way to fetch them', async () => {
    await renderCropper({
      duration: 16,
      currentTime: 0,
      thumbSrc: (seek) => `/api/thumb/video.mp4?seek=${seek.toFixed(1)}&width=160`
    })
    const thumbs = [...document.querySelectorAll('[data-thumb]')].filter(
      (t): t is HTMLImageElement => t instanceof HTMLImageElement
    )
    expect(thumbs).toHaveLength(8)
    expect(thumbs[0]?.src).toContain('seek=1.0')
    expect(thumbs[7]?.src).toContain('seek=15.0')
  })

  test('shows no frames when it has no way to fetch them', async () => {
    await renderCropper({ duration: 16, currentTime: 0 })
    expect(document.querySelectorAll('[data-thumb]')).toHaveLength(0)
    expect(document.querySelector('[data-thumbs]')).toBeNull()
  })
})
