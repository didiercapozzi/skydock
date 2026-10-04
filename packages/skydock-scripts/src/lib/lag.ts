import * as perfHooks from 'node:perf_hooks'

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
