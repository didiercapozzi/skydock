import * as fs from 'node:fs'
import { jumpMoments } from './jumpMoments'
import { following, job } from './live'
import { changeBoardSoon, flushBoardChanges, loadManifest } from './manifest'
import type { Manifest, ManifestFile } from './types'
import { untilQuiet } from './lib/quiet'
import { messageOf } from './lib/words'
import { getManifestPath, getOutputDir, isVideoFile } from './utils'

/* Where the jump is in each clip, found in a pass of its own beside the proxies' rather than inside
   theirs. Reading a clip's telemetry goes through the whole file and has nothing to do with
   transcoding it, so the two run side by side, and each says how far it has got on the clip as it
   goes (RULES, Work shown as it happens). */

/* a clip not yet asked where its jump is; one asked and found to show none is answered (`null`) and
   is never asked again */
const needsMoments = (file: ManifestFile) =>
  isVideoFile(file.path) &&
  !!file.id &&
  !file.freed &&
  file.moments === undefined &&
  fs.existsSync(file.path)

/* Asks each clip once and writes the answer on it — for most clips that there is no jump in them. A
   reading that fails is not written down: the clip is asked again next time rather than told it has
   no jump. `onFound` fires as each answer lands, before the board is told, so what the board hears
   is already on the disk. */
const ensureMoments = async (manifest: Manifest, onFound?: () => void) => {
  let found = 0
  const todo = manifest.files.filter(needsMoments)
  const finding = todo.length > 0 ? job({ type: 'moments', label: '', total: todo.length }) : null
  finding?.rows(todo.map((file) => ({ key: file.id ?? file.path, name: file.filename, size: 0 })))
  for (const file of todo) {
    await untilQuiet()
    const key = file.id ?? file.path
    const reading = following('moments', file.id)
    finding?.row({ key, at: 'now', part: 0 })
    try {
      const moments = await jumpMoments(file.path, (percent) => {
        reading.at(percent)
        finding?.row({ key, at: 'now', part: percent / 100 })
      })
      file.moments = moments
      found++
      onFound?.()
      reading.done(true, { moments })
      finding?.row({ key, at: 'done' })
    } catch (e) {
      reading.done(false)
      finding?.row({ key, at: 'failed', note: e instanceof Error ? e.message : String(e) })
    }
    finding?.step()
  }
  finding?.finish()
  return found
}

/* What a pass found, written into the manifest as it is on disk at that moment — never over it: the
   board goes on working while a clip is read, and a mark moved by hand meanwhile is not undone. */
const recordMoments = (manifestPath: string, pass: Manifest) =>
  changeBoardSoon(
    manifestPath,
    (current) => {
      const found = new Map(pass.files.map((file) => [file.id ?? file.path, file]))
      for (const file of current.files) {
        const done = found.get(file.id ?? file.path)
        if (file.moments === undefined && done?.moments !== undefined) file.moments = done.moments
      }
    },
    /* the pass as it is now says everything an earlier call of it did */
    'moments'
  )

/* one run at a time in a process, the second caller waiting for the first, as the proxies' does */
let running: Promise<number> | null = null

/* Loads, finds what is missing, saves; once round again while something was found, for the clips
   that arrived while this one was reading. */
const buildMissingMoments = async (outputDir?: string) => {
  if (running) return await running
  const manifestPath = getManifestPath(outputDir || getOutputDir())
  running = (async () => {
    let total = 0
    for (;;) {
      const manifest = loadManifest(manifestPath)
      if (!manifest) break
      const found = await ensureMoments(manifest, () => {
        recordMoments(manifestPath, manifest)
        flushBoardChanges(manifestPath)
      })
      total += found
      if (found === 0) break
    }
    return total
  })()
  try {
    return await running
  } finally {
    running = null
  }
}

/* The server can be stopped half way through a card, and the clips it had not reached would then
   wait for the next scan: so the first board to connect to a server just started has them read. */
declare global {
  var skydockMomentsResumed: boolean | undefined
}

const resumeMoments = (outputDir?: string) => {
  if (globalThis.skydockMomentsResumed) return
  globalThis.skydockMomentsResumed = true
  void buildMissingMoments(outputDir).catch((e: unknown) => {
    console.error('[Moments] resuming failed:', messageOf(e))
  })
}

export { buildMissingMoments, resumeMoments, ensureMoments, needsMoments }
