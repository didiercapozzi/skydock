import * as path from 'node:path'
import { getExtension } from './constants'
import { pathExists, statOrNull } from './lib/fs'
import {
  formatDay,
  getOutputDir,
  isoDay,
  isVideoFile,
  parseDayEpoch,
  sortFilesByMtime
} from './plain'

const TOOL_ENV: Record<string, string> = {
  ffmpeg: 'SKYDOCK_FFMPEG_PATH',
  ffprobe: 'SKYDOCK_FFPROBE_PATH',
  exiftool: 'SKYDOCK_EXIFTOOL_PATH'
}

const programNames = (name: string) =>
  process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT')
        .split(';')
        .filter(Boolean)
        .map((ext) => `${name}${ext.toLowerCase()}`)
    : [name]

const onPath = async (name: string) => {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean))
    for (const called of programNames(name)) {
      const target = path.join(dir, called)
      if ((await statOrNull(target))?.isFile()) return target
    }
  return null
}

const toolPath = async (name: string) => {
  const told = TOOL_ENV[name] ? process.env[TOOL_ENV[name]]?.trim() : undefined
  if (told) return (await pathExists(told)) ? told : null
  if (name.includes('/') || name.includes(path.sep)) return (await pathExists(name)) ? name : null
  return onPath(name)
}

const hasCommand = async (cmd: string) => (await toolPath(cmd)) !== null

const systemTool = async (name: string) => {
  const found = await onPath(name)
  return found !== null && found !== (await toolPath(name)) ? found : null
}

const ffmpegPath = async () => (await toolPath('ffmpeg')) ?? 'ffmpeg'

const ffprobePath = async () => (await toolPath('ffprobe')) ?? 'ffprobe'

const exiftoolPath = async () => (await toolPath('exiftool')) ?? 'exiftool'

const getManifestPath = (outputDir?: string) =>
  path.join(outputDir || getOutputDir(), 'manifest.json')

const getStatusDir = (outputDir?: string) => path.join(outputDir || getOutputDir(), '.status')

const getConfigDir = () =>
  (typeof process !== 'undefined' && process.env?.SKYDOCK_CONFIG_DIR) || '/workspace/config'

const getTrashDir = () =>
  (typeof process !== 'undefined' && process.env?.SKYDOCK_TRASH_DIR) ||
  path.join(getOutputDir(), '.trash')

const isCliModule = (baseName: string) => {
  if (typeof process === 'undefined' || !process.argv) return false
  const p = process.argv[1] ?? ''
  return p.endsWith(`${baseName}.ts`) || p.endsWith(`${baseName}.js`)
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

const withRetry = async <T>(fn: () => Promise<T>, maxAttempts: number, delayMs = 0) => {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 && delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    try {
      return await fn()
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e
      lastError = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastError ?? new Error('Retry failed with no attempts')
}

const sizeOf = async (file: string) => (await statOrNull(file))?.size ?? 0

export {
  systemTool,
  toolPath,
  ffmpegPath,
  ffprobePath,
  exiftoolPath,
  formatDay,
  isoDay,
  getExtension,
  getManifestPath,
  getOutputDir,
  getConfigDir,
  getTrashDir,
  getStatusDir,
  hasCommand,
  isCliModule,
  isVideoFile,
  mapWithLimit,
  parseDayEpoch,
  parseExiftoolCsv,
  sizeOf,
  sortFilesByMtime,
  withRetry
}
