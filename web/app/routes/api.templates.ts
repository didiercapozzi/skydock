import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebStream } from 'node:stream/web'
import { z } from 'zod'
import { getOutputDir } from '@skydock/scripts'
import {
  importTemplate,
  listTemplates,
  setDefaultTemplate
} from '../../../packages/skydock-scripts/src/templates'
import type { Arriving } from '../../../packages/skydock-scripts/src/templates'
import type { Route } from './+types/api.templates'

/* The editing templates this machine has — which kdenlive wrote each, whether every file it names
   is here, which one is the usual — for choosing one and for being warned (RULES, The editing project). Read
   fresh each time: a template is a folder anyone may have changed by hand. */
const loader = () => Response.json(listTemplates(getOutputDir()))

/* A template arrives as its project and the files it uses, together in one go: each is written to a
   file of its own first, since a template is laid out from the disk and not from a request, and
   those files are gone whatever happens. Which one is the usual arrives the same way, being a thing
   said about the templates rather than a file. */
const formSchema = z.object({
  name: z.string().trim().max(60).optional(),
  byDefault: z.string().optional()
})

const held = async (files: File[]) => {
  const arrived: Arriving[] = []
  for (const file of files) {
    const at = path.join(os.tmpdir(), `skydock-template-${crypto.randomUUID()}`)
    await pipeline(
      Readable.fromWeb(file.stream() as NodeWebStream<Uint8Array>),
      fs.createWriteStream(at)
    )
    arrived.push({ filename: file.name, at })
  }
  return arrived
}

const action = async ({ request }: Route.ActionArgs) => {
  const outputDir = getOutputDir()
  let arrived: Arriving[] = []
  try {
    const form = await request.formData()
    const said = formSchema.safeParse({
      name: form.get('name') ?? undefined,
      byDefault: form.get('byDefault') ?? undefined
    })
    if (!said.success)
      return Response.json({ ok: false, error: 'Nothing to bring in.' }, { status: 400 })

    /* saying which one is the usual is said on its own, with nothing brought in */
    if (said.data.byDefault !== undefined)
      return Response.json({
        ok: true,
        ...setDefaultTemplate(outputDir, said.data.byDefault || null)
      })

    const files = form.getAll('files').filter((entry): entry is File => entry instanceof File)
    if (files.length === 0)
      return Response.json({ ok: false, error: 'Nothing to bring in.' }, { status: 400 })

    arrived = await held(files)
    const template = await importTemplate({ outputDir, files: arrived, name: said.data.name })
    return Response.json({ ok: true, template, ...listTemplates(outputDir) })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 422 }
    )
  } finally {
    for (const file of arrived) fs.rmSync(file.at, { force: true })
  }
}

export { action, loader }
