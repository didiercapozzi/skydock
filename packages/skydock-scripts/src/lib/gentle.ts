import { type FileHandle, open } from 'node:fs/promises'
import { Writable } from 'node:stream'

const EVERY_BYTES = 64 * 1024 ** 2

const gentleWriter = (file: string) => {
  let opening: Promise<FileHandle> | undefined
  let since = 0
  const opened = () => (opening ??= open(file, 'w'))
  return new Writable({
    highWaterMark: 16 * 1024 ** 2,
    write(chunk: Buffer, _encoding, next) {
      opened()
        .then(async (at) => {
          await at.write(chunk)
          since += chunk.length
          if (since < EVERY_BYTES) return
          since = 0
          await at.datasync()
        })
        .then(() => next(), next)
    },
    final(done) {
      opened()
        .then((at) => at.datasync())
        .then(
          () => done(),
          () => done()
        )
    },
    destroy(error, done) {
      const closing = opening
      opening = undefined
      Promise.resolve(closing?.then((at) => at.close()))
        .catch(() => {})
        .then(() => done(error))
    }
  })
}

export { gentleWriter }
