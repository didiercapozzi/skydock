import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { getStatusDir, toISOString } from './utils'
import type { TaskState } from './types'

const taskStateSchema = z.enum(['idle', 'running', 'done', 'error'])

const statusPayloadSchema = z
  .object({
    state: taskStateSchema,
    message: z.string().optional(),
    updatedAt: z.string(),
    startedAt: z.string().optional()
  })
  .passthrough()

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
    statusPayloadSchema.parse(payload)
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
    const payload = { state: 'idle' as const, message: 'Idle', updatedAt: now }

    try {
      statusPayloadSchema.parse(payload)
      fs.writeFileSync(tmpPath, JSON.stringify(payload))
      fs.renameSync(tmpPath, finalPath)
    } catch {}
  }, delayMs)

  timer.unref()
}

export { scheduleIdle, writeStatus }
