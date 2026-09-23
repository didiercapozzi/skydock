import * as fs from 'node:fs'
import * as path from 'node:path'
import { isMediaName } from './constants'
import { findMediaFiles } from './lib/fs'

/* What was let go of on the board, and what it really holds.

   A folder is every video and photo inside it, and inside the folders inside it: a card is copied
   off as a card, not as whatever happened to be at its top level. Everything else in there is
   passed over — a folder is somebody's whole disk as often as it is a day's footage, and only what
   SkyDock can show is taken out of one.

   Worked out before a single byte moves, so the board can say what is coming and count it down. */

const statOf = (where: string) => {
  try {
    return fs.statSync(where)
  } catch {
    return null
  }
}

const insideOf = (where: string) => {
  const said = statOf(where)
  if (!said) return []
  if (said.isDirectory()) return findMediaFiles(where)
  return said.isFile() && isMediaName(path.basename(where)) ? [where] : []
}

/* One file said twice — a folder dropped along with something inside it — is one file. In the order
   their folders put them, so a card of clips arrives as the card has it. */
const mediaUnder = (dropped: string[]) =>
  [...new Set(dropped.flatMap(insideOf))].sort().map((where) => ({
    path: where,
    name: path.basename(where),
    size: statOf(where)?.size ?? 0
  }))

export { mediaUnder }
