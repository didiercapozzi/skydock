import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as streams from 'node:stream/promises'
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

const statOrNull = (file: string) => {
  try {
    return fs.statSync(file)
  } catch {
    return null
  }
}

const mtimeOf = (file: string) => Math.floor(fs.statSync(file).mtimeMs / 1000)

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

const hashFile = (filePath: string, algorithm = 'md5') =>
  new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash(algorithm)
    const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 })
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })

const openToHost = (dir: string, like: string) => {
  const owner = fs.statSync(like)
  const root = process.getuid?.() === 0
  const stack = [dir]
  while (stack.length > 0) {
    const here = stack.pop()!
    try {
      const stat = fs.lstatSync(here)
      if (stat.isSymbolicLink()) continue
      if (root && (stat.uid !== owner.uid || stat.gid !== owner.gid))
        fs.chownSync(here, owner.uid, owner.gid)
      fs.chmodSync(here, stat.isDirectory() ? 0o777 : stat.mode | 0o666)
      if (stat.isDirectory())
        for (const name of fs.readdirSync(here)) stack.push(path.join(here, name))
    } catch {}
  }
}

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

const moveFile = async (
  from: string,
  to: string,
  onBytes?: (copied: number, total: number) => void
) => {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  try {
    await fs.promises.rename(from, to)
    return
  } catch (e) {
    if (!(e instanceof Error && 'code' in e && e.code === 'EXDEV')) throw e
  }
  const partial = `${to}.part`
  try {
    const stat = fs.statSync(from)
    if (onBytes) {
      let copied = 0
      const reading = fs
        .createReadStream(from, { highWaterMark: 1024 * 1024 })
        .on('data', (chunk) => {
          copied += chunk.length
          onBytes(copied, stat.size)
        })
      await streams.pipeline(reading, fs.createWriteStream(partial))
    } else await fs.promises.copyFile(from, partial)
    fs.utimesSync(partial, stat.atime, stat.mtime)
    fs.renameSync(partial, to)
  } catch (e) {
    fs.rmSync(partial, { force: true })
    throw e
  }
  try {
    await fs.promises.unlink(from)
  } catch (e) {
    fs.rmSync(to, { force: true })
    throw e
  }
}

export {
  DEFAULT_MAX_FIND_DEPTH,
  findMediaFiles,
  hashFile,
  moveFile,
  mtimeOf,
  openToHost,
  sameBytes,
  statOrNull,
  walkFiles,
  writeJsonAtomic
}
