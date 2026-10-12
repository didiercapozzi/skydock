import { setTimeout as sleep } from 'node:timers/promises'

declare global {
  var skydockCopiesUnderWay: number | undefined
}

const copyBegins = () => {
  globalThis.skydockCopiesUnderWay = (globalThis.skydockCopiesUnderWay ?? 0) + 1
  let over = false
  return () => {
    if (over) return
    over = true
    globalThis.skydockCopiesUnderWay = Math.max(0, (globalThis.skydockCopiesUnderWay ?? 1) - 1)
  }
}

const untilQuiet = async () => {
  while ((globalThis.skydockCopiesUnderWay ?? 0) > 0) await sleep(500)
}

export { copyBegins, untilQuiet }
