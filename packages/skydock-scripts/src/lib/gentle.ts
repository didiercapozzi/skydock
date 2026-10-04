import * as fs from 'node:fs'
import * as stream from 'node:stream'

/* (node's modules by namespace: this sits behind the barrel the board also loads, where a named
   import from one would not resolve) */

/* A file written to a hard disk. Left to itself the system takes gigabytes into memory and writes them
   out in one great burst, and while it does every other read of that disk — the board's own record, a
   folder listed — waits behind it for seconds, which is a copy that stalls part of the way and a board
   that seems to hang with it. So what has been written is made to reach the disk every so often, a
   little at a time, and the write waits for it: the disk is never far behind, and what else wants it
   is never far from its turn. */
/* and in large pieces: a few kilobytes at a time, read from and written to the same hard disk, the heads
   travel between the two for every piece and a copy that should take a minute takes an hour */
const EVERY_BYTES = 64 * 1024 ** 2

const gentleWriter = (file: string) => {
  let fd: number | null = null
  let since = 0
  const open = () => (fd ??= fs.openSync(file, 'w'))
  return new stream.Writable({
    highWaterMark: 16 * 1024 ** 2,
    write(chunk: Buffer, _encoding, next) {
      try {
        const at = open()
        fs.write(at, chunk, 0, chunk.length, null, (error) => {
          if (error) return next(error)
          since += chunk.length
          if (since < EVERY_BYTES) return next()
          since = 0
          fs.fdatasync(at, (failed) => next(failed))
        })
      } catch (e) {
        next(e instanceof Error ? e : new Error(String(e)))
      }
    },
    final(done) {
      if (fd === null) fd = fs.openSync(file, 'w')
      fs.fdatasync(fd, () => done())
    },
    destroy(error, done) {
      if (fd !== null) {
        try {
          fs.closeSync(fd)
        } catch {
          /* already closed */
        }
        fd = null
      }
      done(error)
    }
  })
}

export { gentleWriter }
