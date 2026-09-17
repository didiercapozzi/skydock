import * as path from 'node:path'
import * as childProcess from 'node:child_process'
import { z } from 'zod'
import { VIDEO_EXTENSIONS_SET } from './constants'
import type { ManifestFile } from './types'
import { DEFAULT_MAX_FIND_DEPTH, fileMatchesExisting, findMediaFiles, walkFiles } from './lib/fs'

const hasCommand = (cmd: string) => {
  try {
    childProcess.execSync(`command -v ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const checkExiftool = () => hasCommand('exiftool')

const getExtension = (filePath: string) => {
  const base = filePath.split('/').pop() ?? filePath
  const dot = base.lastIndexOf('.')
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase()
}

const isVideoFile = (filePath: string) => VIDEO_EXTENSIONS_SET.has(getExtension(filePath))

const getOutputDir = () =>
  (typeof process !== 'undefined' && process.env?.SKYDOCK_OUTPUT_DIR) || '/workspace/output'

const getManifestPath = (outputDir?: string) =>
  path.join(outputDir || getOutputDir(), 'manifest.json')

const getStatusDir = (outputDir?: string) => path.join(outputDir || getOutputDir(), '.status')

const sortFilesByMtime = (files: ManifestFile[]) => [...files].sort((a, b) => a.mtime - b.mtime)

const isCliModule = (baseName: string) => {
  if (typeof process === 'undefined' || !process.argv) return false
  const p = process.argv[1] ?? ''
  return p.endsWith(`${baseName}.ts`) || p.endsWith(`${baseName}.js`)
}

const daySchema = z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/, 'Invalid day, expected DD.MM.YYYY')

const parseDayEpoch = (day?: string) => {
  const parsed = daySchema.safeParse(day)
  if (!parsed.success) return null
  const [d, m, y] = parsed.data.split('.').map(Number)
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000)
}

/* The manifest writes a day the way the club reads it, `DD.MM.YYYY`. Anything that needs to sort
   days, or use one as a key, needs it the other way round — so the one translation lives here
   rather than being re-derived wherever a day is grouped. Returns '' for anything unrecognised,
   which callers treat as "no day recorded". */
const isoDay = (stored: string) => {
  const parts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(stored.trim())
  return parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : ''
}

const formatDay = (epoch: number) => {
  const day = new Date(epoch * 1000).toLocaleDateString('de-CH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  daySchema.parse(day)
  return day
}

const parseExiftoolCsv = (csv: string) => {
  const map = new Map<string, string>()
  const parseLine = (line: string) => {
    const result: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
        cur += ch
      } else if (ch === ',' && !inQuotes) {
        result.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
    result.push(cur)
    return result
  }
  const stripQuotes = (s: string) => {
    const t = s.trim()
    if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).trim()
    return t
  }
  for (const rawLine of csv.split('\n')) {
    if (!rawLine.trim()) continue
    const parts = parseLine(rawLine)
    if (parts.length < 2) continue
    const first = stripQuotes(parts[0])
    if (first === 'SourceFile') continue
    const file = first
    for (let i = 1; i < parts.length; i++) {
      const val = stripQuotes(parts[i])
      if (!val) continue
      if (/^\d{4}:\d{2}:\d{2}/.test(val)) {
        map.set(file, val)
        break
      }
    }
  }
  return map
}

/* runs at most `limit` promises at a time and keeps the results in input order — a tandem of
   several hundred files must not open several hundred DSM jobs at once */
const mapWithLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
) => {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return results
}

/* `delayMs` waits between attempts. Retrying a failed upload instantly tends to hit whatever
   transient state caused the failure (a remote NAS mid-write answers 418 "illegal name or path"),
   so a pause is what makes the retry worth having. */
const withRetry = async <T>(fn: () => Promise<T>, maxAttempts: number, delayMs = 0) => {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 && delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    try {
      return await fn()
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastError ?? new Error('Retry failed with no attempts')
}

export {
  checkExiftool,
  DEFAULT_MAX_FIND_DEPTH,
  fileMatchesExisting,
  findMediaFiles,
  formatDay,
  isoDay,
  getExtension,
  getManifestPath,
  getOutputDir,
  getStatusDir,
  hasCommand,
  isCliModule,
  isVideoFile,
  mapWithLimit,
  parseDayEpoch,
  parseExiftoolCsv,
  sortFilesByMtime,
  walkFiles,
  withRetry
}
