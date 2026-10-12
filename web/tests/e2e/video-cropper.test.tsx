import { createElement, useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { VideoCropper } from '../../app/components/video-cropper'


const renderCropper = async (props: Partial<Parameters<typeof VideoCropper>[0]> = {}) => {
  const onSeek = vi.fn()
  const onCropChange = vi.fn()
  const onZoomChange = vi.fn()
  await render(
    createElement(VideoCropper, {
      duration: 10,
      currentTime: 2,
      cropStart: null,
      cropEnd: null,
      zoom: 1,
      onSeek,
      onCropChange,
      onApply: () => {},
      onZoomChange,
      ...props
    })
  )
  return { onSeek, onCropChange, onZoomChange }
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

})

describe('trimming — zooming the timeline', () => {
  test('the wheel zooms in, about the pointer', async () => {
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
    expect(preventDefault).toHaveBeenCalled()
    const zoom = lastCall<number>(onZoomChange)
    expect(zoom).toBeGreaterThan(1)
    await page.screenshot({ path: './playwright-screenshots/video-cropper-wheel.png' })
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
