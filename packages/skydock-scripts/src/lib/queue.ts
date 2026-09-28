/* At most so many of a kind of work at once, the rest waiting their turn in the order asked: a
   folder of fifty clips opened asks for fifty frames at once, and fifty ffmpeg runs side by side
   leave nothing of the machine for anything else — the board, the proxies, the copy under way. A
   turn asked for by someone who has since gone (a page closed, a picture scrolled away) is not run.

   The same work asked for again while it is still waiting or running is the one run, shared. */
const limited = <T>(atOnce: number) => {
  let running = 0
  const waiting: (() => void)[] = []
  const sharing = new Map<string, Promise<T>>()
  const next = () => {
    if (running >= atOnce) return
    const start = waiting.shift()
    if (start) start()
  }
  const run = (key: string, work: () => Promise<T>, gone?: AbortSignal) => {
    const already = sharing.get(key)
    if (already) return already
    const turn = new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        if (gone?.aborted) {
          reject(new Error('No longer wanted'))
          next()
          return
        }
        running++
        work()
          .then(resolve, reject)
          .finally(() => {
            running--
            next()
          })
      })
      next()
    }).finally(() => sharing.delete(key))
    sharing.set(key, turn)
    return turn
  }
  return run
}

export { limited }
