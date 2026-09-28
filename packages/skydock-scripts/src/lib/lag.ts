import * as perfHooks from 'node:perf_hooks'

/* Whether anything holds the server — a tool waited on, a folder read whole — long enough for the
   board to feel it. Everything the board asks waits while the server is held, so a hold of a tenth
   of a second is already a click that does nothing; each one is said, with how long, so the next
   one is found by its line in the log rather than by somebody noticing the board froze. */
const HELD_MS = 100

declare global {
  var skydockLagWatch: boolean | undefined
}

const watchServerHolds = () => {
  if (globalThis.skydockLagWatch) return
  globalThis.skydockLagWatch = true
  const delay = perfHooks.monitorEventLoopDelay({ resolution: 20 })
  delay.enable()
  setInterval(() => {
    const worst = delay.max / 1e6
    delay.reset()
    if (worst > HELD_MS) console.warn(`[Server] held for ${Math.round(worst)} ms`)
  }, 5000).unref()
}

export { watchServerHolds }
