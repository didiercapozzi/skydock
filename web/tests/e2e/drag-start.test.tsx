import { createElement } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

import type { ManifestFile, ManifestGroup } from '../../app/components/types'
import { useDragAndDrop } from '../../app/hooks/useDragAndDrop'

/* A drag has to be handed what it is carrying. The board keeps that on its own side — both ends of
   the drag are the same board — but an engine given an empty drag cancels it before it starts, and
   then nothing is ever dropped anywhere: SkyDock's own window draws no card and reaches no place,
   where a browser lets the same drag by. So the name travels too, and this is what says it still
   does. Dragged in a real browser. */

const clip = (id: string): ManifestFile => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime: 1_785_000_000
})

const LUC = clip('luc')
const GROUP: ManifestGroup = { id: 'g1', label: 'Jump 1', day: '01.08.2026', files: [LUC] }

/* Declared at module scope: Fast Refresh only instruments components there, and one using hooks
   inside a function body trips over its own missing runtime. */
const Carried = () => {
  const drag = useDragAndDrop({
    groups: [GROUP],
    frozen: new Set<string>(),
    pickedFiles: [],
    moveFiles: () => {},
    assign: () => {},
    toMontage: () => {},
    importDropped: async () => {}
  })
  const handle = (label: string, onDragStart: (e: React.DragEvent) => void) =>
    createElement('div', {
      key: label,
      role: 'button',
      'aria-label': label,
      draggable: true,
      onDragStart,
      className: 'h-10 w-20 bg-line-2'
    })
  return createElement(
    'div',
    null,
    handle('the clip', (e) => drag.startFileDrag(LUC, e)),
    handle('the jump', (e) => drag.startJumpDrag(GROUP.id, e)),
    createElement('output', {
      'data-testid': 'landing',
      className: 'block h-10 w-20 bg-line',
      /* a target that takes nothing lets no drop happen at all */
      onDragOver: (e: React.DragEvent) => e.preventDefault(),
      onDrop: (e: React.DragEvent) => said.push(e.dataTransfer.getData('text/plain'))
    })
  )
}

/* what the drag was handed, read at the far end of a real one */
const said: string[] = []

afterEach(() => {
  said.length = 0
})

const dragged = async (name: string) => {
  await render(createElement(Carried))
  await userEvent.dragAndDrop(page.getByRole('button', { name }), page.getByTestId('landing'))
}

describe('a drag that has just started', () => {
  test('carries the name of the file, so the engine lets it go', async () => {
    await dragged('the clip')

    expect(said).toEqual(['luc.MP4'])
  })

  test('carries the name of the jump', async () => {
    await dragged('the jump')

    expect(said).toEqual(['Jump 1'])
  })
})
