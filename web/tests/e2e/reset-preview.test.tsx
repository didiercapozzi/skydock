import { createElement } from 'react'
import { createRoutesStub } from 'react-router'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { boardRoute } from './board-route'

/* Reset in the preview puts the trim, the frame and the turn back together, and saves them as that
   (RULES, Cropping and turning): one press, not a reset that leaves one half behind. */

const AT = Math.floor(new Date(2026, 7, 1, 10, 0, 0).getTime() / 1000)
const clip = {
  id: 'sion',
  path: '/o/sion.MP4',
  filename: 'sion.MP4',
  size: 1,
  mtime: AT,
  cropStart: 5,
  cropEnd: 9,
  rotation: 1,
  frame: { x: 0.34, y: 0, width: 81 / 256, height: 1 }
}
const board = {
  groups: [],
  looseFiles: [clip],
  destinations: [],
  outputs: {},
  proxies: {},
  montages: {},
  remote: null,
  storage: null,
  hasManifest: true,
  processing: null,
  nas: { connected: false, hostname: null, backupFolder: null }
}

const mount = (sent: { fileUpdates?: Record<string, unknown>[] }[]) =>
  render(
    createElement(
      createRoutesStub([
        boardRoute(() => board),
        {
          path: '/api/manifest',
          action: async ({ request }: { request: Request }) => {
            sent.push(await request.json())
            return { groups: [], looseFiles: [clip] }
          }
        }
      ]),
      { initialEntries: ['/fresh/file/sion'] }
    )
  )

const reset = () => page.getByRole('button', { name: 'Reset trim, frame and turn' })
const save = () => page.getByRole('button', { name: 'Save', exact: true })

describe('Reset in the preview', () => {
  test('clears the trim, the frame and the turn on screen, and offers Save', async () => {
    const sent: { fileUpdates?: Record<string, unknown>[] }[] = []
    await mount(sent)
    await expect.element(save()).toBeDisabled()

    await userEvent.click(reset())

    await expect.element(save()).toBeEnabled()
    await expect.element(page.getByText('Unsaved changes').first()).toBeVisible()
    expect(sent).toHaveLength(0)
  })

  test('Save then saves all three cleared', async () => {
    const sent: { fileUpdates?: Record<string, unknown>[] }[] = []
    await mount(sent)
    await userEvent.click(reset())
    await userEvent.click(save())

    await expect.poll(() => sent.length).toBeGreaterThan(0)
    expect(sent.at(-1)?.fileUpdates?.[0]).toMatchObject({
      cropStart: null,
      cropEnd: null,
      frame: null,
      rotation: 0
    })
  })

  test('Save closes the window after a Reset, as it does after a trim', async () => {
    await mount([])
    await userEvent.click(reset())
    await userEvent.click(save())

    await expect.element(page.getByRole('dialog', { name: 'Preview' })).not.toBeInTheDocument()
  })
})
