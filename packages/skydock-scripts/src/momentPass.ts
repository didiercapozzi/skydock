import * as fs from 'node:fs'
import { jumpMoments } from './jumpMoments'
import { following } from './live'
import { changeBoardSoon, flushBoardChanges, loadManifest } from './manifest'
import type { Manifest, ManifestFile } from './types'
import { messageOf } from './lib/words'
import { getManifestPath, getOutputDir, isVideoFile } from './utils'

const needsMoments = (file: ManifestFile) =>
  isVideoFile(file.path) &&
  !!file.id &&
  !file.freed &&
  file.moments === undefined &&
  fs.existsSync(file.path)

const ensureMoments = async (manifest: Manifest, onFound?: () => void) => {
  let found = 0
  for (const file of manifest.files.filter(needsMoments)) {
    const reading = following('moments', file.id)
    try {
      const moments = await jumpMoments(file.path, reading.at)
      file.moments = moments
      found++
      onFound?.()
      reading.done(true, { moments })
    } catch {
      reading.done(false)
    }
  }
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
