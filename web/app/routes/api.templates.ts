import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebStream } from 'node:stream/web'
import { getOutputDir } from '@skydock/scripts'
import { importTemplate, listTemplates } from '../../../packages/skydock-scripts/src/templates'
import type { Route } from './+types/api.templates'

/* The editing templates this machine has — which kdenlive wrote each, whether every file it names
   is here, and which kdenlive will open them — for choosing one and for being warned (RULES,
   Montage). Read fresh each time: a template is a folder anyone may have changed by hand. */
const loader = () => Response.json(listTemplates(getOutputDir()))

/* A template brought in from the computer: the archive's bytes are the body, its name and the name
   the template is to have are in the address. It is written to a file of its own first, since an
   archive is unpacked from the disk and not from a request, and that file is gone whatever happens. */
const action = async ({ request }: Route.ActionArgs) => {
  const url = new URL(request.url)
  const filename = url.searchParams.get('filename')
  if (!filename || !request.body)
    return Response.json({ ok: false, error: 'Nothing to bring in.' }, { status: 400 })
  const arrived = path.join(os.tmpdir(), `skydock-template-${crypto.randomUUID()}`)
  try {
    await pipeline(
      Readable.fromWeb(request.body as NodeWebStream<Uint8Array>),
      fs.createWriteStream(arrived)
    )
    const template = await importTemplate({
      outputDir: getOutputDir(),
      archive: arrived,
      filename,
      name: url.searchParams.get('name') ?? undefined
    })
    return Response.json({ ok: true, template, ...listTemplates(getOutputDir()) })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 422 }
    )
  } finally {
    fs.rmSync(arrived, { force: true })
  }
}

export { action, loader }
