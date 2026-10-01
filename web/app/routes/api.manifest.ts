import {
  flushBoardChanges,
  getManifestPath,
  getOutputDir,
  keepBoardStep,
  loadManifest
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
import { montageLink } from './manifest/montage-link'
import { cameraCopied } from './manifest/camera-copied'
import { copyFilesIntent } from './manifest/copy-files'
import { makeMontageIntent } from './manifest/make-montage'
import { resetFreshIntent } from './manifest/reset-fresh'
import { restoreMontagesIntent } from './manifest/restore-montages'
import { mergeGroupsIntent } from './manifest/merge-groups'
import { montage } from './manifest/montage'
import { deleteJumpIntent } from './manifest/delete-jump'
import { moveFilesIntent } from './manifest/move-files'
import { openMontage } from './manifest/open-montage'
import { copyBackIntent } from './manifest/copy-back'
import { fromBinIntent } from './manifest/from-bin'
import { goBack } from './manifest/go-back'
import { bringBackIntent } from './manifest/from-storage'
import { playFile } from './manifest/play-file'
import { cancelProcess, processIntent, processWait } from './manifest/process'
import { regroupLoose } from './manifest/regroup-loose'
import { removeDestinationIntent } from './manifest/remove-destination'
import { saveGroups } from './manifest/save-groups'
import { retimeFileIntent } from './manifest/retime-file'
import { redoMomentsIntent, resetMomentsIntent, setMomentIntent } from './manifest/set-moment'
import { shiftGroupTime } from './manifest/shift-group-time'
import { deleteMontageIntent, resetMontageIntent } from './manifest/take-back'
import { trashUnsortedIntent } from './manifest/trash-unsorted'
import { uploadGroup } from './manifest/upload-group'
import { cancelUpload, uploadWait } from './manifest/upload-wait'
import { uploadMontageIntent, uploadMontagesIntent } from './manifest/upload-montage'
import { markPaid } from './manifest/mark-paid'

/* Every change the board makes comes through here, one intent at a time, each answered with the
   board's data (RULES, The board). */
const intents: Record<ActionData['intent'], Intent> = {
  'save-groups': saveGroups,
  'merge-groups': mergeGroupsIntent,
  'open-montage': openMontage,
  'play-file': playFile,
  'copy-back': copyBackIntent,
  'bring-back': bringBackIntent,
  'from-bin': fromBinIntent,
  'go-back': goBack,
  process: processIntent,
  'process-wait': processWait,
  'cancel-process': cancelProcess,
  'upload-group': uploadGroup,
  'upload-wait': uploadWait,
  'cancel-upload': cancelUpload,
  montage,
  'upload-montage': uploadMontageIntent,
  'upload-montages': uploadMontagesIntent,
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
  'delete-montage': deleteMontageIntent,
  'free-montage': freeMontageIntent,
  'free-dropzone': freeDropzoneIntent,
  imported,
  'mark-emailed': markEmailed,
  'montage-link': montageLink,
  'restore-montages': restoreMontagesIntent,
  'copy-files': copyFilesIntent,
  'make-montage': makeMontageIntent,
  'reset-fresh': resetFreshIntent,
  'camera-copied': cameraCopied,
  'mark-paid': markPaid
}

/* what only waits, looks or stops, and changes nothing a person would want to go back from */
const ONLY_ASKING = new Set<string>([
  'upload-wait',
  'process-wait',
  'play-file',
  'cancel-upload',
  'cancel-process',
  'camera-copied',
  'go-back'
])

const action = createValidatedFormAction<Route.ActionArgs>()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    const refuse = (message: string) => {
      errors.addGlobalError(message)
      return errors.toResponse(422)
    }
    const manifestPath = getManifestPath(getOutputDir())
    /* what the board recorded by itself a moment ago is written first, so this change is made on it */
    flushBoardChanges(manifestPath)
    const manifest = loadManifest(manifestPath)
    if (!manifest) return refuse('No manifest found. Run a scan first.')
    /* a change asked for on the board is one step of its history, to go back to (RULES, Going back) */
    if (!ONLY_ASKING.has(data.intent)) keepBoardStep(manifestPath)
    return intents[data.intent](changeOn(manifest, data, refuse))
  }
})

export { action, actionArgs }
