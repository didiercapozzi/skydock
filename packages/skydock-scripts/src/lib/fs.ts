import * as fs from 'node:fs'
import * as path from 'node:path'
import * as childProcess from 'node:child_process'
import { MEDIA_EXTENSIONS_SET } from '../constants'

const DEFAULT_MAX_FIND_DEPTH = 10

const findMediaFiles = (dir: string, maxDepth = DEFAULT_MAX_FIND_DEPTH) => {
  const results: string[] = []

  const search = (currentDir: string, depth: number) => {
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

const hasMediaFiles = (dir: string, maxDepth = DEFAULT_MAX_FIND_DEPTH) => {
  const search = (currentDir: string, depth: number) => {
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

const fileMatchesExisting = (src: string, destDir: string) => {
  const existing = path.join(destDir, path.basename(src))
  if (!fs.existsSync(existing)) return false
  try {
    const quoted = (v: string) => `"${v.replace(/(["$`\\])/g, '\\$1')}"`
    childProcess.execSync(`cmp -s ${quoted(src)} ${quoted(existing)}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const countFiles = (dir: string) => {
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

type WalkItem = {
  full: string
  dir: boolean
  file: boolean
}

const pushEntries = (stack: WalkItem[], dir: string, entries: fs.Dirent[]) => {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (!entry) continue
    stack.push({
      full: path.join(dir, entry.name),
      dir: entry.isDirectory(),
      file: entry.isFile()
    })
  }
}

const walkFiles = (dir: string): string[] => {
  const results: string[] = []
  const stack: WalkItem[] = []
  try {
    pushEntries(stack, dir, fs.readdirSync(dir, { withFileTypes: true }))
  } catch {
    return results
  }
  while (stack.length > 0) {
    const item = stack.pop()
    if (!item) continue
    if (!item.dir) {
      if (item.file) results.push(item.full)
      continue
    }
    try {
      pushEntries(stack, item.full, fs.readdirSync(item.full, { withFileTypes: true }))
    } catch {
      continue
    }
  }
  return results
}

const writeJsonAtomic = (target: string, value: unknown) => {
  const tmp = `${target}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, target)
}

export {
  countFiles,
  DEFAULT_MAX_FIND_DEPTH,
  fileMatchesExisting,
  findMediaFiles,
  hasMediaFiles,
  walkFiles,
  writeJsonAtomic
}
