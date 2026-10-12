import { afterEach, describe, expect, test, vi } from 'vitest'
import { createScrub } from '../../app/helpers/scrub'


const picture = () => {
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

type Picture = ReturnType<typeof picture>

const startMoving = (el: Picture) => {
  el.seeking = true
}

const land = (scrub: ReturnType<typeof createScrub>, el: Picture) => {
  el.seeking = false
  scrub.seeked(el)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('dragging along the timeline', () => {
  test('the picture follows the pointer at once', () => {
    const scrub = createScrub()
    const el = picture()

    scrub.seek(el, 2)

    expect(el.sent).toEqual([2])
  })

  test('when the picture is still moving only the latest place is asked for', () => {
    const scrub = createScrub()
    const el = picture()
    scrub.seek(el, 1)
    startMoving(el)

    scrub.seek(el, 2)
    scrub.seek(el, 3)
    scrub.seek(el, 4)
    expect(el.sent).toEqual([1])

    land(scrub, el)
    expect(el.sent).toEqual([1, 4])
  })

  test('never stuck when the pointer stops', () => {
    vi.useFakeTimers()
    const scrub = createScrub()
    const el = picture()
    scrub.seek(el, 1)
    startMoving(el)

    scrub.seek(el, 5)
    vi.advanceTimersByTime(260)

    expect(el.sent).toEqual([1, 5])
  })
})
