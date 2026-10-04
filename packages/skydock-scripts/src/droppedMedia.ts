import * as path from 'node:path'
import { isMediaName } from './constants'
import { findMediaFiles, statOrNull } from './lib/fs'

const insideOf = (where: string) => {
  const said = statOrNull(where)
  if (!said) return []
  if (said.isDirectory()) return findMediaFiles(where)
  return said.isFile() && isMediaName(path.basename(where)) ? [where] : []
}

const mediaUnder = (dropped: string[]) =>
  [...new Set(dropped.flatMap(insideOf))].sort().map((where) => ({
    path: where,
    name: path.basename(where),
    size: statOrNull(where)?.size ?? 0
  }))

export { mediaUnder }
