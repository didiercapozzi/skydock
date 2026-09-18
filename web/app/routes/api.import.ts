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
   looks again once every file of the drop is in. */

const targetOf = (raw: string | null): ImportTarget | null => {
  if (raw === 'sort') return { kind: 'sort' }
  if (raw?.startsWith('group:')) return { kind: 'group', groupId: raw.slice(6) }
  if (raw?.startsWith('dest:')) return { kind: 'destination', name: raw.slice(5) }
  return null
}

const action = async ({ request }: Route.ActionArgs) => {
  const url = new URL(request.url)
  const target = targetOf(url.searchParams.get('target'))
  const filename = url.searchParams.get('filename')
  if (!target || !filename || !request.body)
    return Response.json({ ok: false, error: 'Nothing to add.' }, { status: 400 })
  try {
    const result = await importFile({
      outputDir: getOutputDir(),
      filename,
      lastModified: Number(url.searchParams.get('lastModified')),
      body: Readable.fromWeb(request.body as NodeWebStream<Uint8Array>),
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
