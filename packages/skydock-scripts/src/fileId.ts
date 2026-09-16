import * as crypto from 'node:crypto'
import * as fs from 'node:fs'

const ID_HEX_LENGTH = 16

const computeFileId = async (filePath: string) => {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex').slice(0, ID_HEX_LENGTH)))
    stream.on('error', reject)
  })
}

export { computeFileId }
