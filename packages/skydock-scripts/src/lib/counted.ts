import * as crypto from 'node:crypto'
import * as stream from 'node:stream'
import { idFromHash } from '../fileId'

/* (node's modules by namespace: this sits behind the barrel the board also loads, where a named
   import from one would not resolve) */

/* A file's bytes counted as they go by, for whoever is watching them land, and hashed on the way,
   which is what the file will be known by — so nothing is read twice.

   Told at most ten times a second: one long clip is tens of thousands of chunks, and a board told
   about every one of them is a board doing nothing else. Hashing here rather than reading the whole
   file back afterwards is the difference between a 1.2 GB clip landing and a 1.2 GB clip landing and
   then being read again from end to end while the board sits silent. Used wherever a file is written
   into the originals — dropped in from the computer, copied off a camera — and, counted only, for a
   processed copy made whole, which is known by its source and needs no hash of its own. */
/* how often the bytes are said: four times a second reads as moving, and costs the board nothing */
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
    /* what it will be known by, off the bytes that have just gone past */
    id: () => (hash ? idFromHash(hash) : '')
  }
}

export { counted }
