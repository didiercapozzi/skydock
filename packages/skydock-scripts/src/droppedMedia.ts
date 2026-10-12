import { stat } from 'node:fs/promises'
import * as path from 'node:path'
import { isMediaName } from './constants'
import { findMediaFilesAsync } from './lib/fs'

const statOrNull = (where: string) => stat(where).catch(() => null)

const insideOf = async (where: string) => {
  const said = await statOrNull(where)
  if (!said) return []
  if (said.isDirectory()) return findMediaFilesAsync(where)
  return said.isFile() && isMediaName(path.basename(where)) ? [where] : []
}

const mediaUnder = async (dropped: string[]) => {
  const found = new Set((await Promise.all(dropped.map(insideOf))).flat())
  return Promise.all(
    [...found].sort().map(async (where) => ({
      path: where,
      name: path.basename(where),
      size: (await statOrNull(where))?.size ?? 0
    }))
  )
}

export { mediaUnder }
