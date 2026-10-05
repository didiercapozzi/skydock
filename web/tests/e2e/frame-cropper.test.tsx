import { createElement, useState } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { FrameCropper } from '../../app/components/frame-cropper'
import { PreviewDrawer } from '../../app/components/preview-drawer'
import type { FrameCrop } from '@skydock/scripts'


const FRAME = { width: 1920, height: 1080 }

const Harness = ({ ratio }: { ratio: number | null }) => {
  const [crop, setCrop] = useState<FrameCrop>({ x: 0, y: 0, width: 1, height: 1 })
  return createElement(
    'div',
    {
      style: { position: 'relative', width: '640px', height: '360px', background: '#222' },
      'data-testid': 'stage'
    },
    createElement(FrameCropper, { crop, ratio, frame: FRAME, onChange: setCrop }),
    createElement(
      'output',
      { 'data-testid': 'shape' },
      ((crop.width * FRAME.width) / (crop.height * FRAME.height)).toFixed(3)
    ),
    createElement('output', { 'data-testid': 'size' }, `${crop.width.toFixed(3)}`)
  )
}

const dragCornerIn = async (corner: string, by: number) => {
  const handle = page.getByLabelText(`Resize ${corner}`).element() as HTMLElement
  const box = handle.getBoundingClientRect()
  await userEvent.dragAndDrop(
    page.getByLabelText(`Resize ${corner}`),
    page.getByTestId('stage'),
    { targetPosition: { x: box.x + by, y: box.y + by } }
  )
}

describe('the rectangle that says what to keep', () => {
  test('starts as the whole picture and offers a corner at each end', async () => {
    await render(createElement(Harness, { ratio: 16 / 9 }))

    await expect.element(page.getByLabelText('Part of the picture to keep')).toBeVisible()
    for (const corner of ['nw', 'ne', 'sw', 'se'])
      await expect.element(page.getByLabelText(`Resize ${corner}`)).toBeVisible()
  })

  test('keeps the shape when a corner is dragged in', async () => {
    await render(createElement(Harness, { ratio: FRAME.width / FRAME.height }))

    await dragCornerIn('nw', 90)

    await expect.poll(async () =>
      Number(await page.getByTestId('size').element().textContent)
    ).toBeLessThan(1)
    await expect.element(page.getByTestId('shape')).toHaveTextContent('1.778')
  })

  test('lets the shape go when it is dragged freely', async () => {
    await render(createElement(Harness, { ratio: null }))

    await dragCornerIn('nw', 120)

    await expect.poll(async () =>
      Number(await page.getByTestId('size').element().textContent)
    ).toBeLessThan(1)
  })

})

const CLIP = { path: '/o/GX01.MP4', size: 1, mtime: 1, filename: 'GX01.MP4', id: 'v1' }

const Drawer = ({ saved }: { saved?: FrameCrop | null }) => {
  const [frame, setFrame] = useState<FrameCrop | null>(saved ?? null)
  return createElement(PreviewDrawer, {
    files: [{ ...CLIP, frame: saved ?? undefined }],
    index: 0,
    frame,
    onFrameChange: setFrame,
    rotation: 0,
    onRotate: () => {},
    onClose: () => {},
    onPrevious: () => {},
    onNext: () => {},
    cropStart: null,
    cropEnd: null,
    zoom: 1,
    currentTime: 0,
    duration: 10,
    onSeek: () => {},
    onCropChange: () => {},
    onApply: () => {},
    onZoomChange: () => {},
    onDurationChange: () => {},
    onVideoRef: () => {}
  })
}

describe('saving a crop that is only a rectangle', () => {
  test('nothing to save before anything is touched', async () => {
    await render(createElement(Drawer, {}))
    await userEvent.click(page.getByRole('button', { name: 'Frame', exact: true }))

    await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  test('choosing a shape alone is not yet a crop', async () => {
    await render(createElement(Drawer, {}))
    await userEvent.click(page.getByRole('button', { name: 'Frame', exact: true }))

    await userEvent.click(page.getByRole('button', { name: 'Same', exact: true }))

    await expect.element(page.getByLabelText('Part of the picture to keep')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  test('a rectangle dragged in is something to save, with no trim at all', async () => {
    await render(createElement(Drawer, {}))
    await userEvent.click(page.getByRole('button', { name: 'Frame', exact: true }))
    await userEvent.click(page.getByRole('button', { name: 'Same', exact: true }))

    await userEvent.dragAndDrop(
      page.getByLabelText('Resize nw'),
      page.getByLabelText('Part of the picture to keep'),
      { targetPosition: { x: 40, y: 24 } }
    )

    await expect.element(page.getByText('Unsaved changes')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  test('the file says a frame was cropped, not just that a crop was saved', async () => {
    await render(createElement(Drawer, { saved: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } }))
    await userEvent.click(page.getByRole('button', { name: 'Info', exact: true }))

    await expect.element(page.getByText(/Framed/)).toBeVisible()
  })
})
