import * as path from 'node:path'
import {
  busyWith,
  flushBoardChanges,
  getGroupProcessedDir,
  getManifestPath,
  getOutputDir,
  isNamedMontage,
  jumpsOfMontage,
  messageOf,
  passengerOf,
  readRecordAsync
} from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { filmEditSchema } from '../../../packages/skydock-scripts/src/filmEditShape'
import {
  editPathOf,
  imageSources,
  editSources,
  firstEdit,
  musicSources,
  readOrSetAside,
  saveEdit
} from '../../../packages/skydock-scripts/src/filmEdit'
import {
  availableFormats,
  formatRefusal,
  isRendering,
  renderFilm
} from '../../../packages/skydock-scripts/src/filmRender'
import { estimateFor } from '../../../packages/skydock-scripts/src/filmEstimate'
import { filmNameOf } from '../../../packages/skydock-scripts/src/montageNames'
import { pathExists } from '../../../packages/skydock-scripts/src/lib/fs'
import { routingEngine } from '../helpers/routing'
import type { Route } from './+types/api.edit'

const searchParamsArgs = z.object({ groupId: z.string() })

const actionArgs = z.object({
  intent: z.enum(['save', 'render', 'estimate']),
  groupId: z.string(),
  edit: filmEditSchema
})

const montageOf = async (groupId: string) => {
  const outputDir = getOutputDir()
  const manifestPath = getManifestPath(outputDir)
  await flushBoardChanges(manifestPath)
  const { manifest } = await readRecordAsync(manifestPath)
  const group = manifest?.groups.find((g) => g.id === groupId)
  if (!manifest || !group)
    return { ok: false, refused: 'This montage is not on the board any more.' } as const
  if (!isNamedMontage(group))
    return { ok: false, refused: 'Give the montage a name first.' } as const
  if (!group.processed)
    return { ok: false, refused: 'Process the montage before editing its film.' } as const
  if (group.freed)
    return { ok: false, refused: 'This montage was freed from this machine.' } as const
  return { ok: true, manifest, group, outputDir } as const
}

const loader = async ({ request }: Route.LoaderArgs) => {
  const { groupId } = routingEngine.parseSearchParams(searchParamsArgs, { request })
  const found = await montageOf(groupId)
  if (!found.ok) return Response.json({ ok: false, reason: found.refused })
  const { manifest, group, outputDir } = found
  const sources = await editSources(manifest, outputDir, group)
  const { edit: saved, setAside } = await readOrSetAside(outputDir, editPathOf(outputDir, group))
  const { dir, baseName } = getGroupProcessedDir(outputDir, group)
  return Response.json({
    ok: true,
    title: passengerOf(group).trim() || group.label,
    edit: saved ?? firstEdit(group, sources),
    saved: saved !== null,
    setAside,
    sources,
    music: await musicSources(outputDir),
    images: await imageSources(outputDir),
    rendering: isRendering(group.id),
    formats: await availableFormats(),
    film: (await pathExists(path.join(dir, filmNameOf(baseName)))) ? filmNameOf(baseName) : null
  })
}

const action = createValidatedFormAction<Route.ActionArgs>()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    const refuse = (message: string) => {
      errors.addGlobalError(message)
      return errors.toResponse(422)
    }
    const found = await montageOf(data.groupId)
    if (!found.ok) return refuse(found.refused)
    const { manifest, group, outputDir } = found
    try {
      if (data.intent === 'estimate')
        return { estimate: await estimateFor({ manifest, outputDir, group, edit: data.edit }) }
      await readOrSetAside(outputDir, editPathOf(outputDir, group))
      await saveEdit(editPathOf(outputDir, group), data.edit)
      if (data.intent === 'save') return { saved: true, rendering: isRendering(group.id) }
      if (isRendering(group.id)) return refuse('This film is already being rendered.')
      const busy = busyWith({ groupIds: jumpsOfMontage(manifest, outputDir, group.id) }, [
        'process',
        'upload'
      ])
      if (busy === 'processing')
        return refuse('Its copies are being processed — render it once that is done.')
      if (busy === 'uploading')
        return refuse('It is being uploaded — render it again once the upload is done.')
      if (data.edit.clips.length === 0) return refuse('Put at least one clip in the film.')
      const unmakable = await formatRefusal(data.edit)
      if (unmakable) return refuse(unmakable)
      void renderFilm({ manifest, outputDir, group, edit: data.edit }).catch((e) =>
        console.warn(`[Render] ${passengerOf(group)}: ${messageOf(e)}`)
      )
      return { saved: true, rendering: true }
    } catch (e) {
      return refuse(messageOf(e))
    }
  }
})

export { action, actionArgs, loader, searchParamsArgs }
