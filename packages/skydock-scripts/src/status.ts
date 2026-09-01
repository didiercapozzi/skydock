import * as fs from 'node:fs'
import * as path from 'node:path'
import { getStatusDir, toISOString } from './utils'
import type { TaskState } from './types'

const writeStatus = (
  task: string,
  state: TaskState,
  message: string,
  outputDir?: string,
  extra?: Record<string, unknown>
): void => {
  const statusDir = getStatusDir(outputDir)
  fs.mkdirSync(statusDir, { recursive: true })

  const now = toISOString()
  const payload = {
    state,
    message,
    updatedAt: now,
    startedAt: now,
    ...extra
  }

  const tmpPath = path.join(statusDir, `${task}.json.tmp`)
  const finalPath = path.join(statusDir, `${task}.json`)

  try {
    fs.writeFileSync(tmpPath, JSON.stringify(payload))
    fs.renameSync(tmpPath, finalPath)
  } catch {}
}

const scheduleIdle = (task: string, delayMs: number, outputDir?: string): void => {
  const timer = setTimeout(() => {
    const now = toISOString()
    const statusDir = getStatusDir(outputDir)
    const tmpPath = path.join(statusDir, `${task}.json.tmp`)
    const finalPath = path.join(statusDir, `${task}.json`)

    try {
      fs.writeFileSync(tmpPath, JSON.stringify({ state: 'idle', message: 'Idle', updatedAt: now }))
      fs.renameSync(tmpPath, finalPath)
    } catch {}
  }, delayMs)

  timer.unref()
}

export { scheduleIdle, writeStatus }
