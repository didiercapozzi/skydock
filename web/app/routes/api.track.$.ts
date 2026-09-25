import { getOutputDir, jumpTrack } from '@skydock/scripts'
import type { JumpTrack } from '@skydock/scripts'
import * as fs from 'node:fs'
import * as path from 'node:path'

/* A clip's jump as a series, for the graph under the footage (RULES, The jump on a graph). Read off
   the original rather than kept in the manifest: it is a few hundred numbers per clip, wanted only
   while somebody is looking at that clip, and the original is the only thing that has them.

   Held afterwards by path and by the moment the file was last written, since a clip is opened,
   closed and opened again while an edit is decided, and reading it costs a quarter of a second of
   ffmpeg each time. A file that changes on disk is a different key and is read afresh. */
const held = new Map<string, JumpTrack | null>()

const KEEP = 40

const trackOf = async (filePath: string, mtime: number) => {
  const key = `${filePath}:${mtime}`
  if (held.has(key)) return held.get(key) ?? null
  const track = await jumpTrack(filePath)
  /* oldest out first, so a day of scrubbing does not grow without end */
  if (held.size >= KEEP) held.delete([...held.keys()][0])
  held.set(key, track)
  return track
}

const loader = async ({ params }: { params: Record<string, string | undefined> }) => {
  const filePath = path.join(getOutputDir(), params['*'] ?? '')
  const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null
  if (!stat?.isFile()) return new Response('Not found', { status: 404 })
  return Response.json(
    { track: await trackOf(filePath, stat.mtimeMs) },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export { loader }
