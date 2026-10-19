import { getOutputDir, messageOf } from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'
import { musicSources } from '../../../packages/skydock-scripts/src/filmEdit'
import { filmTemplateSchema } from '../../../packages/skydock-scripts/src/filmTemplate'
import {
  createFilmTemplate,
  deleteFilmTemplate,
  duplicateFilmTemplate,
  listFilmTemplates,
  renameFilmTemplate,
  saveFilmTemplate,
  updateFilmTemplate
} from '../../../packages/skydock-scripts/src/filmTemplateFiles'

const actionArgs = z.object({
  intent: z.enum(['save', 'update', 'create', 'rename', 'duplicate', 'delete']),
  name: z.string(),
  to: z.string().optional(),
  template: filmTemplateSchema.optional(),
  replace: z.boolean().optional()
})

const loader = async () => {
  const outputDir = getOutputDir()
  return Response.json({
    ...(await listFilmTemplates(outputDir)),
    music: await musicSources(outputDir)
  })
}

const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    const outputDir = getOutputDir()
    try {
      const { intent, name, to, template, replace } = data
      if ((intent === 'save' || intent === 'update') && !template)
        throw new Error(`That film template can't be read.`)
      const made =
        intent === 'save' && template
          ? await saveFilmTemplate({ outputDir, name, template, replace: replace === true })
          : intent === 'update' && template
            ? await updateFilmTemplate(outputDir, name, template)
            : intent === 'create'
              ? await createFilmTemplate(outputDir, name)
              : intent === 'rename'
                ? await renameFilmTemplate(outputDir, name, to ?? '')
                : intent === 'duplicate'
                  ? await duplicateFilmTemplate(outputDir, name)
                  : await deleteFilmTemplate(outputDir, name).then(() => name)
      return { ok: true, name: made }
    } catch (e) {
      errors.addGlobalError(messageOf(e))
      return errors.toResponse(422)
    }
  }
})

export { action, actionArgs, loader }
