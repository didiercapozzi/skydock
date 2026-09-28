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
   another program: it is the same work, and it needs nothing installed. Read without holding the
   server: two 4 GB clips take seconds. */
const sameBytes = async (left: string, right: string) => {
  const size = 1024 * 1024
  const a = Buffer.alloc(size)
  const b = Buffer.alloc(size)
  let first: fs.promises.FileHandle | null = null
  let second: fs.promises.FileHandle | null = null
  try {
    first = await fs.promises.open(left, 'r')
    second = await fs.promises.open(right, 'r')
    if ((await first.stat()).size !== (await second.stat()).size) return false
    for (;;) {
      const [one, two] = await Promise.all([
        first.read(a, 0, size, null),
        second.read(b, 0, size, null)
      ])
      if (one.bytesRead !== two.bytesRead) return false
      if (one.bytesRead === 0) return true
      if (!a.subarray(0, one.bytesRead).equals(b.subarray(0, two.bytesRead))) return false
    }
  } catch {
    return false
  } finally {
    await first?.close()
    await second?.close()
  }
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

/* Written whole or not at all: under a name of its own — two writers never share one — flushed to the
   disk, then renamed over the old file, so a crash or a power cut leaves the old file or the new one,
   never half of either. */
const writeJsonAtomic = (target: string, value: unknown) => {
  const tmp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  try {
    const fd = fs.openSync(tmp, 'w')
    try {
      fs.writeFileSync(fd, JSON.stringify(value, null, 2))
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    fs.renameSync(tmp, target)
  } catch (e) {
    fs.rmSync(tmp, { force: true })
    throw e
  }
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
  DEFAULT_MAX_FIND_DEPTH,
  findMediaFiles,
  hashFile,
  moveFile,
  sameBytes,
  walkFiles,
  writeJsonAtomic
}
