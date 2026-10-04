import * as fs from 'node:fs'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeWebStream } from 'node:stream/web'
import { getOutputDir, messageOf } from '@skydock/scripts'
import { importFile } from '../../../packages/skydock-scripts/src/importFile'
import type { ImportTarget } from '../../../packages/skydock-scripts/src/importFile'
import { catchUp } from '../../../packages/skydock-scripts/src/catchUp'
import type { Route } from './+types/api.import'

const targetOf = (raw: string | null): ImportTarget | null => {
  if (raw === 'sort') return { kind: 'sort' }
  if (raw?.startsWith('group:')) return { kind: 'group', groupId: raw.slice(6) }
  if (raw?.startsWith('dest:')) return { kind: 'destination', name: raw.slice(5) }
  return null
}

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
      body: fs.createReadStream(from)
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
      target,
      token: url.searchParams.get('token') ?? undefined
    })
    void catchUp()
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json({ ok: false, error: messageOf(e) }, { status: 422 })
  }
}

export { action }
