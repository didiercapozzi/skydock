import * as fs from 'node:fs'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeWebStream } from 'node:stream/web'
import { getOutputDir } from '@skydock/scripts'
/* server-only: it writes files and shells out, so it is imported here rather than through the barrel
   the browser evaluates */
import { importFile } from '../../../packages/skydock-scripts/src/importFile'
import type { ImportTarget } from '../../../packages/skydock-scripts/src/importFile'
import { buildMissingProxies } from '../../../packages/skydock-scripts/src/proxy'
import type { Route } from './+types/api.import'

/* One file dragged in from the computer: its bytes are the body, and where it goes is in the address
   — `target` is `group:<id>`, `dest:<name>` or `sort`. The answer only says how it went; the board
   looks again once every file of the drop is in.

   A window that hands the page no bytes — only where the file is — says `path` instead, and the
   file is read off the machine here. It is the same machine the file was dragged from, since the
   server and the window are one app; a path this machine cannot read is refused by name. */

const targetOf = (raw: string | null): ImportTarget | null => {
  if (raw === 'sort') return { kind: 'sort' }
  if (raw?.startsWith('group:')) return { kind: 'group', groupId: raw.slice(6) }
  if (raw?.startsWith('dest:')) return { kind: 'destination', name: raw.slice(5) }
  return null
}

/* The file itself, however it was handed over: the bytes that came with the request, or the file at
   the address they were dropped as. */
const handedOver = (request: Request, url: URL) => {
  const from = url.searchParams.get('path')
  if (from) {
    if (!fs.existsSync(from) || !fs.statSync(from).isFile())
      throw new Error(`${path.basename(from)} is not a file this machine can read.`)
    return {
      filename: path.basename(from),
      lastModified: fs.statSync(from).mtimeMs,
      body: fs.createReadStream(from)
    }
  }
  const filename = url.searchParams.get('filename')
  if (!filename || !request.body) return null
  return {
    filename,
    lastModified: Number(url.searchParams.get('lastModified')),
    body: Readable.fromWeb(request.body as NodeWebStream<Uint8Array>)
  }
}

const action = async ({ request }: Route.ActionArgs) => {
  const url = new URL(request.url)
  const target = targetOf(url.searchParams.get('target'))
  if (!target) return Response.json({ ok: false, error: 'Nothing to add.' }, { status: 400 })
  try {
    const carried = handedOver(request, url)
    if (!carried) return Response.json({ ok: false, error: 'Nothing to add.' }, { status: 400 })
    const result = await importFile({
      outputDir: getOutputDir(),
      ...carried,
      target
    })
    /* a clip needs its small copy for the crop bar and the editor, built behind the answer */
    void buildMissingProxies().catch(() => undefined)
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 422 }
    )
  }
}

export { action }
