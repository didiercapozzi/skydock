import { openInEditor } from '../../../../packages/skydock-scripts/src/editor'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* the project is already there — this is the way back into it */
const openMontage: Intent = async ({ data, manifest, refuse }) => {
  const group = manifest.groups.find((g) => g.id === data.groupId)
  if (!group?.montage) return refuse('This tandem has no project yet — make its montage first.')
  const opened = await openInEditor(group.montage.projectPath)
  if (!opened.opened) return refuse(opened.reason ?? 'Could not open the editor.')
  return {
    ...boardAnswer(manifest),
    montage: { clips: 0, missingAssets: [], opened: true, openCommand: opened.command }
  }
}

export { openMontage }
