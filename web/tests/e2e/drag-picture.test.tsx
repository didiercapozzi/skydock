import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import type { ManifestFile, ManifestGroup } from '../../app/components/types'
import { useDragAndDrop } from '../../app/hooks/useDragAndDrop'


const clip = (id: string): ManifestFile => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime: 1_785_000_000
})

const LUC = clip('luc')
const GROUP: ManifestGroup = { id: 'g1', label: 'Jump 1', day: '01.08.2026', files: [LUC] }

const PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const Carried = () => {
  const drag = useDragAndDrop({
    groups: [GROUP],
    loose: [],
    labels: new Map([[GROUP.id, GROUP.label]]),
    frozen: new Set<string>(),
    moveFiles: () => {},
    assign: () => {},
    toMontage: () => {},
    importDropped: async () => {},
    askMontageName: () => {},
    askRemove: () => {},
    onFiled: () => {}
  })
  const handle = (label: string, onDragStart: (e: React.DragEvent) => void) =>
    createElement(
      'div',
      {
      key: label,
      role: 'button',
      'aria-label': label,
      draggable: true,
      onDragStart,
      className: 'h-10 w-20 bg-line-2'
      },
      createElement('img', { alt: '', src: PIXEL })
    )
  return createElement(
    'div',
    null,
    handle('the clip', (e) => drag.startFileDrag(LUC, [], e)),
    handle('the jump', (e) => drag.startJumpDrag(GROUP.id, e)),
    createElement('output', {
      'data-testid': 'landing',
      className: 'block h-10 w-20 bg-line',
      onDragOver: (e: React.DragEvent) => e.preventDefault(),
      onDrop: (e: React.DragEvent) => said.push(e.dataTransfer.getData('text/plain'))
    })
  )
}

const said: string[] = []
const pictured: { text: string | null; picture: boolean; x: number; y: number }[] = []

describe('what is drawn under the pointer during a drag', () => {
  test('is a small chip with the picture and the name of the file, hanging off the pointer', async () => {
    vi.spyOn(DataTransfer.prototype, 'setDragImage').mockImplementation((image, x, y) => {
      pictured.push({ text: image.textContent, picture: image.querySelector('img') !== null, x, y })
    })
    await render(createElement(Carried))
    await userEvent.dragAndDrop(
      page.getByRole('button', { name: 'the clip' }),
      page.getByTestId('landing')
    )

    expect(pictured).toHaveLength(1)
    expect(pictured[0]?.text).toBe('luc.MP4')
    expect(pictured[0]?.picture, 'the picture drawn in the row is in the chip').toBe(true)
    expect(pictured[0]!.x).toBeLessThan(0)
    expect(pictured[0]!.y).toBeLessThan(0)
  })
})
