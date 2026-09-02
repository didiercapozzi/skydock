import * as fs from 'node:fs'
import * as path from 'node:path'
import { getStatusDir } from '@skydock/scripts'
import type { TaskStatus, SystemStatus } from '@skydock/scripts'

const STALE_THRESHOLD_MS = 120_000

export type { SystemStatus }

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
      if (Date.now() - updated > STALE_THRESHOLD_MS) {
        return { state: 'idle' }
      }
    }
    return raw
  } catch {
    return { state: 'idle' }
  }
}

const getSystemStatus = (): SystemStatus => ({
  scan: readTask('scan'),
  execute: readTask('execute'),
  process: readTask('process')
})

const isAnyRunning = (status: SystemStatus): boolean =>
  status.scan.state === 'running' ||
  status.execute.state === 'running' ||
  status.process.state === 'running'

export { getSystemStatus, isAnyRunning, readTask }
