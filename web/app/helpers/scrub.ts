/* Dragging along the timeline asks for a new moment on every move of the pointer — a hundred times a
   second — and each seek the video is sent interrupts the one before, so a steady drag can keep it
   seeking without ever drawing a frame, and now and then leaves it stuck until something else seeks
   it. So a seek is only sent once the one before has landed: meanwhile only the latest moment asked
   for is kept, and it goes the moment the video is free. A seek that has not landed after a quarter
   of a second is not waited for any longer, so nothing can wedge the picture. */

const STUCK_MS = 250

type Seekable = { seeking: boolean; currentTime: number }

const createScrub = () => {
  let pending: number | null = null
  let since = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const send = (el: Seekable, time: number) => {
    pending = null
    since = Date.now()
    el.currentTime = time
  }
  const flush = (el: Seekable) => {
    if (timer) clearTimeout(timer)
    timer = null
    if (pending !== null) send(el, pending)
  }

  return {
    /* a moment asked for: sent now if the video is free, else kept as the next one */
    seek: (el: Seekable, time: number) => {
      if (el.seeking && Date.now() - since < STUCK_MS) {
        pending = time
        timer ??= setTimeout(() => flush(el), STUCK_MS)
        return
      }
      if (timer) clearTimeout(timer)
      timer = null
      send(el, time)
    },
    /* the video landed: the latest moment asked for meanwhile goes now */
    seeked: flush
  }
}

export { createScrub }
