import * as crypto from 'node:crypto'
import { hashFile } from './lib/fs'

const ID_HEX_LENGTH = 16

/* What a file is called by, off the hash of everything in it: enough of it to tell two clips apart
   for good, and short enough to read. Taken from the hash rather than the file, so bytes already
   going past on their way to disk can be recognised without being read a second time. */
const idFromHash = (hash: crypto.Hash) => hash.digest('hex').slice(0, ID_HEX_LENGTH)

/* the same hash every other whole-file read uses, a megabyte at a time */
const computeFileId = async (filePath: string) =>
  (await hashFile(filePath, 'sha256')).slice(0, ID_HEX_LENGTH)

export { computeFileId, idFromHash }
