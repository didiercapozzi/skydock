import { createElement, useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { VideoCropper } from '../../app/components/video-cropper'


const renderCropper = async (props: Partial<Parameters<typeof VideoCropper>[0]> = {}) => {
  const onSeek = vi.fn()
  const onCropChange = vi.fn()
  const onApply = vi.fn()
  const onZoomChange = vi.fn()
  const propsOf = (more: typeof props = {}) => ({
    duration: 10,
    currentTime: 2,
    cropStart: null,
    cropEnd: null,
    zoom: 1,
    onSeek,
    onCropChange,
    onApply,
    onZoomChange,
    ...props,
    ...more
  })
  const screen = await render(createElement(VideoCropper, propsOf()))
  const rerender = (more: typeof props) => screen.rerender(createElement(VideoCropper, propsOf(more)))
  return { onSeek, onCropChange, onApply, onZoomChange, rerender }
}

const part = (selector: string) => {
  const el = document.querySelector(selector)
  if (!(el instanceof HTMLElement)) throw new Error(`nothing drawn for ${selector}`)
  return el
}
const bar = () => part('[data-crop-bar]')

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

  test('the playhead never leaves the clip, at either edge of the bar', async () => {
    const { onSeek } = await renderCropper({ currentTime: 5 })
    const track = page.elementLocator(bar())
    const edge = bar().getBoundingClientRect()
    await userEvent.click(track, { position: { x: 1, y: edge.height / 2 } })
    await expect.poll(() => lastCall<number>(onSeek)).toBeCloseTo(0, 1)
    await userEvent.click(track, { position: { x: edge.width - 2, y: edge.height / 2 } })
    await expect.poll(() => lastCall<number>(onSeek)).toBeCloseTo(10, 1)
  })
})

describe('trimming — zooming the timeline', () => {
  test('the wheel zooms in, about the pointer', async () => {
    const { onZoomChange } = await renderCropper({ currentTime: 5 })
    await userEvent.wheel(page.elementLocator(bar()), { direction: 'up', times: 3 })
    await expect.poll(() => onZoomChange.mock.calls.length).toBeGreaterThan(0)
    const zoom = lastCall<number>(onZoomChange)
    expect(zoom).toBeGreaterThan(1)
    expect(zoom).toBeLessThanOrEqual(10)
  })

  test('zoomed ten times, the wheel goes no further', async () => {
    const { onZoomChange } = await renderCropper({ cropStart: 2, cropEnd: 8, zoom: 10 })
    await userEvent.wheel(page.elementLocator(bar()), { direction: 'up', times: 10 })
    await expect.poll(() => onZoomChange.mock.calls.length).toBeGreaterThan(0)
    expect(lastCall<number>(onZoomChange)).toBe(10)
  })

  test('Reset brings the timeline back to whole', async () => {
    const { onZoomChange } = await renderCropper({ zoom: 6 })
    await userEvent.click(page.getByText('Reset'))
    expect(onZoomChange).toHaveBeenCalledWith(1)
  })

  test('Reset is shown only while the timeline is zoomed', async () => {
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

describe('trimming — the filmstrip', () => {
  test('the timeline is drawn with pictures of the clip along it', async () => {
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

  test('a zoomed clip played on brings in the one picture that comes into view, not every picture again', async () => {
    const asked = new Set<string>()
    const thumbSrc = (seek: number) => {
      asked.add(seek.toFixed(1))
      return `/api/thumb/clip.mp4?seek=${seek.toFixed(1)}&width=160`
    }
    const { rerender } = await renderCropper({ duration: 60, currentTime: 25, zoom: 2, thumbSrc })

    for (let time = 25.1; time <= 45; time += 0.1) await rerender({ currentTime: time })

    expect(asked.size).toBeLessThanOrEqual(14)
  })

  test('none is asked for at or beyond the end of the clip', async () => {
    const asked: number[] = []
    await renderCropper({
      duration: 15,
      currentTime: 0,
      thumbSrc: (seek) => {
        asked.push(seek)
        return `/api/thumb/clip.mp4?seek=${seek.toFixed(1)}&width=160`
      }
    })

    expect(Math.max(...asked)).toBeLessThan(15)
  })
})

describe('trimming — start and end at the playhead', () => {
  test('Start here and End here take the playhead’s moment', async () => {
    const { onCropChange } = await renderCropper({ currentTime: 3.5 })
    await userEvent.click(page.getByText('Start here'))
    await expect.poll(() => onCropChange.mock.calls.some(([range]) => range.cropStart === 3.5)).toBe(true)
    await userEvent.click(page.getByText('End here'))
    await expect.poll(() => onCropChange.mock.calls.some(([range]) => range.cropEnd === 3.5)).toBe(true)
  })

  test('Apply hands the trim over to be saved', async () => {
    const { onApply } = await renderCropper({ currentTime: 5, cropStart: 2, cropEnd: 8 })
    await userEvent.click(page.getByText('Apply'))
    expect(onApply).toHaveBeenCalledWith({ cropStart: 2, cropEnd: 8 })
  })
})

const Zoomable = () => {
  const [zoom, setZoom] = useState(1)
  return createElement(VideoCropper, {
    duration: 100,
    currentTime: 0,
    cropStart: null,
    cropEnd: null,
    zoom,
    moments: { exit: 80 },
    onSeek: () => {},
    onCropChange: () => {},
    onApply: () => {},
    onZoomChange: setZoom
  })
}

describe('the zoom said', () => {
  test('to the hundredth while it is only a little, so a cut-off clip never reads as 1.0x', async () => {
    await renderCropper({ zoom: 1.03 })

    expect(part('[data-zoom-display]').textContent).toBe('1.03x')
  })

  test('to a tenth once it is plain', async () => {
    await renderCropper({ zoom: 4 })

    expect(part('[data-zoom-display]').textContent).toBe('4.0x')
  })

  test('stays where the wheel put it, with the playhead out of view', async () => {
    await render(createElement(Zoomable))
    const rect = bar().getBoundingClientRect()

    bar().dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: -800,
        clientX: rect.left + rect.width * 0.8
      })
    )

    await vi.waitFor(() => {
      const left = parseFloat(part('[data-moment=exit]').style.left)
      expect(left).toBeGreaterThan(70)
      expect(left).toBeLessThan(90)
    })
  })
})
