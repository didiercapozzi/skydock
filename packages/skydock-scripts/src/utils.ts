import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { VIDEO_EXTENSIONS_SET, PHOTO_EXTENSIONS_SET, MEDIA_EXTENSIONS_SET } from './constants'
import type { ManifestFile } from './types'

const DEFAULT_MAX_FIND_DEPTH = 10

const findMediaFiles = (dir: string, maxDepth = DEFAULT_MAX_FIND_DEPTH): string[] => {
  const results: string[] = []

  const search = (currentDir: string, depth: number): void => {
    if (depth > maxDepth) return
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)
        if (entry.isDirectory()) {
          search(fullPath, depth + 1)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1).toLowerCase()
          if (MEDIA_EXTENSIONS_SET.has(ext)) results.push(fullPath)
        }
      }
    } catch {}
  }

  search(dir, 0)
  return results
}

const hasCommand = (cmd: string): boolean => {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const checkExiftool = (): boolean => hasCommand('exiftool')

const sanitizeLabel = (label: string): string => label.replace(/[^a-zA-Z0-9._-]/g, '_')

const getExtension = (filePath: string): string => path.extname(filePath).slice(1).toLowerCase()

const isVideoFile = (filePath: string): boolean => VIDEO_EXTENSIONS_SET.has(getExtension(filePath))

const isPhotoFile = (filePath: string): boolean => PHOTO_EXTENSIONS_SET.has(getExtension(filePath))

const isMediaFile = (filePath: string): boolean => MEDIA_EXTENSIONS_SET.has(getExtension(filePath))

const getOutputDir = (): string => process.env.SKYDOCK_OUTPUT_DIR || '/workspace/output'

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
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${y}${m}${d}_${h}${min}${s}`
}

const toISOString = (date?: Date): string => (date || new Date()).toISOString()

const isCliModule = (baseName: string): boolean => {
  const p = process.argv[1] ?? ''
  return p.endsWith(`${baseName}.ts`) || p.endsWith(`${baseName}.js`)
}

const parseExiftoolCsv = (csv: string): Map<string, string> => {
  const map = new Map<string, string>()
  for (const line of csv.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(',')
    if (parts.length < 2 || parts[0] === 'SourceFile') continue
    const file = parts[0].replace(/^"|"$/g, '')
    for (let i = 1; i < parts.length; i++) {
      const val = parts[i].replace(/^"|"$/g, '').trim()
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
  findMediaFiles,
  formatTimestamp,
  getExtension,
  getExtensionSafe,
  getManifestPath,
  getOutputDir,
  getStatusDir,
  hasCommand,
  isCliModule,
  isMediaFile,
  isPhotoFile,
  isVideoFile,
  parseExiftoolCsv,
  sanitizeLabel,
  sortFilesByMtime,
  toISOString
}
