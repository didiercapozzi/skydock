import * as crypto from 'node:crypto'
import * as fs from 'node:fs'

const ID_HEX_LENGTH = 16

/* What a file is called by, off the hash of everything in it: enough of it to tell two clips apart
   for good, and short enough to read. Taken from the hash rather than the file, so bytes already
   going past on their way to disk can be recognised without being read a second time. */
const idFromHash = (hash: crypto.Hash) => hash.digest('hex').slice(0, ID_HEX_LENGTH)

const computeFileId = async (filePath: string) => {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(idFromHash(hash)))
    stream.on('error', reject)
  })
}

export { ID_HEX_LENGTH, computeFileId, idFromHash }
