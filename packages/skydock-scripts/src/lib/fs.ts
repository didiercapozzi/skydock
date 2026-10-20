import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import {
  access,
  chmod,
  chown,
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  utimes
} from 'node:fs/promises'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import * as streams from 'node:stream/promises'
import type { ReadableStream as NodeWebStream } from 'node:stream/web'
import { isMediaName } from '../constants'

const DEFAULT_MAX_FIND_DEPTH = 10

const pathExists = (where: string) =>
  access(where).then(
    () => true,
    () => false
  )

const statOrNull = (where: string) => stat(where).catch(() => null)

const incomingPartial = async (outputDir: string, filename: string) => {
  const incoming = path.join(outputDir, '.incoming')
  await mkdir(incoming, { recursive: true })
  return path.join(incoming, `${crypto.randomBytes(8).toString('hex')}-${filename}`)
}

const saveUploadedFiles = async (dir: string, files: File[]) => {
  await mkdir(dir, { recursive: true })
  for (const file of files) {
    const name = path.basename(file.name).replace(/^\.+/, '')
    const part = path.join(dir, `.${name}.arriving`)
    try {
      await streams.pipeline(
        Readable.fromWeb(file.stream() as NodeWebStream<Uint8Array>),
        fs.createWriteStream(part)
      )
      await rename(part, path.join(dir, name))
    } finally {
      await rm(part, { force: true })
    }
  }
}

const removeIfEmpty = async (dir: string) => {
  try {
    if ((await readdir(dir)).length === 0) await rmdir(dir)
  } catch {}
}

const findMediaFilesAsync = async (dir: string, maxDepth = DEFAULT_MAX_FIND_DEPTH) =>
  (await walkFiles(dir, maxDepth)).filter((file) => isMediaName(path.basename(file))).sort()

const sameBytes = async (left: string, right: string) => {
  const size = 1024 * 1024
  const a = Buffer.alloc(size)
  const b = Buffer.alloc(size)
  let first: FileHandle | null = null
  let second: FileHandle | null = null
  try {
    first = await open(left, 'r')
    second = await open(right, 'r')
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

const mtimeSeconds = (stat: { mtimeMs: number }) => Math.floor(stat.mtimeMs / 1000)

const walkFiles = async (dir: string, maxDepth = Infinity) => {
  const walk = async (here: string, depth: number): Promise<string[]> => {
    if (depth > maxDepth) return []
    const entries = await readdir(here, { withFileTypes: true }).catch(() => [])
    const found = await Promise.all(
      entries.map((entry) => {
        const full = path.join(here, entry.name)
        if (entry.isDirectory()) return walk(full, depth + 1)
        return entry.isFile() ? [full] : []
      })
    )
    return found.flat()
  }
  return walk(dir, 0)
}

const hashFile = async (filePath: string, algorithm = 'md5', onBytes?: (read: number) => void) => {
  const hash = crypto.createHash(algorithm)
  let read = 0
  for await (const chunk of fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 })) {
    hash.update(chunk)
    read += chunk.length
    onBytes?.(read)
  }
  return hash.digest('hex')
}

const openToHost = async (dir: string, like: string) => {
  const owner = await stat(like)
  const root = process.getuid?.() === 0
  const walk = async (here: string): Promise<void> => {
    try {
      const seen = await lstat(here)
      if (seen.isSymbolicLink()) return
      if (root && (seen.uid !== owner.uid || seen.gid !== owner.gid))
        await chown(here, owner.uid, owner.gid)
      await chmod(here, seen.isDirectory() ? 0o777 : seen.mode | 0o666)
      if (seen.isDirectory())
        await Promise.all((await readdir(here)).map((name) => walk(path.join(here, name))))
    } catch {}
  }
  await walk(dir)
}

const writeJsonAtomic = async (target: string, value: unknown) => {
  const tmp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  try {
    const handle = await open(tmp, 'w')
    try {
      await handle.writeFile(JSON.stringify(value, null, 2))
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(tmp, target)
  } catch (e) {
    await rm(tmp, { force: true })
    throw e
  }
}

const moveFile = async (
  from: string,
  to: string,
  onBytes?: (copied: number, total: number) => void
) => {
  await mkdir(path.dirname(to), { recursive: true })
  try {
    await rename(from, to)
    return
  } catch (e) {
    if (!(e instanceof Error && 'code' in e && e.code === 'EXDEV')) throw e
  }
  const partial = `${to}.part`
  try {
    const said = await stat(from)
    if (onBytes) {
      let copied = 0
      const reading = fs
        .createReadStream(from, { highWaterMark: 1024 * 1024 })
        .on('data', (chunk) => {
          copied += chunk.length
          onBytes(copied, said.size)
        })
      await streams.pipeline(reading, fs.createWriteStream(partial))
    } else await copyFile(from, partial)
    await utimes(partial, said.atime, said.mtime)
    await rename(partial, to)
  } catch (e) {
    await rm(partial, { force: true })
    throw e
  }
  try {
    await unlink(from)
  } catch (e) {
    await rm(to, { force: true })
    throw e
  }
}

export {
  findMediaFilesAsync,
  hashFile,
  incomingPartial,
  moveFile,
  mtimeSeconds,
  openToHost,
  pathExists,
  removeIfEmpty,
  sameBytes,
  saveUploadedFiles,
  statOrNull,
  walkFiles,
  writeJsonAtomic
}
