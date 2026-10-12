import * as crypto from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebStream } from 'node:stream/web'
import { z } from 'zod'
import { getOutputDir, messageOf } from '@skydock/scripts'
import {
  importTemplate,
  listTemplates,
  setDefaultTemplate
} from '../../../packages/skydock-scripts/src/templates'
import type { Arriving } from '../../../packages/skydock-scripts/src/templates'
import type { Route } from './+types/api.templates'

const loader = async () => Response.json(await listTemplates(getOutputDir()))

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
      createWriteStream(at)
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

    if (said.data.byDefault !== undefined)
      return Response.json({
        ok: true,
        ...(await setDefaultTemplate(outputDir, said.data.byDefault || null))
      })

    const files = form.getAll('files').filter((entry): entry is File => entry instanceof File)
    if (files.length === 0)
      return Response.json({ ok: false, error: 'Nothing to bring in.' }, { status: 400 })

    arrived = await held(files)
    const template = await importTemplate({ outputDir, files: arrived, name: said.data.name })
    return Response.json({ ok: true, template, ...(await listTemplates(outputDir)) })
  } catch (e) {
    return Response.json({ ok: false, error: messageOf(e) }, { status: 422 })
  } finally {
    await Promise.all(arrived.map((file) => rm(file.at, { force: true })))
  }
}

export { action, loader }
