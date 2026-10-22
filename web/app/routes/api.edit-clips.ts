import {
  flushBoardChanges,
  getManifestPath,
  getOutputDir,
  isNamedMontage,
  messageOf,
  outputKeyOf,
  readRecordAsync,
  saveManifest
} from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { catchUp } from '../../../packages/skydock-scripts/src/catchUp'
import { addToMontage, clipCandidates } from '../../../packages/skydock-scripts/src/montageAdd'
import { routingEngine } from '../helpers/routing'
import type { Route } from './+types/api.edit-clips'

const searchParamsArgs = z.object({ groupId: z.string() })

const actionArgs = z.object({
  intent: z.literal('add'),
  groupId: z.string(),
  fileIds: z.array(z.string()).min(1)
})

const montageIn = async (groupId: string) => {
  const manifestPath = getManifestPath(getOutputDir())
  await flushBoardChanges(manifestPath)
  const { manifest } = await readRecordAsync(manifestPath)
  const group = manifest?.groups.find((g) => g.id === groupId)
  if (!manifest || !group)
    return { ok: false, refused: 'This montage is not on the board any more.' } as const
  if (!isNamedMontage(group))
    return { ok: false, refused: 'Give the montage a name first.' } as const
  if (group.freed)
    return { ok: false, refused: 'This montage was freed from this machine.' } as const
  return { ok: true, manifest, group, manifestPath } as const
}

const loader = async ({ request }: Route.LoaderArgs) => {
  const { groupId } = routingEngine.parseSearchParams(searchParamsArgs, { request })
  const found = await montageIn(groupId)
  if (!found.ok) return Response.json({ ok: false, reason: found.refused })
  return Response.json({
    ok: true,
    clips: clipCandidates(found.manifest, groupId),
    members: found.group.files.map(outputKeyOf)
  })
}

const action = createValidatedFormAction<Route.ActionArgs>()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    const refuse = (message: string) => {
      errors.addGlobalError(message)
      return errors.toResponse(422)
    }
    const found = await montageIn(data.groupId)
    if (!found.ok) return refuse(found.refused)
    const { manifest, manifestPath } = found
    try {
      const { keys, freed } = await addToMontage(manifest, data.groupId, new Set(data.fileIds))
      if (keys.length === 0)
        return refuse(
          freed > 0
            ? 'It is on the storage only — bring it back first.'
            : 'The film already has those clips, or they are no longer here.'
        )
      await saveManifest(manifestPath, manifest)
      void catchUp()
      return { ok: true, added: keys.length, freed }
    } catch (e) {
      return refuse(messageOf(e))
    }
  }
})

export { action, actionArgs, loader, searchParamsArgs }
