import type { Hash } from 'node:crypto'
import * as path from 'node:path'
import { hashFile } from './lib/fs'

const ID_HEX_LENGTH = 16

const idFromHash = (hash: Hash) => hash.digest('hex').slice(0, ID_HEX_LENGTH)

const computeFileId = async (filePath: string, onBytes?: (read: number) => void) =>
  (await hashFile(filePath, 'sha256', onBytes)).slice(0, ID_HEX_LENGTH)

const originalEntry = ({
  path: filePath,
  id,
  mtime,
  size
}: {
  path: string
  id: string
  mtime: number
  size: number
}) => ({ path: filePath, size, mtime, filename: path.basename(filePath), id })

export { computeFileId, idFromHash, originalEntry }
