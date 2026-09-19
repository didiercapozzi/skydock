import { freeablePlace } from '@skydock/scripts'
import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { FreePlaceDialog } from '../../app/components/free-place-dialog'
import type { ManifestFile, ManifestGroup } from '../../app/components/types'

/* Freeing a dropzone asks first, and says what it costs (RULES, Freeing space): what is proved,
   what is deleted, and how many files went up trimmed, cropped or turned — whose cut-off parts go
   with their originals. A jump not all on the storage stays. */

const file = (id: string, extra: Partial<ManifestFile> = {}): ManifestFile => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1_000_000,
  mtime: 1,
  ...extra
})

const jump = (id: string, files: ManifestFile[]): ManifestGroup => ({
  id,
  label: id,
  day: '01.08.2026',
  destination: 'Yverdon',
  files
})

const onStorage = new Set(['a', 'b', 'c'])

const freeable = freeablePlace(
  [
    jump('up', [file('a'), file('b', { cropStart: 1, cropEnd: 2 })]),
    jump('half', [file('c'), file('d')])
  ],
  [],
  (f) => onStorage.has(f.id ?? '')
)

describe('freeing a dropzone', () => {
  test('asks first, naming the trimmed files and what stays', async () => {
    const onConfirm = vi.fn()
    await render(
      createElement(FreePlaceDialog, { place: 'Yverdon', freeable, onClose: () => {}, onConfirm })
    )

    const dialog = page.getByRole('dialog', { name: 'Free up space' })
    await expect.element(dialog).toBeVisible()
    await expect.poll(() => dialog.element().textContent).toContain('1 jump: the originals')
    await expect.poll(() => dialog.element().textContent).toContain('1 file went up trimmed')
    await expect
      .poll(() => dialog.element().textContent)
      .toContain('1 jump or loose file not all uploaded yet')
    expect(onConfirm).not.toHaveBeenCalled()

    await userEvent.click(page.getByRole('button', { name: /Check and free/ }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
