import * as fs from 'node:fs'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeWebStream } from 'node:stream/web'
import { z } from 'zod'
import { getOutputDir, messageOf } from '@skydock/scripts'
/* server-only: it writes files and shells out, so it is imported here rather than through the barrel
   the browser evaluates */
import { beginDrop, dropRow, endDrop } from '../../../packages/skydock-scripts/src/dropJobs'
import { importFile } from '../../../packages/skydock-scripts/src/importFile'
import type { ImportTarget } from '../../../packages/skydock-scripts/src/importFile'
import { catchUp } from '../../../packages/skydock-scripts/src/catchUp'
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
   the address they were dropped as. How big it is comes with it — read off the machine where the
   file is already there, and said by whoever is sending where it is not — so the board can be told
   how far through one long clip a copy has got. */
const handedOver = (request: Request, url: URL) => {
  const from = url.searchParams.get('path')
  if (from) {
    const said = fs.existsSync(from) ? fs.statSync(from) : null
    if (!said?.isFile())
      throw new Error(`${path.basename(from)} is not a file this machine can read.`)
    return {
      filename: path.basename(from),
      lastModified: said.mtimeMs,
      size: said.size,
      /* in large pieces: read and written a few kilobytes at a time on one hard disk, the heads travel
         between the two and the copy crawls */
      body: fs.createReadStream(from, { highWaterMark: 16 * 1024 ** 2 })
    }
  }
  const filename = url.searchParams.get('filename')
  if (!filename || !request.body) return null
  return {
    filename,
    lastModified: Number(url.searchParams.get('lastModified')),
    size:
      Number(url.searchParams.get('size')) || Number(request.headers.get('content-length')) || 0,
    body: Readable.fromWeb(request.body as NodeWebStream<Uint8Array>)
  }
}

/* what a drop is made of, said before the first file is sent — so the corner has the whole list from the
   start (RULES, Principles) — and when it is over */
const beginSchema = z.object({
  batch: z.string(),
  where: z.string(),
  files: z.array(z.object({ key: z.string(), name: z.string(), size: z.number() }))
})

/* what became of one file, for its row */
const rowOf = (result: Awaited<ReturnType<typeof importFile>>) =>
  result.outcome === 'there'
    ? { at: 'skipped' as const, phase: 'there' }
    : result.outcome === 'kept'
      ? { at: 'skipped' as const, phase: 'kept', ...(result.reason ? { note: result.reason } : {}) }
      : { at: 'done' as const, phase: 'done' }

const action = async ({ request }: Route.ActionArgs) => {
  const url = new URL(request.url)
  const batch = url.searchParams.get('batch') ?? undefined
  if (url.searchParams.get('begin')) {
    const begun = beginSchema.safeParse(await request.json().catch(() => null))
    if (!begun.success)
      return Response.json({ ok: false, error: 'Nothing to add.' }, { status: 400 })
    beginDrop({ ...begun.data, outputDir: getOutputDir() })
    return Response.json({ ok: true })
  }
  if (url.searchParams.get('end') && batch) {
    endDrop(batch)
    return Response.json({ ok: true })
  }
  const target = targetOf(url.searchParams.get('target'))
  if (!target) return Response.json({ ok: false, error: 'Nothing to add.' }, { status: 400 })
  const key = url.searchParams.get('key') ?? undefined
  try {
    const carried = handedOver(request, url)
    if (!carried) return Response.json({ ok: false, error: 'Nothing to add.' }, { status: 400 })
    const result = await importFile({
      outputDir: getOutputDir(),
      ...carried,
      target,
      drop: batch && key ? { batch, key } : undefined
    })
    if (key) dropRow(batch, { key, ...rowOf(result) })
    /* a clip needs its small copy for the crop bar and the editor, and its jump found, behind the answer */
    void catchUp()
    return Response.json({ ok: true, ...result })
  } catch (e) {
    if (key) dropRow(batch, { key, at: 'failed', note: messageOf(e) })
    return Response.json({ ok: false, error: messageOf(e) }, { status: 422 })
  }
}

export { action }
