import { createElement, useState } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import { FrameCropper } from '../../app/components/frame-cropper'
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
