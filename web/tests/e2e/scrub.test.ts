import { afterEach, describe, expect, test, vi } from 'vitest'
import { createScrub } from '../../app/helpers/scrub'


const video = () => {
  const sent: number[] = []
  let at = 0
  return {
    sent,
    seeking: false,
    get currentTime() {
      return at
    },
    set currentTime(t: number) {
      at = t
      sent.push(t)
    }
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('dragging along the timeline', () => {
  test('sends a moment at once while the video is free', () => {
    const scrub = createScrub()
    const el = video()

    scrub.seek(el, 2)

    expect(el.sent).toEqual([2])
  })

  test('keeps only the latest moment while the video is still seeking, and sends it when it lands', () => {
    const scrub = createScrub()
    const el = video()
    scrub.seek(el, 1)
    el.seeking = true

    scrub.seek(el, 2)
    scrub.seek(el, 3)
    scrub.seek(el, 4)
    expect(el.sent).toEqual([1])

    el.seeking = false
    scrub.seeked(el)
    expect(el.sent).toEqual([1, 4])
  })

  test('never waits on a seek for more than a quarter of a second', () => {
    vi.useFakeTimers()
    const scrub = createScrub()
    const el = video()
    scrub.seek(el, 1)
    el.seeking = true

    scrub.seek(el, 5)
    vi.advanceTimersByTime(260)

    expect(el.sent).toEqual([1, 5])
  })
})
