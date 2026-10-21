import { getOutputDir, messageOf } from '@skydock/scripts'
import { importFilmTemplate } from '../../../packages/skydock-scripts/src/filmTemplateBundle'
import type { Route } from './+types/api.film-template-import'

/* The zip a film template was exported as, taken in whole with its pictures and music. */
const action = async ({ request }: Route.ActionArgs) => {
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File))
      return Response.json(
        { ok: false, error: 'Choose the zip of a film template.' },
        { status: 400 }
      )
    const made = await importFilmTemplate(getOutputDir(), new Uint8Array(await file.arrayBuffer()))
    return Response.json({ ok: true, ...made })
  } catch (e) {
    return Response.json({ ok: false, error: messageOf(e) }, { status: 422 })
  }
}

export { action }
