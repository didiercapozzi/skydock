import {
  EDIT_LOCKED,
  frozenMontages,
  getManifestPath,
  getOutputDir,
  loadManifestAsync,
  processingNow,
  idsOf
} from '@skydock/scripts'
import type { BoardAnswer, Manifest } from '@skydock/scripts'
import type { FormResult } from '../../../../packages/ui/forms/types'
import type { ActionData, actionArgs } from './args'

type Refusal = FormResult<typeof actionArgs>

type Change = {
  data: ActionData
  manifest: Manifest
  manifestPath: string
  outputDir: string
  frozen: Set<string>
  frozenFiles: Set<string>
  refuse: (message: string) => Refusal
  refuseFrozen: () => Refusal
  refuseBusy: () => Refusal | null
  latest: () => Promise<Manifest>
}

type Intent = (change: Change) => Promise<BoardAnswer | Refusal> | BoardAnswer | Refusal

const changeOn = (manifest: Manifest, data: ActionData, refuse: (message: string) => Refusal) => {
  const outputDir = getOutputDir()
  const frozen = frozenMontages(manifest, outputDir)
  const frozenFiles = new Set(
    manifest.groups.filter((g) => frozen.has(g.id)).flatMap((g) => idsOf(g.files))
  )
  return {
    data,
    manifest,
    manifestPath: getManifestPath(outputDir),
    outputDir,
    frozen,
    frozenFiles,
    refuse,
    refuseFrozen: () => refuse(EDIT_LOCKED),
    refuseBusy: () =>
      processingNow() ? refuse('Something is being processed — wait for it to finish.') : null,
    latest: async () => (await loadManifestAsync(getManifestPath(outputDir))) ?? manifest
  }
}

/* what is said when the storage is needed and not connected, and why it is needed where that helps */
const connectFirst = (because?: string) =>
  `Connect the storage first${because ? ` — ${because}` : ''}.`

export { changeOn, connectFirst }
export type { Change, Intent, Refusal }
