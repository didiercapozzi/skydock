import * as fs from 'node:fs'
import { jumpMoments } from './jumpMoments'
import { following, job } from './live'
import { changeBoardSoon, flushBoardChanges, loadManifestAsync } from './manifest'
import type { Manifest, ManifestFile } from './types'
import { untilQuiet } from './lib/quiet'
import { messageOf } from './lib/words'
import { getManifestPath, getOutputDir, isVideoFile } from './utils'

const needsMoments = (file: ManifestFile) =>
  isVideoFile(file.path) &&
  !!file.id &&
  !file.freed &&
  file.moments === undefined &&
  fs.existsSync(file.path)

const ensureMoments = async (manifest: Manifest, onFound?: () => void | Promise<void>) => {
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
  changeBoardSoon(
    manifestPath,
    (current) => {
      const found = new Map(pass.files.map((file) => [file.id ?? file.path, file]))
      for (const file of current.files) {
        const done = found.get(file.id ?? file.path)
        if (file.moments === undefined && done?.moments !== undefined) file.moments = done.moments
      }
    },
    'moments'
  )

let running: Promise<number> | null = null

const buildMissingMoments = async (outputDir?: string) => {
  if (running) return await running
  const manifestPath = getManifestPath(outputDir || getOutputDir())
  running = (async () => {
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
  })()
  try {
    return await running
  } finally {
    running = null
  }
}

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
