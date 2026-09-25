import { EDIT_LOCKED, frozenMontages, getOutputDir } from '@skydock/scripts'
import type { BoardAnswer, Manifest } from '@skydock/scripts'
import type { FormResult } from '../../../../packages/ui/forms/types'
import type { ActionData, actionArgs } from './args'
import { idsOf } from '@skydock/scripts'

type Refusal = FormResult<typeof actionArgs>

/* One change made on the board, as every intent sees it: what was asked, the manifest as it is on
   disk and where, one way to refuse, and the montages no change may touch. A montage with an edit is
   frozen (RULES, The editing project): whatever the page sends, nothing that would change its copies or its
   folder gets through — the page hiding the controls is a courtesy, this is the rule. */
type Change = {
  data: ActionData
  manifest: Manifest
  manifestPath: string
  outputDir: string
  frozen: Set<string>
  frozenFiles: Set<string>
  refuse: (message: string) => Refusal
  refuseFrozen: () => Refusal
}

/* an intent answers with the board's data, or says why not */
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
    manifestPath: `${outputDir}/manifest.json`,
    outputDir,
    frozen,
    frozenFiles,
    refuse,
    refuseFrozen: () => refuse(EDIT_LOCKED)
  }
}

export { changeOn }
export type { Change, Intent, Refusal }
