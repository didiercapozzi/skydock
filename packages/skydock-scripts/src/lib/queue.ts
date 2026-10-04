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
