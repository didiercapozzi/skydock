import type { FrameCrop } from '@skydock/scripts'
import { createElement, useState } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { PreviewDrawer } from '../../app/components/preview-drawer'
import type { ManifestFile } from '../../app/components/types'

/* A frame saved on a clip is there when the clip is opened again (RULES, Cropping and turning): the
   rectangle drawn where it was left, and the shape it has pressed — not the whole picture, as though
   nothing had been cropped. Each file opens on its own shape, not on the last one's. The clip here
   never loads, so its picture is taken as 16:9, as the drawer takes any clip until it knows. */

/* the part of a 16:9 picture a 9:16 rectangle of full height is */
const UPRIGHT: FrameCrop = { x: 0.34, y: 0, width: 81 / 256, height: 1 }

const clip = (id: string, frame?: FrameCrop): ManifestFile => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime: 1,
  ...(frame ? { frame } : {})
})

const FILES = [clip('cropped', UPRIGHT), clip('whole')]

const Drawer = () => {
  const [index, setIndex] = useState(0)
  const [frame, setFrame] = useState<FrameCrop | null>(FILES[0]!.frame ?? null)
  return createElement(PreviewDrawer, {
    files: FILES,
    index,
    frame,
    onFrameChange: setFrame,
    rotation: 0,
    onRotate: () => {},
    onClose: () => {},
    onPrevious: () => {},
    onNext: () => {
      setIndex(1)
      setFrame(FILES[1]!.frame ?? null)
    },
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

const shape = (label: string) => page.getByRole('button', { name: label, exact: true })

describe('a frame saved on a clip', () => {
  test('is drawn when the clip is opened again, on the shape it was saved with', async () => {
    await render(createElement(Drawer))

    await expect.element(page.getByLabelText('Part of the picture to keep')).toBeVisible()
    await expect.element(shape('9:16')).toHaveAttribute('aria-pressed', 'true')
    await expect.element(shape('None')).toHaveAttribute('aria-pressed', 'false')
  })

  test('the next clip opens on its own shape, not on the one before', async () => {
    await render(createElement(Drawer))
    await userEvent.click(shape('1:1'))

    await userEvent.click(page.getByRole('button', { name: /Next/ }))
    /* the 1:1 was never saved, so leaving asks first */
    await userEvent.click(
      page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Discard', exact: true })
    )

    await expect.element(shape('None')).toHaveAttribute('aria-pressed', 'true')
    await expect.element(page.getByLabelText('Part of the picture to keep')).not.toBeInTheDocument()
  })
})

/* How much of the picture the rectangle keeps is said as it changes, on the rectangle and beside
   it — so a crop is judged by the figure, not by eye. */
describe('the part of the picture kept', () => {
  const said = () => document.body.textContent ?? ''

  test('is said in percent, and follows the rectangle as it changes', async () => {
    await render(createElement(Drawer))
    await expect.poll(said).toContain('Keeps 32% across · 100% down · 32% of the picture')
    await expect.poll(said).toContain('32% × 100%')

    await userEvent.click(shape('1:1'))

    await expect.poll(said).toContain('Keeps 56% across · 100% down · 56% of the picture')
    await expect.poll(said).toContain('56% × 100%')
    await page.screenshot({ path: './playwright-screenshots/frame-percent.png' })
  })

  /* leaving with a change not saved asks first, and Escape on the question keeps editing
     (RULES, Cropping and turning) */
  test('asks before a change not saved is left behind, and keeps editing when not answered', async () => {
    await render(createElement(Drawer))
    await userEvent.click(shape('1:1'))

    await userEvent.keyboard('{Escape}')
    const asking = page.getByRole('dialog', { name: 'Unsaved changes' })
    await expect.element(asking).toBeVisible()
    await userEvent.keyboard('{Escape}')

    await expect.element(asking).not.toBeInTheDocument()
    await expect.element(shape('1:1')).toHaveAttribute('aria-pressed', 'true')
  })
})
