import * as crypto from 'node:crypto'
import { hashFile } from './lib/fs'

const ID_HEX_LENGTH = 16

const idFromHash = (hash: crypto.Hash) => hash.digest('hex').slice(0, ID_HEX_LENGTH)

const computeFileId = async (filePath: string) =>
  (await hashFile(filePath, 'sha256')).slice(0, ID_HEX_LENGTH)

export { computeFileId, idFromHash }
