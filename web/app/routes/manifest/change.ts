import {
  getManifestPath,
  lockedSaid,
  montageLocks,
  getOutputDir,
  loadManifestAsync,
  busySaid,
  busyWith,
  idsOf
} from '@skydock/scripts'
import type { BoardAnswer, BusyScope, Manifest, MontageLock } from '@skydock/scripts'
import type { FormResult } from '../../../../packages/ui/forms/types'
import type { ActionData, actionArgs } from './args'

type Refusal = FormResult<typeof actionArgs>

type Change = {
  data: ActionData
  manifest: Manifest
  manifestPath: string
  outputDir: string
  locks: Map<string, MontageLock>
  frozen: Set<string>
  frozenFiles: Map<string, string>
  refuse: (message: string) => Refusal
  refuseFrozen: (groupId?: string) => Refusal
  refuseBusy: (scope: BusyScope) => Refusal | null
  latest: () => Promise<Manifest>
}

type Intent = (change: Change) => Promise<BoardAnswer | Refusal> | BoardAnswer | Refusal

const changeOn = async (
  manifest: Manifest,
  data: ActionData,
  refuse: (message: string) => Refusal
) => {
  const outputDir = getOutputDir()
  const locks = await montageLocks(manifest, outputDir)
  const frozen = new Set([...locks].flatMap(([id, lock]) => (lock === 'edit' ? [] : [id])))
  const frozenFiles = new Map(
    manifest.groups
      .filter((g) => frozen.has(g.id))
      .flatMap((g) => idsOf(g.files).map((id) => [id, g.id] as const))
  )
  return {
    data,
    manifest,
    manifestPath: getManifestPath(outputDir),
    outputDir,
    locks,
    frozen,
    frozenFiles,
    refuse,
    refuseFrozen: (groupId?: string) => refuse(lockedSaid(locks.get(groupId ?? ''))),
    refuseBusy: (scope: BusyScope) => {
      const busy = busyWith(scope)
      return busy ? refuse(busySaid(busy)) : null
    },
    latest: async () => (await loadManifestAsync(getManifestPath(outputDir))) ?? manifest
  }
}

/* what is said when the storage is needed and not connected, and why it is needed where that helps */
const connectFirst = (because?: string) =>
  `Connect the storage first${because ? ` — ${because}` : ''}.`

export { changeOn, connectFirst }
export type { Change, Intent, Refusal }
