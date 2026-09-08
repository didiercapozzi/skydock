import * as fs from 'node:fs'
import * as path from 'node:path'
import * as childProcess from 'node:child_process'
import { MEDIA_EXTENSIONS_SET } from '../constants'

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

const hasMediaFiles = (dir: string, maxDepth = DEFAULT_MAX_FIND_DEPTH): boolean => {
  const search = (currentDir: string, depth: number): boolean => {
    if (depth > maxDepth) return false
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1).toLowerCase()
          if (MEDIA_EXTENSIONS_SET.has(ext)) return true
        }
      }
      for (const entry of entries) {
        if (entry.isDirectory() && search(path.join(currentDir, entry.name), depth + 1)) {
          return true
        }
      }
    } catch {}
    return false
  }

  return search(dir, 0)
}

const fileMatchesExisting = (src: string, destDir: string): boolean => {
  const existing = path.join(destDir, path.basename(src))
  if (!fs.existsSync(existing)) return false
  try {
    childProcess.execSync(`cmp -s "${src}" "${existing}"`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const countFiles = (dir: string): number => {
  let count = 0
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile()) count++
      else if (entry.isDirectory()) count += countFiles(fullPath)
    }
  } catch {}
  return count
}

const walkFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walkFiles(full) : entry.isFile() ? [full] : []
  })

export {
  countFiles,
  DEFAULT_MAX_FIND_DEPTH,
  fileMatchesExisting,
  findMediaFiles,
  hasMediaFiles,
  walkFiles
}
