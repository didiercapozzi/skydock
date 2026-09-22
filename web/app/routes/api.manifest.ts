import { loadManifest, getOutputDir } from '@skydock/scripts'
import type { Route } from './+types/api.manifest'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { actionArgs } from './manifest/args'
import type { ActionData } from './manifest/args'
import { changeOn } from './manifest/change'
import type { Intent } from './manifest/change'
import { freeDropzoneIntent } from './manifest/free-dropzone'
import { freeTandemIntent } from './manifest/free-tandem'
import { imported } from './manifest/imported'
import { markEmailed } from './manifest/mark-emailed'
import { cameraCopied } from './manifest/camera-copied'
import { copyFilesIntent } from './manifest/copy-files'
import { resetFreshIntent } from './manifest/reset-fresh'
import { restoreTandemsIntent } from './manifest/restore-tandems'
import { mergeGroupsIntent } from './manifest/merge-groups'
import { montage } from './manifest/montage'
import { deleteJumpIntent } from './manifest/delete-jump'
import { moveFilesIntent } from './manifest/move-files'
import { openMontage } from './manifest/open-montage'
import { copyBackIntent } from './manifest/copy-back'
import { bringBackIntent, uploadAgainIntent } from './manifest/from-storage'
import { playFile } from './manifest/play-file'
import { cancelProcess, processIntent, processWait } from './manifest/process'
import { regroupLoose } from './manifest/regroup-loose'
import { saveGroups } from './manifest/save-groups'
import { retimeFileIntent } from './manifest/retime-file'
import { setMomentIntent } from './manifest/set-moment'
import { shiftGroupTime } from './manifest/shift-group-time'
import { deleteTandemIntent, resetTandemIntent } from './manifest/take-back'
import { trashUnsortedIntent } from './manifest/trash-unsorted'
import { uploadGroup } from './manifest/upload-group'
import { uploadTandemIntent } from './manifest/upload-tandem'

/* Every change the board makes comes through here, one intent at a time, each answered with the
   board's data (RULES, The board). */
const intents: Record<ActionData['intent'], Intent> = {
  'save-groups': saveGroups,
  'merge-groups': mergeGroupsIntent,
  'open-montage': openMontage,
  'play-file': playFile,
  'copy-back': copyBackIntent,
  'bring-back': bringBackIntent,
  'upload-again': uploadAgainIntent,
  process: processIntent,
  'process-wait': processWait,
  'cancel-process': cancelProcess,
  'upload-group': uploadGroup,
  montage,
  'upload-tandem': uploadTandemIntent,
  'shift-group-time': shiftGroupTime,
  'retime-file': retimeFileIntent,
  'set-moment': setMomentIntent,
  'move-files': moveFilesIntent,
  'delete-jump': deleteJumpIntent,
  'regroup-loose': regroupLoose,
  'trash-unsorted': trashUnsortedIntent,
  'reset-tandem': resetTandemIntent,
  'delete-tandem': deleteTandemIntent,
  'free-tandem': freeTandemIntent,
  'free-dropzone': freeDropzoneIntent,
  imported,
  'mark-emailed': markEmailed,
  'restore-tandems': restoreTandemsIntent,
  'copy-files': copyFilesIntent,
  'reset-fresh': resetFreshIntent,
  'camera-copied': cameraCopied
}

const action = createValidatedFormAction<Route.ActionArgs>()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    const refuse = (message: string) => {
      errors.addGlobalError(message)
      return errors.toResponse(422)
    }
    const manifest = loadManifest(`${getOutputDir()}/manifest.json`)
    if (!manifest) return refuse('No manifest found. Run a scan first.')
    return intents[data.intent](changeOn(manifest, data, refuse))
  }
})

export { action, actionArgs }
