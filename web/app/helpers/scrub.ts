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
    seeked: flush
  }
}

export { createScrub }
