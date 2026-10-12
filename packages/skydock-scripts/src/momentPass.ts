import { jumpMoments } from './jumpMoments'
import { following, job } from './live'
import { outputKeyOf } from './fileStatus'
import { flushBoardChanges, loadManifestAsync, recordPass } from './manifest'
import type { Manifest, ManifestFile } from './types'
import { pathExists } from './lib/fs'
import { untilQuiet } from './lib/quiet'
import { singleFlight } from './lib/singleFlight'
import { messageOf } from './lib/words'
import { getManifestPath, getOutputDir, isVideoFile, mapWithLimit } from './utils'

const needsMoments = async (file: ManifestFile) =>
  isVideoFile(file.path) &&
  !!file.id &&
  !file.freed &&
  file.moments === undefined &&
  (await pathExists(file.path))

const ensureMoments = async (manifest: Manifest, onFound?: () => void | Promise<void>) => {
  let found = 0
  const needed = await mapWithLimit(manifest.files, 16, needsMoments)
  const todo = manifest.files.filter((_, index) => needed[index])
  const finding = todo.length > 0 ? job({ type: 'moments', label: '', total: todo.length }) : null
  finding?.rows(todo.map((file) => ({ key: outputKeyOf(file), name: file.filename, size: 0 })))
  for (const file of todo) {
    await untilQuiet()
    const key = outputKeyOf(file)
    const reading = following('moments', file.id)
    finding?.row({ key, at: 'now', part: 0 })
    try {
      const moments = await jumpMoments(file.path, (percent) => {
        reading.at(percent)
        finding?.row({ key, at: 'now', part: percent / 100 })
      })
      file.moments = moments
      found++
      await onFound?.()
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

const recordMoments = (manifestPath: string, pass: Manifest) =>
  recordPass(
    manifestPath,
    pass,
    (file, done) => {
      if (file.moments === undefined && done.moments !== undefined) file.moments = done.moments
    },
    'moments'
  )

const buildMissingMoments = singleFlight(async (outputDir?: string) => {
  const manifestPath = getManifestPath(outputDir || getOutputDir())
  let total = 0
  for (;;) {
    const manifest = await loadManifestAsync(manifestPath)
    if (!manifest) break
    const found = await ensureMoments(manifest, async () => {
      recordMoments(manifestPath, manifest)
      await flushBoardChanges(manifestPath)
    })
    total += found
    if (found === 0) break
  }
  return total
})

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
