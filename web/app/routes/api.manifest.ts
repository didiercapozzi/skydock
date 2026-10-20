import {
  flushBoardChanges,
  getManifestPath,
  getOutputDir,
  readRecordAsync,
  RECORD_UNREADABLE
} from '@skydock/scripts'
import type { Route } from './+types/api.manifest'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { actionArgs } from './manifest/args'
import type { ActionData } from './manifest/args'
import { changeOn } from './manifest/change'
import type { Intent } from './manifest/change'
import { freeDropzoneIntent } from './manifest/free-dropzone'
import { freeMontageIntent } from './manifest/free-montage'
import { imported } from './manifest/imported'
import { markEmailed } from './manifest/mark-emailed'
import { lookAtBoard } from './manifest/look-at-board'
import { montageLink } from './manifest/montage-link'
import { destinationLink } from './manifest/destination-link'
import { cameraCopied } from './manifest/camera-copied'
import { copyFilesIntent } from './manifest/copy-files'
import { makeMontageIntent } from './manifest/make-montage'
import { resetFreshIntent } from './manifest/reset-fresh'
import { mergeGroupsIntent } from './manifest/merge-groups'
import { montage } from './manifest/montage'
import { deleteJumpIntent } from './manifest/delete-jump'
import { moveFilesIntent } from './manifest/move-files'
import { openMontage } from './manifest/open-montage'
import { copyBackIntent } from './manifest/copy-back'
import { fromBinIntent } from './manifest/from-bin'
import { bringBackIntent } from './manifest/from-storage'
import { playFile } from './manifest/play-file'
import { cancelProcess, processIntent } from './manifest/process'
import { regroupLoose } from './manifest/regroup-loose'
import { removeDestinationIntent } from './manifest/remove-destination'
import { saveGroups } from './manifest/save-groups'
import { retimeFileIntent } from './manifest/retime-file'
import { redoMomentsIntent, resetMomentsIntent, setMomentIntent } from './manifest/set-moment'
import { shiftGroupTime } from './manifest/shift-group-time'
import { deleteMontageIntent, resetMontageIntent, startEditAgainIntent } from './manifest/take-back'
import { trashUnsortedIntent } from './manifest/trash-unsorted'
import { uploadGroup } from './manifest/upload-group'
import { cancelRender } from './manifest/render-cancel'
import { cancelUpload, uploadWait } from './manifest/upload-wait'
import { sendFilesIntent } from './manifest/send-files'
import { uploadMontageIntent } from './manifest/upload-montage'

const intents: Record<ActionData['intent'], Intent> = {
  'save-groups': saveGroups,
  'merge-groups': mergeGroupsIntent,
  'open-montage': openMontage,
  'play-file': playFile,
  'copy-back': copyBackIntent,
  'bring-back': bringBackIntent,
  'from-bin': fromBinIntent,
  process: processIntent,
  'cancel-process': cancelProcess,
  'upload-group': uploadGroup,
  'upload-wait': uploadWait,
  'cancel-upload': cancelUpload,
  'cancel-render': cancelRender,
  montage,
  'upload-montage': uploadMontageIntent,
  'send-files': sendFilesIntent,
  'shift-group-time': shiftGroupTime,
  'retime-file': retimeFileIntent,
  'set-moment': setMomentIntent,
  'reset-moments': resetMomentsIntent,
  'redo-moments': redoMomentsIntent,
  'move-files': moveFilesIntent,
  'delete-jump': deleteJumpIntent,
  'remove-destination': removeDestinationIntent,
  'regroup-loose': regroupLoose,
  'trash-unsorted': trashUnsortedIntent,
  'reset-montage': resetMontageIntent,
  'start-edit-again': startEditAgainIntent,
  'delete-montage': deleteMontageIntent,
  'free-montage': freeMontageIntent,
  'free-dropzone': freeDropzoneIntent,
  imported,
  'mark-emailed': markEmailed,
  'montage-link': montageLink,
  'destination-link': destinationLink,
  'copy-files': copyFilesIntent,
  'make-montage': makeMontageIntent,
  'reset-fresh': resetFreshIntent,
  'camera-copied': cameraCopied,
  'look-at-board': lookAtBoard
}

const action = createValidatedFormAction<Route.ActionArgs>()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    const refuse = (message: string) => {
      errors.addGlobalError(message)
      return errors.toResponse(422)
    }
    const manifestPath = getManifestPath(getOutputDir())
    await flushBoardChanges(manifestPath)
    const { manifest, unreadable } = await readRecordAsync(manifestPath)
    if (!manifest)
      return refuse(unreadable ? RECORD_UNREADABLE : 'No manifest found. Run a scan first.')
    return intents[data.intent](await changeOn(manifest, data, refuse))
  }
})

export { action, actionArgs }
