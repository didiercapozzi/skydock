import { scheduleIdle, writeStatus } from '../status'
import { isCliModule } from '../utils'

const withStatus = <T>(task: string, runningMsg: string, fn: () => T, outputDir?: string): T => {
  writeStatus(task, 'running', runningMsg, outputDir)
  try {
    const result = fn()
    if (result instanceof Promise) {
      return result
        .then((v) => {
          writeStatus(task, 'done', runningMsg, outputDir)
          scheduleIdle(task, 5000, outputDir)
          return v
        })
        .catch((e) => {
          writeStatus(task, 'error', e instanceof Error ? e.message : String(e), outputDir)
          throw e
        }) as T
    }
    writeStatus(task, 'done', runningMsg, outputDir)
    scheduleIdle(task, 5000, outputDir)
    return result
  } catch (e) {
    writeStatus(task, 'error', e instanceof Error ? e.message : String(e), outputDir)
    throw e
  }
}

export { isCliModule, withStatus }
