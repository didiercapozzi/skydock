import { getGroupProcessedDir } from '../../../../packages/skydock-scripts/src/process'
import { pathExists } from '../../../../packages/skydock-scripts/src/lib/fs'
import { openFolder } from '../../../../packages/skydock-scripts/src/player'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* The folder a montage's film and edit are in, shown in the machine's own file manager, so that they can be
   taken and used as they are. A montage that was freed from this machine has no folder here. */
const openMontageFolder: Intent = async ({ data, manifest, outputDir, refuse }) => {
  const group = manifest.groups.find((g) => g.id === data.groupId)
  if (!group) return refuse('That montage is no longer on the board.')
  if (group.freed)
    return refuse('This montage is on the storage only — there is no folder of it here any more.')
  const { dir } = getGroupProcessedDir(outputDir, group)
  if (!(await pathExists(dir)))
    return refuse('Its folder is not there yet — it is made with the first edit of the film.')
  const opened = await openFolder(dir)
  if (!opened.opened) return refuse(opened.reason ?? `Could not open ${dir}.`)
  return boardAnswer(manifest)
}

export { openMontageFolder }
