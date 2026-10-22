import { publish } from './live'
import { loadManifestAsync, pairStamp } from './manifest'
import { factOf, isNamedMontage, montageArtifacts, secondsOf } from './montageArtifacts'
import type { Manifest } from './types'
import { getManifestPath, hasCommand } from './utils'
import { passengerOf } from './workspace'

const EVERY_MS = 2000

const SETTLED_AFTER = 2

/* `told` is what the board was last told of a montage while it stayed so; a change makes it none, since the
   board may have heard of the change another way and be showing something else by now. `announced` is
   whether it was ever told, which is what makes a film rendered again news and a film found at the start not. */
type Seen = {
  signature: string
  unchanged: number
  told: string | null
  toldFilm: string | null
  announced: boolean
}

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
    const signature = `${found.edit}|${film}`
    const before = seen.get(group.id)
    const state: Seen =
      before && before.signature === signature
        ? { ...before, unchanged: before.unchanged + 1 }
        : {
            signature,
            unchanged: 0,
            told: null,
            toldFilm: before?.toldFilm ?? null,
            announced: before?.announced ?? false
          }
    seen.set(group.id, state)
    if (state.unchanged < SETTLED_AFTER || state.told === signature) continue

    const fact = factOf(found)
    if (fact.film && fact.film.seconds === null && (await hasCommand('ffprobe'))) continue
    publish({
      kind: 'montage',
      groupId: group.id,
      who: passengerOf(group),
      fact,
      rendered: state.announced && fact.film !== null && state.toldFilm !== film
    })
    seen.set(group.id, { ...state, told: signature, toldFilm: film, announced: true })
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

/* What the board was told of a montage is no longer what it holds once the montage was taken back: it is
   looked at again from nothing, and told whatever it is found to be. */
const forgetWatched = (groupIds: string[]) => {
  for (const id of groupIds) watch().seen.delete(id)
}

export { forgetWatched, lookAtMontages, watchMontages }
