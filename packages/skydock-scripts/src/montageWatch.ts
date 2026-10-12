import * as fs from 'node:fs'
import { publish } from './live'
import { getGroupsPath, loadManifestAsync } from './manifest'
import {
  isNamedMontage,
  montageArtifacts,
  secondsOf,
  statMontageArtifacts
} from './montageArtifacts'
import type { Manifest } from './types'
import { getManifestPath, hasCommand } from './utils'
import { passengerOf } from './workspace'

const EVERY_MS = 2000

const SETTLED_AFTER = 2

type Seen = { signature: string; unchanged: number; told: string | null; toldFilm: string | null }

type Watch = {
  watchers: number
  timer: ReturnType<typeof setInterval> | null
  seen: Map<string, Seen>
  manifest: { stamp: string; value: Manifest | null }
}

declare global {
  var skydockMontageWatch: Watch | undefined
}

const watch = () =>
  (globalThis.skydockMontageWatch ??= {
    watchers: 0,
    timer: null,
    seen: new Map(),
    manifest: { stamp: '', value: null }
  })

const stampOf = (target: string) => {
  try {
    const stat = fs.statSync(target)
    return `${stat.size}:${stat.mtimeMs}`
  } catch {
    return 'none'
  }
}

const currentManifest = async (outputDir: string) => {
  const state = watch()
  const manifestPath = getManifestPath(outputDir)
  const stamp = `${stampOf(manifestPath)}|${stampOf(getGroupsPath(manifestPath))}`
  if (stamp !== state.manifest.stamp) {
    try {
      state.manifest = { stamp, value: await loadManifestAsync(manifestPath) }
    } catch {
      return null
    }
  }
  return state.manifest.value
}

const lookAtMontages = async (outputDir: string) => {
  const manifest = await currentManifest(outputDir)
  if (!manifest) return
  const { seen } = watch()
  let facts: ReturnType<typeof statMontageArtifacts> | null = null
  for (const group of manifest.groups) {
    if (!isNamedMontage(group) || group.freed) continue
    const found = montageArtifacts(outputDir, group)
    secondsOf(found)
    const film = found.film ? `${found.film.size}:${found.film.mtime}` : 'none'
    const signature = `${found.project}|${film}`
    const before = seen.get(group.id)
    const state: Seen =
      before && before.signature === signature
        ? { ...before, unchanged: before.unchanged + 1 }
        : {
            signature,
            unchanged: 0,
            told: before?.told ?? null,
            toldFilm: before?.toldFilm ?? null
          }
    seen.set(group.id, state)
    if (state.unchanged < SETTLED_AFTER || state.told === signature) continue

    facts ??= statMontageArtifacts(manifest, outputDir)
    const fact = facts[group.id]
    if (!fact) continue
    if (fact.film && fact.film.seconds === null && hasCommand('ffprobe')) continue
    publish({
      kind: 'montage',
      groupId: group.id,
      who: passengerOf(group),
      fact,
      rendered: state.told !== null && fact.film !== null && state.toldFilm !== film
    })
    seen.set(group.id, { ...state, told: signature, toldFilm: film })
  }
}

const watchMontages = (outputDir: string) => {
  const state = watch()
  state.watchers++
  let looking = false
  state.timer ??= setInterval(async () => {
    if (looking) return
    looking = true
    try {
      await lookAtMontages(outputDir)
    } finally {
      looking = false
    }
  }, EVERY_MS)
  return () => {
    state.watchers--
    if (state.watchers > 0 || !state.timer) return
    clearInterval(state.timer)
    state.timer = null
    state.seen.clear()
  }
}

export { lookAtMontages, watchMontages }
