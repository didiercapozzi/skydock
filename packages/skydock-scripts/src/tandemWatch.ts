import * as fs from 'node:fs'
import { publish } from './live'
import { getGroupsPath, loadManifest } from './manifest'
import { isTandem, statTandemArtifacts, tandemArtifacts } from './tandem'
import type { Manifest } from './types'
import { getManifestPath, hasCommand } from './utils'
import { passengerOf } from './workspace'

/* The film is rendered by the editor, outside SkyDock, and nothing tells SkyDock when it is done.
   So while a board is open the tandems' folders are looked at every couple of seconds — a readdir
   and a stat each, on this machine's own disk — and when one of them has changed and then stopped
   changing, the board is told what it holds now. That is how the Rendered step ticks by itself.

   Looked at rather than watched: a render goes on for minutes, writing all the while, and what
   matters is the moment it stops, which no single file event says; and the folder may be one the
   editor writes from another machine's side of a shared mount, where events do not always cross. */
const EVERY_MS = 2000

/* a film still being written changes between two looks; one that has not for this many is done */
const SETTLED_AFTER = 2

type Seen = { signature: string; unchanged: number; told: string | null; toldFilm: string | null }

type Watch = {
  watchers: number
  timer: ReturnType<typeof setInterval> | null
  seen: Map<string, Seen>
  manifest: { stamp: string; value: Manifest | null }
}

declare global {
  var skydockTandemWatch: Watch | undefined
}

const watch = () =>
  (globalThis.skydockTandemWatch ??= {
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

/* the manifest as it is on disk, read again only when it changed */
const currentManifest = (outputDir: string) => {
  const state = watch()
  const manifestPath = getManifestPath(outputDir)
  const stamp = `${stampOf(manifestPath)}|${stampOf(getGroupsPath(manifestPath))}`
  if (stamp !== state.manifest.stamp) {
    try {
      state.manifest = { stamp, value: loadManifest(manifestPath) }
    } catch {
      /* jumps that cannot be read right now are looked at again at the next look */
      return null
    }
  }
  return state.manifest.value
}

/* One look at every tandem. What a folder holds is told once it has stopped changing, and the first
   time round every tandem is told as it is — the board was drawn from a look of its own a moment
   before this began, and whatever happened in between must not fall in the gap. */
const lookAtTandems = (outputDir: string) => {
  const manifest = currentManifest(outputDir)
  if (!manifest) return
  const { seen } = watch()
  for (const group of manifest.groups) {
    if (!isTandem(group) || group.freed) continue
    const found = tandemArtifacts(outputDir, group)
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

    const fact = statTandemArtifacts(manifest, outputDir)[group.id]
    if (!fact) continue
    /* a film that cannot be read yet is one the editor has not finished, whatever its size says */
    if (fact.film && fact.film.seconds === null && hasCommand('ffprobe')) continue
    publish({
      kind: 'tandem',
      groupId: group.id,
      who: passengerOf(group),
      fact,
      rendered: state.told !== null && fact.film !== null && state.toldFilm !== film
    })
    seen.set(group.id, { ...state, told: signature, toldFilm: film })
  }
}

/* Looked at only while somebody is there to be told: the first board to listen starts it and the
   last one to leave stops it. */
const watchTandems = (outputDir: string) => {
  const state = watch()
  state.watchers++
  state.timer ??= setInterval(() => lookAtTandems(outputDir), EVERY_MS)
  return () => {
    state.watchers--
    if (state.watchers > 0 || !state.timer) return
    clearInterval(state.timer)
    state.timer = null
    state.seen.clear()
  }
}

export { lookAtTandems, watchTandems }
