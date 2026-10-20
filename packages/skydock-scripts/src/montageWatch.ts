import { publish } from './live'
import { loadManifestAsync, pairStamp } from './manifest'
import { factOf, isNamedMontage, montageArtifacts, secondsOf } from './montageArtifacts'
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

const currentManifest = async (outputDir: string) => {
  const state = watch()
  const manifestPath = getManifestPath(outputDir)
  const stamp = await pairStamp(manifestPath)
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
  for (const group of manifest.groups) {
    if (!isNamedMontage(group) || group.freed) continue
    const found = await montageArtifacts(outputDir, group)
    secondsOf(found)
    const film = found.film ? `${found.film.size}:${found.film.mtime}` : 'none'
    const signature = `${found.kdenlive ?? ''}|${found.edit}|${film}`
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

    const fact = factOf(found, outputDir)
    if (fact.film && fact.film.seconds === null && (await hasCommand('ffprobe'))) continue
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
