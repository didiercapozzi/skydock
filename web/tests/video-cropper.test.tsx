import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { VideoCropper } from '../app/components/video-cropper'

const renderCropper = async (props: Partial<Parameters<typeof VideoCropper>[0]> = {}) => {
  const onSeek = vi.fn()
  const onCommitOffset = vi.fn()
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
      onCommitOffset,
      onCropChange,
      onApply,
      onZoomChange,
      ...props
    })
  )
  return { onSeek, onCommitOffset, onCropChange, onApply, onZoomChange }
}

describe('VideoCropper - 9.11 seek clamps', () => {
  test('click beyond bar clamps to 0 and duration', async () => {
    const onSeek = vi.fn()
    const onCommitOffset = vi.fn()
    await render(
      createElement(VideoCropper, {
        duration: 10,
        currentTime: 5,
        bufferedRanges: [{ start: 0, end: 10 }],
        cropStart: null,
        cropEnd: null,
        zoom: 1,
        onSeek,
        onCommitOffset,
        onCropChange: vi.fn(),
        onApply: vi.fn(),
        onZoomChange: vi.fn()
      })
    )
    const bar = document.querySelector('[data-crop-bar]') as HTMLElement
    bar.getBoundingClientRect = () =>
      ({
        left: 100,
        width: 1000,
        right: 1100,
        top: 0,
        bottom: 48,
        height: 48,
        x: 100,
        y: 0,
        toJSON: () => {}
      }) as DOMRect

    bar.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: 0,
        clientY: 10
      } as unknown as MouseEventInit)
    )
    expect(onSeek).toHaveBeenCalledWith(0)

    onSeek.mockClear()
    bar.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: 2000,
        clientY: 10
      } as unknown as MouseEventInit)
    )
    expect(onSeek).toHaveBeenCalledWith(10)
    await page.screenshot({ path: './playwright-screenshots/video-cropper-seek-clamp.png' })
  })

  test('click middle seeks to duration/2', async () => {
    const { onSeek } = await renderCropper({ duration: 10, currentTime: 0 })
    const bar = document.querySelector('[data-crop-bar]') as HTMLElement
    bar.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 1000,
        right: 1000,
        top: 0,
        bottom: 48,
        height: 48,
        x: 0,
        y: 0,
        toJSON: () => {}
      }) as DOMRect
    bar.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: 500,
        clientY: 10
      } as unknown as MouseEventInit)
    )
    await expect.poll(() => onSeek.mock.calls.length > 0).toBe(true)
    const last = onSeek.mock.calls.at(-1)?.[0] as number
    expect(last).toBeCloseTo(5, 0)
  })
})

describe('VideoCropper - 9.11 buffered vs unbuffered', () => {
  test('seek inside buffered range calls onSeek, outside calls onCommitOffset', async () => {
    const onSeek = vi.fn()
    const onCommitOffset = vi.fn()
    await render(
      createElement(VideoCropper, {
        duration: 10,
        currentTime: 0,
        bufferedRanges: [{ start: 0, end: 5 }],
        cropStart: null,
        cropEnd: null,
        zoom: 1,
        onSeek,
        onCommitOffset,
        onCropChange: vi.fn(),
        onApply: vi.fn(),
        onZoomChange: vi.fn()
      })
    )
    const bar = document.querySelector('[data-crop-bar]') as HTMLElement
    bar.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 1000,
        right: 1000,
        top: 0,
        bottom: 48,
        height: 48,
        x: 0,
        y: 0,
        toJSON: () => {}
      }) as DOMRect

    bar.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: 200,
        clientY: 10
      } as unknown as MouseEventInit)
    )
    expect(onSeek).toHaveBeenCalled()
    expect(onCommitOffset).not.toHaveBeenCalled()

    onSeek.mockClear()
    onCommitOffset.mockClear()
    bar.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: 800,
        clientY: 10
      } as unknown as MouseEventInit)
    )
    expect(onCommitOffset).toHaveBeenCalled()
  })
})

describe('VideoCropper - 9.11 time from bounding rect', () => {
  test('time from position via rect', async () => {
    const onSeek = vi.fn()
    await render(
      createElement(VideoCropper, {
        duration: 10,
        currentTime: 0,
        bufferedRanges: [{ start: 0, end: 10 }],
        cropStart: null,
        cropEnd: null,
        zoom: 1,
        onSeek,
        onCommitOffset: vi.fn(),
        onCropChange: vi.fn(),
        onApply: vi.fn(),
        onZoomChange: vi.fn()
      })
    )
    const bar = document.querySelector('[data-crop-bar]') as HTMLElement
    bar.getBoundingClientRect = () =>
      ({
        left: 100,
        width: 1000,
        right: 1100,
        top: 0,
        bottom: 48,
        height: 48,
        x: 100,
        y: 0,
        toJSON: () => {}
      }) as DOMRect
    bar.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: 600,
        clientY: 10
      } as unknown as MouseEventInit)
    )
    expect(onSeek).toHaveBeenCalledWith(5)
  })
})

describe('VideoCropper - 9.11 wheel zoom centered', () => {
  test('wheel zoom changes zoom and keeps cursor time', async () => {
    const onZoomChange = vi.fn()
    const onSeek = vi.fn()
    await render(
      createElement(VideoCropper, {
        duration: 10,
        currentTime: 5,
        bufferedRanges: [{ start: 0, end: 10 }],
        cropStart: null,
        cropEnd: null,
        zoom: 1,
        onSeek,
        onCommitOffset: vi.fn(),
        onCropChange: vi.fn(),
        onApply: vi.fn(),
        onZoomChange
      })
    )
    const bar = document.querySelector('[data-crop-bar]') as HTMLElement
    bar.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 1000,
        right: 1000,
        top: 0,
        bottom: 48,
        height: 48,
        x: 0,
        y: 0,
        toJSON: () => {}
      }) as DOMRect
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 500,
      deltaY: -100
    })
    bar.dispatchEvent(wheelEvent)
    expect(onZoomChange).toHaveBeenCalled()
    const zoom = onZoomChange.mock.calls[0][0] as number
    expect(zoom).toBeGreaterThan(1)
    expect(zoom).toBeLessThanOrEqual(5)
    await page.screenshot({ path: './playwright-screenshots/video-cropper-wheel.png' })
  })

  test('zoom clamps 1..5', async () => {
    const onZoomChange = vi.fn()
    await render(
      createElement(VideoCropper, {
        duration: 10,
        currentTime: 5,
        bufferedRanges: [{ start: 0, end: 10 }],
        cropStart: 2,
        cropEnd: 8,
        zoom: 5,
        onSeek: vi.fn(),
        onCommitOffset: vi.fn(),
        onCropChange: vi.fn(),
        onApply: vi.fn(),
        onZoomChange
      })
    )
    const bar = document.querySelector('[data-crop-bar]') as HTMLElement
    bar.dispatchEvent(
      new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -1000, clientX: 500 })
    )
    expect(onZoomChange).toHaveBeenCalledWith(5)
  })
})

describe('VideoCropper - 9.11 pointer drag markers', () => {
  test('drag start handle updates cropStart', async () => {
    const { onCropChange } = await renderCropper({
      duration: 10,
      cropStart: 2,
      cropEnd: 8,
      zoom: 1
    })
    const bar = document.querySelector('[data-crop-bar]') as HTMLElement
    bar.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 1000,
        right: 1000,
        top: 0,
        bottom: 48,
        height: 48,
        x: 0,
        y: 0,
        toJSON: () => {}
      }) as DOMRect
    const handle = document.querySelector('[data-crop-start-handle]') as HTMLElement
    await expect.element(page.elementLocator(handle)).toBeInTheDocument()
    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        clientX: 200
      } as unknown as PointerEventInit)
    )
    bar.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 1,
        clientX: 300
      } as unknown as PointerEventInit)
    )
    bar.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        clientX: 300
      } as unknown as PointerEventInit)
    )
    await expect.poll(() => onCropChange.mock.calls.length > 0).toBe(true)
    const last = onCropChange.mock.calls.at(-1)?.[0] as { cropStart: number | null }
    expect(last.cropStart).toBeCloseTo(3, 0)
  })

  test('drag end handle updates cropEnd', async () => {
    const { onCropChange } = await renderCropper({ duration: 10, cropStart: 2, cropEnd: 8 })
    const bar = document.querySelector('[data-crop-bar]') as HTMLElement
    bar.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 1000,
        right: 1000,
        top: 0,
        bottom: 48,
        height: 48,
        x: 0,
        y: 0,
        toJSON: () => {}
      }) as DOMRect
    const handle = document.querySelector('[data-crop-end-handle]') as HTMLElement
    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 2,
        clientX: 800
      } as unknown as PointerEventInit)
    )
    bar.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 2,
        clientX: 700
      } as unknown as PointerEventInit)
    )
    bar.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 2,
        clientX: 700
      } as unknown as PointerEventInit)
    )
    await expect.poll(() => onCropChange.mock.calls.length > 0).toBe(true)
    const last = onCropChange.mock.calls.at(-1)?.[0] as { cropEnd: number | null }
    expect(last.cropEnd).toBeCloseTo(7, 0)
  })
})

describe('VideoCropper - 9.11 Start/End here and Apply', () => {
  test('Start here and End here set crop points', async () => {
    const { onCropChange } = await renderCropper({
      currentTime: 3.5,
      cropStart: null,
      cropEnd: null
    })
    await userEvent.click(page.getByText('Start here'))
    await expect.poll(() => onCropChange.mock.calls.some((c) => c[0].cropStart === 3.5)).toBe(true)
    await userEvent.click(page.getByText('End here'))
    await expect.poll(() => onCropChange.mock.calls.some((c) => c[0].cropEnd === 3.5)).toBe(true)
  })

  test('Apply saves crop to manifest', async () => {
    const onApply = vi.fn()
    await render(
      createElement(VideoCropper, {
        duration: 10,
        currentTime: 5,
        bufferedRanges: [{ start: 0, end: 10 }],
        cropStart: 2,
        cropEnd: 8,
        zoom: 1,
        onSeek: vi.fn(),
        onCommitOffset: vi.fn(),
        onCropChange: vi.fn(),
        onApply,
        onZoomChange: vi.fn()
      })
    )
    await userEvent.click(page.getByText('Apply'))
    expect(onApply).toHaveBeenCalledWith({ cropStart: 2, cropEnd: 8 })
    await page.screenshot({ path: './playwright-screenshots/video-cropper-apply.png' })
  })
})
