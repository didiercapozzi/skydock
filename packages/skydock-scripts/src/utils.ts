import * as path from 'node:path'
import * as childProcess from 'node:child_process'
import { z } from 'zod'
import { VIDEO_EXTENSIONS_SET, PHOTO_EXTENSIONS_SET, MEDIA_EXTENSIONS_SET } from './constants'
import type { ManifestFile } from './types'
import { countFiles, fileMatchesExisting, findMediaFiles, hasMediaFiles, walkFiles } from './lib/fs'
import { DEFAULT_MAX_FIND_DEPTH } from './lib/fs'

const hasCommand = (cmd: string): boolean => {
  try {
    childProcess.execSync(`command -v ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const checkExiftool = (): boolean => hasCommand('exiftool')

const sanitizeLabel = (label: string): string => label.replace(/[^a-zA-Z0-9._-]/g, '_')

const getExtension = (filePath: string): string => {
  const base = filePath.split('/').pop() ?? filePath
  const dot = base.lastIndexOf('.')
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase()
}

const isVideoFile = (filePath: string): boolean => VIDEO_EXTENSIONS_SET.has(getExtension(filePath))

const isPhotoFile = (filePath: string): boolean => PHOTO_EXTENSIONS_SET.has(getExtension(filePath))

const isMediaFile = (filePath: string): boolean => MEDIA_EXTENSIONS_SET.has(getExtension(filePath))

const getOutputDir = (): string =>
  (typeof process !== 'undefined' && process.env?.SKYDOCK_OUTPUT_DIR) || '/workspace/output'

const getManifestPath = (outputDir?: string): string =>
  path.join(outputDir || getOutputDir(), 'manifest.json')

const getStatusDir = (outputDir?: string): string =>
  path.join(outputDir || getOutputDir(), '.status')

const sortFilesByMtime = (files: ManifestFile[]): ManifestFile[] =>
  [...files].sort((a, b) => a.mtime - b.mtime)

const getExtensionSafe = (filePath: string): string => {
  const ext = getExtension(filePath)
  return ext || 'unknown'
}

const formatTimestamp = (epoch: number): string => {
  const date = new Date(epoch * 1000)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const h = String(date.getUTCHours()).padStart(2, '0')
  const min = String(date.getUTCMinutes()).padStart(2, '0')
  const s = String(date.getUTCSeconds()).padStart(2, '0')
  return `${y}${m}${d}_${h}${min}${s}`
}

const toISOString = (date?: Date): string => (date || new Date()).toISOString()

const isCliModule = (baseName: string): boolean => {
  if (typeof process === 'undefined' || !process.argv) return false
  const p = process.argv[1] ?? ''
  return p.endsWith(`${baseName}.ts`) || p.endsWith(`${baseName}.js`)
}

const daySchema = z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/, 'Invalid day, expected DD.MM.YYYY')

const parseDayEpoch = (day?: string): number | null => {
  const parsed = daySchema.safeParse(day)
  if (!parsed.success) return null
  const [d, m, y] = parsed.data.split('.').map(Number)
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000)
}

const formatDay = (epoch: number): string => {
  const day = new Date(epoch * 1000).toLocaleDateString('de-CH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  daySchema.parse(day)
  return day
}

const formatTodayDeCh = (): string => formatDay(Math.floor(Date.now() / 1000))

const dayToIso = (day: string): string => {
  const parsed = daySchema.safeParse(day)
  if (!parsed.success) throw new Error(parsed.error.issues[0].message)
  const [d, m, y] = parsed.data.split('.').map(Number)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const isoToDay = (isoDate: string): string => {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) throw new Error('Invalid ISO date, expected YYYY-MM-DD')
  const [, y, mon, d] = m
  const day = `${d}.${mon}.${y}`
  daySchema.parse(day)
  return day
}

const parseExiftoolCsv = (csv: string): Map<string, string> => {
  const map = new Map<string, string>()
  const parseLine = (line: string): string[] => {
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
  const stripQuotes = (s: string): string => {
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

export {
  checkExiftool,
  countFiles,
  daySchema,
  dayToIso,
  DEFAULT_MAX_FIND_DEPTH,
  fileMatchesExisting,
  findMediaFiles,
  formatDay,
  formatTodayDeCh,
  formatTimestamp,
  getExtension,
  getExtensionSafe,
  getManifestPath,
  getOutputDir,
  getStatusDir,
  hasCommand,
  hasMediaFiles,
  isCliModule,
  isoToDay,
  isMediaFile,
  isPhotoFile,
  isVideoFile,
  parseDayEpoch,
  parseExiftoolCsv,
  sanitizeLabel,
  sortFilesByMtime,
  toISOString,
  walkFiles
}
