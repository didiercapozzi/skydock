import { createElement } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { FilmPart } from '../../app/components/film-part'

const clip = { id: 'clip-1', name: 'a.mp4', start: 2, end: 8, sound: true }

const source = {
  name: 'a.mp4',
  path: '/o/a.mp4',
  play: '/o/a.mp4',
  seconds: 20,
  sound: true,
  marks: [
    { which: 'exit' as const, at: 5 },
    { which: 'opening' as const, at: 14 }
  ]
}

type Placed = {
  start: number
  end: number
  speed: number
  frame: { x: number; y: number; width: number; height: number } | null
  rotation: 0 | 90 | 180 | 270
}

const open = async (over: Record<string, unknown> = {}) => {
  const placed: Placed[] = []
  const calls = { removed: 0, closed: 0 }
  await render(
    createElement(FilmPart, {
      clip: { ...clip, ...over },
      source,
      onPlace: (one: Placed) => placed.push(one),
      onRemove: () => calls.removed++,
      onClose: () => calls.closed++
    })
  )
  await expect.element(page.getByRole('dialog', { name: 'Choose the part of a.mp4' })).toBeVisible()
  return { placed, calls }
}

describe('choosing the part of a clip', () => {
  test('is the app’s own cropper over the clip, with its trim handles, and the jump marks', async () => {
    await open()

    expect(document.querySelector('[data-crop-start-handle]')).not.toBeNull()
    expect(document.querySelector('[data-crop-end-handle]')).not.toBeNull()
    await expect.element(page.getByRole('button', { name: 'Start here' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'End here' })).toBeVisible()
    await expect.element(page.getByText('exit')).toBeVisible()
    await expect.element(page.getByText('opening')).toBeVisible()
  })

  test('takes the part as it is, at normal speed, with the button of the dialog or the cropper’s Apply', async () => {
    const { placed } = await open()

    await userEvent.click(page.getByRole('button', { name: 'Use this part' }))
    await userEvent.click(page.getByRole('button', { name: 'Apply' }))

    const whole = { start: 2, end: 8, speed: 1, frame: null, rotation: 0 }
    expect(placed).toEqual([whole, whole])
  })

  test('does not place a part shorter than half a second from the cropper’s Apply', async () => {
    const { placed } = await open({ start: 2, end: 2.3 })

    await userEvent.click(page.getByRole('button', { name: 'Apply' }))

    expect(placed).toEqual([])
  })

  test('has a speed, from a quarter to four times, and says how long the part then lasts', async () => {
    const { placed } = await open({ speed: 2 })
    const speed = page.getByRole('combobox', { name: 'Speed' })

    await expect.element(speed).toHaveValue('2')
    await expect.element(page.getByText(/lasts 0:03\.0/)).toBeVisible()
    await userEvent.selectOptions(speed, '0.5')
    await expect.element(page.getByText(/lasts 0:12\.0/)).toBeVisible()
    await userEvent.click(page.getByRole('button', { name: 'Use this part' }))

    expect(placed).toEqual([{ start: 2, end: 8, speed: 0.5, frame: null, rotation: 0 }])
  })

  test('goes back to the whole clip with Reset trim, and stays open to choose again', async () => {
    const { placed, calls } = await open()
    await expect.element(page.getByText(/0:02\.0 – 0:08\.0/)).toBeVisible()

    await userEvent.click(page.getByRole('button', { name: 'Reset trim' }))

    await expect.element(page.getByText(/0:00\.0 – 0:20\.0/)).toBeVisible()
    expect(placed).toEqual([])
    expect(calls.closed).toBe(0)
    await userEvent.click(page.getByRole('button', { name: 'Use this part' }))
    expect(placed).toEqual([{ start: 0, end: 20, speed: 1, frame: null, rotation: 0 }])
  })

  test('cancels, and removes the clip, from the buttons of the dialog', async () => {
    const { calls } = await open()

    await userEvent.click(page.getByRole('button', { name: 'Remove the clip' }))
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }))

    expect(calls).toEqual({ removed: 1, closed: 1 })
  })

  test('has the tabs of the app’s preview, Cut, Frame and Turn, and opens on the cut', async () => {
    await open()
    const tabs = page.getByRole('group', { name: 'What to change' })

    for (const name of ['Cut', 'Frame', 'Turn'])
      await expect.element(tabs.getByRole('button', { name, exact: true })).toBeVisible()
    await expect
      .element(tabs.getByRole('button', { name: 'Cut', exact: true }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  test('crops the frame to a shape from the Frame tab, as the app’s preview does, and takes it off again', async () => {
    const { placed } = await open()
    await userEvent.click(page.getByRole('group', { name: 'What to change' }).getByRole('button', { name: 'Frame', exact: true }))
    await expect.element(page.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(page.getByRole('button', { name: '1:1' }))
    await expect.element(page.getByRole('button', { name: '1:1' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(page.getByRole('button', { name: 'Use this part' }))

    expect(placed[0]!.frame).toEqual({ x: (1 - 9 / 16) / 2, y: 0, width: 9 / 16, height: 1 })

    await userEvent.click(page.getByRole('button', { name: 'None' }))
    await userEvent.click(page.getByRole('button', { name: 'Use this part' }))
    expect(placed[1]!.frame).toBeNull()
  })

  test('shows the frame that the clip already has, and keeps it when nothing is changed', async () => {
    const frame = { x: 0.25, y: 0, width: 0.5, height: 1 }
    const { placed } = await open({ frame })
    await userEvent.click(page.getByRole('group', { name: 'What to change' }).getByRole('button', { name: 'Frame', exact: true }))

    await expect.element(page.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(page.getByRole('button', { name: 'Use this part' }))

    expect(placed[0]!.frame).toEqual(frame)
  })

  test('turns the picture a quarter turn at a time from the Turn tab', async () => {
    const { placed } = await open()
    await userEvent.click(page.getByRole('group', { name: 'What to change' }).getByRole('button', { name: 'Turn', exact: true }))

    await userEvent.click(page.getByRole('button', { name: '↻ +90°' }))
    await expect.element(page.getByRole('button', { name: '↻ +90°' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(page.getByRole('button', { name: 'Use this part' }))
    await userEvent.click(page.getByRole('button', { name: '↻ +180°' }))
    await userEvent.click(page.getByRole('button', { name: 'Use this part' }))
    await userEvent.click(page.getByRole('button', { name: '0°' }))
    await userEvent.click(page.getByRole('button', { name: 'Use this part' }))

    expect(placed.map((one) => one.rotation)).toEqual([90, 270, 0])
  })

  test('draws a turned clip as large as the picture is, so that the frame to crop is over what is seen', async () => {
    await open({ rotation: 90 })
    const video = document.querySelector<HTMLVideoElement>('[role=dialog] video')!
    const stage = video.parentElement!

    expect(getComputedStyle(video).maxWidth).toBe('none')
    expect(Math.abs(video.offsetWidth - stage.clientHeight)).toBeLessThan(2)
    expect(Math.abs(video.offsetHeight - stage.clientWidth)).toBeLessThan(2)
  })
})
