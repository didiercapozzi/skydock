import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { isMediaName } from '../constants'

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
        } else if (entry.isFile() && isMediaName(entry.name)) results.push(fullPath)
      }
    } catch {}
  }

  search(dir, 0)
  return results
}

/* Whether two files hold the same bytes, read a block at a time and given up on at the first
   difference — the whole of it only when they really are the same. Read here rather than asked of
   another program: it is the same work, and it needs nothing installed. */
const sameBytes = (left: string, right: string) => {
  const size = 1024 * 1024
  const a = Buffer.alloc(size)
  const b = Buffer.alloc(size)
  let first: number | null = null
  let second: number | null = null
  try {
    first = fs.openSync(left, 'r')
    second = fs.openSync(right, 'r')
    if (fs.fstatSync(first).size !== fs.fstatSync(second).size) return false
    for (;;) {
      const read = fs.readSync(first, a, 0, size, null)
      if (read !== fs.readSync(second, b, 0, size, null)) return false
      if (read === 0) return true
      if (!a.subarray(0, read).equals(b.subarray(0, read))) return false
    }
  } catch {
    return false
  } finally {
    if (first !== null) fs.closeSync(first)
    if (second !== null) fs.closeSync(second)
  }
}

const fileMatchesExisting = (src: string, destDir: string) => {
  const existing = path.join(destDir, path.basename(src))
  return fs.existsSync(existing) && sameBytes(src, existing)
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

const walkFiles = (dir: string) => {
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

/* streamed so a 4 GB video costs no more memory than a photo — md5 because that is the only
   digest DSM can compute for a file already sitting on the NAS */
const hashFile = (filePath: string, algorithm = 'md5') =>
  new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash(algorithm)
    const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 })
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })

const writeJsonAtomic = (target: string, value: unknown) => {
  const tmp = `${target}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, target)
}

/* A file moved to another folder, which may be on another drive — a camera's card, the bin on the
   machine's disk. Within one drive it is renamed; across two it is copied whole under a temporary
   name, given its own only once complete, and only then removed where it was, so a move cut off half
   way leaves the file where it was and nothing that passes for it. */
const moveFile = async (from: string, to: string) => {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  try {
    await fs.promises.rename(from, to)
    return
  } catch (e) {
    if (!(e instanceof Error && 'code' in e && e.code === 'EXDEV')) throw e
  }
  const partial = `${to}.part`
  try {
    await fs.promises.copyFile(from, partial)
    const stat = fs.statSync(from)
    fs.utimesSync(partial, stat.atime, stat.mtime)
    fs.renameSync(partial, to)
  } catch (e) {
    fs.rmSync(partial, { force: true })
    throw e
  }
  await fs.promises.unlink(from)
}

export {
  countFiles,
  DEFAULT_MAX_FIND_DEPTH,
  fileMatchesExisting,
  findMediaFiles,
  hashFile,
  moveFile,
  sameBytes,
  walkFiles,
  writeJsonAtomic
}
