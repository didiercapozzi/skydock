import * as crypto from 'node:crypto'
import * as stream from 'node:stream'
import { idFromHash } from '../fileId'

const TELL_EVERY_MS = 250

const counted = (onBytes?: (done: number) => void, hashing = true) => {
  const hash = hashing ? crypto.createHash('sha256') : null
  let done = 0
  let told = -1
  let toldAt = 0
  return {
    through: new stream.Transform({
      transform(chunk: Buffer, _encoding, next) {
        hash?.update(chunk)
        done += chunk.byteLength
        const now = Date.now()
        if (onBytes && done !== told && now - toldAt >= TELL_EVERY_MS) {
          toldAt = now
          told = done
          onBytes(done)
        }
        next(null, chunk)
      }
    }),
    id: () => (hash ? idFromHash(hash) : '')
  }
}

export { counted }
