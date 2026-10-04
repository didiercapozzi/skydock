import * as fs from 'node:fs'
import * as stream from 'node:stream'

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
        } catch {}
        fd = null
      }
      done(error)
    }
  })
}

export { gentleWriter }
