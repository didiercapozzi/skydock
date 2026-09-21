import * as fs from 'node:fs'
import { openInPlayer } from '../../../../packages/skydock-scripts/src/player'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* A clip handed to the machine's own video player, which plays it at its full size with the
   graphics card decoding — where the browser, full screen, can only play what it has a decoder for
   (RULES, Cropping and turning).

   The file itself, never the small copy: the small copy is what the board plays, and the whole
   point of this is the picture as it was shot. A file freed from here is on the storage and not
   anywhere this machine can open, and says so rather than opening nothing. */
const playFile: Intent = async ({ data, manifest, refuse }) => {
  const id = data.fileIds?.[0]
  const file = [...manifest.files, ...manifest.groups.flatMap((g) => g.files)].find(
    (f) => f.id === id
  )
  if (!file) return refuse('That file is no longer on the board.')
  if (!fs.existsSync(file.path))
    return refuse(
      `${file.filename} is not on this machine any more — it is on the storage, and plays from the storage's own list.`
    )
  const opened = await openInPlayer(file.path)
  if (!opened.opened) return refuse(opened.reason ?? 'Could not open the player.')
  return { ...boardAnswer(manifest), played: { filename: file.filename } }
}

export { playFile }
