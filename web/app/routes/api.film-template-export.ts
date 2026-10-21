import { getOutputDir, messageOf } from '@skydock/scripts'
import { bundleFilmTemplate } from '../../../packages/skydock-scripts/src/filmTemplateBundle'
import type { Route } from './+types/api.film-template-export'

/* A film template with the pictures and the music it names, as one zip to keep or to take to another machine. */
const loader = async ({ request }: Route.LoaderArgs) => {
  const name = new URL(request.url).searchParams.get('name') ?? ''
  try {
    const { zip, file } = await bundleFilmTemplate(getOutputDir(), name)
    return new Response(Buffer.from(zip), {
      headers: {
        'content-type': 'application/zip',
        'content-length': String(zip.length),
        'content-disposition': `attachment; filename="template.film-template.zip"; filename*=UTF-8''${encodeURIComponent(file)}`
      }
    })
  } catch (e) {
    return Response.json({ ok: false, error: messageOf(e) }, { status: 422 })
  }
}

export { loader }
