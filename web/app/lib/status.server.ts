import * as fs from 'node:fs'
import * as path from 'node:path'
import { getOutputDirPath } from './scanner.server'

export type TaskState = 'idle' | 'running' | 'done' | 'error'

export type TaskStatus = {
  state: TaskState
  message?: string
  total?: number
  done?: number
  startedAt?: string
  updatedAt?: string
  error?: string
}

export type SystemStatus = {
  proxies: TaskStatus
  scan: TaskStatus
  execute: TaskStatus
  process: TaskStatus
}

const STATUS_DIR_NAME = '.status'

const getStatusDir = (): string => path.join(getOutputDirPath(), STATUS_DIR_NAME)

const readTask = (name: string): TaskStatus => {
  const file = path.join(getStatusDir(), `${name}.json`)
  if (!fs.existsSync(file)) return { state: 'idle' }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as TaskStatus
    if (
      raw.state !== 'running' &&
      raw.state !== 'done' &&
      raw.state !== 'error' &&
      raw.state !== 'idle'
    )
      return { state: 'idle' }
    if (raw.state === 'running') {
      const updated = raw.updatedAt ? new Date(raw.updatedAt).getTime() : 0
      if (Date.now() - updated > 120_000) {
        return { state: 'idle' }
      }
    }
    return raw
  } catch {
    return { state: 'idle' }
  }
}

const getSystemStatus = (): SystemStatus => ({
  proxies: readTask('proxies'),
  scan: readTask('scan'),
  execute: readTask('execute'),
  process: readTask('process')
})

const isAnyRunning = (status: SystemStatus): boolean =>
  status.proxies.state === 'running' ||
  status.scan.state === 'running' ||
  status.execute.state === 'running' ||
  status.process.state === 'running'

export { getStatusDir, getSystemStatus, isAnyRunning, readTask }
