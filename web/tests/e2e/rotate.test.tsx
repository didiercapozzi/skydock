import type { FrameCrop, Rotation } from '@skydock/scripts'
import { createElement, useState } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { PreviewDrawer } from '../../app/components/preview-drawer'

/* Turning a picture in the preview: a quarter at a time, by button or by R, the box on screen taking
   the shape the file will come out in — and a turn is something to save, on a photo as on a clip.

   Declared out here rather than inside the describe: Fast Refresh only instruments components at
   module scope. */
const CLIP = { path: '/o/GX01.MP4', size: 1, mtime: 1, filename: 'GX01.MP4', id: 'v1' }
const PHOTO = { path: '/o/G001.JPG', size: 1, mtime: 1, filename: 'G001.JPG', id: 'p1' }

const saved: { rotation: Rotation | null } = { rotation: null }

const Drawer = ({ file }: { file: typeof CLIP }) => {
  const [frame, setFrame] = useState<FrameCrop | null>(null)
  const [rotation, setRotation] = useState<Rotation>(0)
  return createElement(PreviewDrawer, {
    files: [file],
    index: 0,
    frame,
    onFrameChange: setFrame,
    rotation,
    onRotate: setRotation,
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
    onApply: () => {
      saved.rotation = rotation
    },
    onReset: () => {},
    onZoomChange: () => {},
    onDurationChange: () => {},
    onVideoRef: () => {}
  })
}

/* the box the picture is drawn in, which takes the shape it will come out in */
const box = () =>
  (page.getByRole('dialog', { name: 'Preview' }).element().querySelector('video, img')!
    .parentElement as HTMLElement)

describe('turning a picture', () => {
  test('turns a quarter at a time, and a quarter turn makes it portrait', async () => {
    await render(createElement(Drawer, { file: CLIP }))
    await userEvent.click(page.getByRole('button', { name: 'Turn', exact: true }))
    const across = box().getBoundingClientRect()
    expect(across.width).toBeGreaterThan(across.height)

    await userEvent.click(page.getByRole('button', { name: '↻ +90°' }))

    await expect
      .element(page.getByRole('button', { name: '↻ +90°' }))
      .toHaveAttribute('aria-pressed', 'true')
    const upright = box().getBoundingClientRect()
    expect(upright.height).toBeGreaterThan(upright.width)
  })

  test('R turns it too, and 0° brings it back as shot', async () => {
    await render(createElement(Drawer, { file: CLIP }))
    await userEvent.click(page.getByRole('button', { name: 'Turn', exact: true }))
    await userEvent.keyboard('r')
    await userEvent.keyboard('r')
    await expect
      .element(page.getByRole('button', { name: '↻ +180°' }))
      .toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(page.getByRole('button', { name: '0°', exact: true }))
    await expect
      .element(page.getByRole('button', { name: '0°', exact: true }))
      .toHaveAttribute('aria-pressed', 'true')
    await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  test('a turn is something to save', async () => {
    saved.rotation = null
    await render(createElement(Drawer, { file: CLIP }))
    await userEvent.click(page.getByRole('button', { name: 'Turn', exact: true }))
    await userEvent.click(page.getByRole('button', { name: '↻ +180°' }))

    await expect.element(page.getByText('Unsaved changes')).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Save' }))
    expect(saved.rotation).toBe(180)
  })

  test('a photo can be turned and saved, and has no frame to crop', async () => {
    saved.rotation = null
    await render(createElement(Drawer, { file: PHOTO }))
    await expect.element(page.getByRole('button', { name: 'Same', exact: true })).not.toBeInTheDocument()

    await userEvent.click(page.getByRole('button', { name: '↻ +90°' }))
    await userEvent.click(page.getByRole('button', { name: 'Save', exact: true }))
    expect(saved.rotation).toBe(90)
  })
})
