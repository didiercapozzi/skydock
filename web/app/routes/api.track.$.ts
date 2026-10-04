import { getOutputDir, jumpTrack } from '@skydock/scripts'
import type { JumpTrack } from '@skydock/scripts'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { limited } from '../../../packages/skydock-scripts/src/lib/queue'

const held = new Map<string, JumpTrack | null>()

const KEEP = 40

const reading = limited<JumpTrack | null>(2)

const trackOf = async (filePath: string, mtime: number) => {
  const key = `${filePath}:${mtime}`
  if (held.has(key)) return held.get(key) ?? null
  const track = await reading(key, () => jumpTrack(filePath))
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
