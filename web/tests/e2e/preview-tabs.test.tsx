import type { FrameCrop, Rotation } from '@skydock/scripts'
import { createElement, useState } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { PreviewDrawer } from '../../app/components/preview-drawer'

/* The preview's panel has a tab for each thing that can be changed — the cut, the frame, the turn and
   what is known of the file — rather than every section in a long scroll; and the cut says what the
   file will weigh once trimmed (RULES, The preview). */

const GB = 1024 ** 3
const CLIP = { path: '/o/GX01.MP4', size: GB, mtime: 1, filename: 'GX01.MP4', id: 'v1' }
const PHOTO = { path: '/o/G001.JPG', size: 1000, mtime: 1, filename: 'G001.JPG', id: 'p1' }

const Drawer = ({ file, cropEnd = null }: { file: typeof CLIP; cropEnd?: number | null }) => {
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
    cropEnd,
    zoom: 1,
    currentTime: 0,
    duration: 100,
    onSeek: () => {},
    onCropChange: () => {},
    onApply: () => {},
    onReset: () => {},
    onZoomChange: () => {},
    onDurationChange: () => {},
    onVideoRef: () => {}
  })
}

const tab = (name: string) => page.getByRole('button', { name, exact: true })

describe('the preview’s tabs', () => {
  test('a clip opens on its cut, and each tab shows only its own part', async () => {
    await render(createElement(Drawer, { file: CLIP }))

    await expect.element(page.getByRole('heading', { name: 'Trim' })).toBeVisible()
    await expect.element(page.getByRole('heading', { name: 'Frame' })).not.toBeInTheDocument()

    await userEvent.click(tab('Frame'))
    await expect.element(page.getByRole('group', { name: 'Frame' })).toBeVisible()
    await expect.element(page.getByRole('heading', { name: 'Trim' })).not.toBeInTheDocument()

    await userEvent.click(tab('Turn'))
    await expect.element(page.getByRole('group', { name: 'Turn' })).toBeVisible()

    await userEvent.click(tab('Info'))
    await expect.element(page.getByText('Size now')).toBeVisible()
  })

  test('a photo has no cut or frame to offer, and opens on its turn', async () => {
    await render(createElement(Drawer, { file: PHOTO }))

    await expect.element(tab('Cut')).not.toBeInTheDocument()
    await expect.element(tab('Frame')).not.toBeInTheDocument()
    await expect.element(page.getByRole('group', { name: 'Turn' })).toBeVisible()
  })

  test('the cut says what the file will weigh once trimmed', async () => {
    await render(createElement(Drawer, { file: CLIP, cropEnd: 50 }))

    await expect.element(page.getByText('Size after')).toBeVisible()
    await expect.element(page.getByText(/1\.0 GB → ~512 MB/).first()).toBeVisible()
  })
})
