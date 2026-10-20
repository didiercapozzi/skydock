import { montageArtifacts } from '@skydock/scripts'
import { openInEditor } from '../../../../packages/skydock-scripts/src/editor'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

const openMontage: Intent = async ({ data, manifest, outputDir, refuse }) => {
  const group = manifest.groups.find((g) => g.id === data.groupId)
  const project = group && (await montageArtifacts(outputDir, group)).kdenlive
  if (!project) return refuse('This montage has no project yet — make it first.')
  const opened = await openInEditor(project)
  if (!opened.opened) return refuse(opened.reason ?? 'Could not open the editor.')
  return {
    ...(await boardAnswer(manifest)),
    montage: { clips: 0, missingAssets: [], opened: true, openCommand: opened.command }
  }
}

export { openMontage }
