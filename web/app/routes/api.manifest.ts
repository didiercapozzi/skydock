import { loadManifest, getOutputDir } from '@skydock/scripts'
import type { Route } from './+types/api.manifest'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { actionArgs } from './manifest/args'
import type { ActionData } from './manifest/args'
import { changeOn } from './manifest/change'
import type { Intent } from './manifest/change'
import { freeTandemIntent } from './manifest/free-tandem'
import { imported } from './manifest/imported'
import { markEmailed } from './manifest/mark-emailed'
import { mergeGroupsIntent } from './manifest/merge-groups'
import { montage } from './manifest/montage'
import { moveFilesIntent } from './manifest/move-files'
import { openMontage } from './manifest/open-montage'
import { processIntent, processWait } from './manifest/process'
import { regroupLoose } from './manifest/regroup-loose'
import { saveGroups } from './manifest/save-groups'
import { shiftGroupTime } from './manifest/shift-group-time'
import { deleteTandemIntent, resetTandemIntent } from './manifest/take-back'
import { uploadGroup } from './manifest/upload-group'
import { uploadTandemIntent } from './manifest/upload-tandem'

/* Every change the board makes comes through here, one intent at a time, each answered with the
   board's data (RULES, The board). */
const intents: Record<ActionData['intent'], Intent> = {
  'save-groups': saveGroups,
  'merge-groups': mergeGroupsIntent,
  'open-montage': openMontage,
  process: processIntent,
  'process-wait': processWait,
  'upload-group': uploadGroup,
  montage,
  'upload-tandem': uploadTandemIntent,
  'shift-group-time': shiftGroupTime,
  'move-files': moveFilesIntent,
  'regroup-loose': regroupLoose,
  'reset-tandem': resetTandemIntent,
  'delete-tandem': deleteTandemIntent,
  'free-tandem': freeTandemIntent,
  imported,
  'mark-emailed': markEmailed
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
