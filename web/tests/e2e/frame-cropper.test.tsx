import { createElement, useState } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { FrameCropper } from '../../app/components/frame-cropper'
import { PreviewDrawer } from '../../app/components/preview-drawer'
import type { FrameCrop } from '@skydock/scripts'

/* Cutting a mount out of the corner of the frame and keeping the shape of what is left. The shape
   is the whole point — a 16:9 clip has to still be 16:9 when the passenger gets it — so a corner
   drag that quietly changed the aspect would defeat the feature while looking like it worked.

   Dragged in a real browser: this is pointer capture and element geometry, and a synthesised
   event would prove nothing about either. */

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

  /* the case that matters: a 16:9 clip cropped at the corner is still 16:9 */
  test('keeps the shape when a corner is dragged in', async () => {
    await render(createElement(Harness, { ratio: FRAME.width / FRAME.height }))

    await dragCornerIn('nw', 90)

    /* smaller than it was, and the same shape it was */
    await expect.poll(async () =>
      Number(await page.getByTestId('size').element().textContent)
    ).toBeLessThan(1)
    await expect.element(page.getByTestId('shape')).toHaveTextContent('1.778')
  })

  test('lets the shape go when it is dragged freely', async () => {
    await render(createElement(Harness, { ratio: null }))

    await dragCornerIn('nw', 120)

    /* no promise is made about the shape here, only that something was taken off */
    await expect.poll(async () =>
      Number(await page.getByTestId('size').element().textContent)
    ).toBeLessThan(1)
  })

  /* Staying inside the picture is arithmetic, and `containCrop` is tested on its own — dragging
     to a point outside the element to prove it here only fights the browser. */
})

/* A rectangle on its own is something to save: it is the half of a crop with no other way of telling
   it happened, since a trim shows on the row and a rectangle does not.

   Declared out here rather than inside the describe: Fast Refresh only instruments components at
   module scope, and one using hooks inside a function body trips over its own missing runtime. */
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

    await expect.element(page.getByRole('button', { name: 'Save crop' })).toBeDisabled()
  })

  /* Picking a shape only puts the rectangle up at full size, which is not yet a crop — nothing has
     been cut. Taking a corner in is what there is to save. */
  test('choosing a shape alone is not yet a crop', async () => {
    await render(createElement(Drawer, {}))

    await userEvent.click(page.getByRole('button', { name: 'Same', exact: true }))

    await expect.element(page.getByLabelText('Part of the picture to keep')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Save crop' })).toBeDisabled()
  })

  test('a rectangle dragged in is something to save, with no trim at all', async () => {
    await render(createElement(Drawer, {}))
    await userEvent.click(page.getByRole('button', { name: 'Same', exact: true }))

    /* dragged onto the rectangle itself, which is the only box this harness has */
    await userEvent.dragAndDrop(
      page.getByLabelText('Resize nw'),
      page.getByLabelText('Part of the picture to keep'),
      { targetPosition: { x: 40, y: 24 } }
    )

    await expect.element(page.getByText('Unsaved changes')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Save crop' })).toBeEnabled()
  })

  test('the file says a frame was cropped, not just that a crop was saved', async () => {
    await render(createElement(Drawer, { saved: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } }))

    await expect.element(page.getByText(/Frame cropped/)).toBeVisible()
  })
})
