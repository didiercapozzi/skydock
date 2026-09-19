import * as fs from 'node:fs'
import * as path from 'node:path'
import { CameraGone, copyCamera } from './copy'
import { publish } from './live'
import { buildMissingProxies } from './proxy'
import { scanMedia } from './scan'

/* A camera plugged in is copied off on its own. The machine mounts its card like any drive; while the
   board's server runs, the mounted drives are looked at every couple of seconds, and one that has
   appeared with a DCIM folder at its root — where every camera keeps its pictures — is copied into
   the originals, then scanned, so its jumps are on the board with nobody pressing anything.

   A drive without a DCIM folder is not a camera and is never looked into, and nothing is ever
   written to the camera: it is only read. */

/* Where cameras get mounted. `/mnt/osmo` is the host's media folder as the development container
   sees it; `/media` and `/run/media` are where a desktop mounts removable drives. An empty setting
   turns this off. */
const cameraRoots = () =>
  (process.env.SKYDOCK_CAMERA_ROOTS ?? '/mnt/osmo:/media:/run/media')
    .split(':')
    .map((root) => root.trim())
    .filter(Boolean)

const EVERY_MS = 2000

/* mountinfo writes a space in a path as \040, and the like */
const unescapeMount = (field: string) =>
  field.replace(/\\([0-7]{3})/g, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8))
  )

/* The drives mounted under the roots that are cameras: a DCIM folder at the top, and nothing else
   asked of them. Read off the system's own list of mounts, which says the moment one comes or goes. */
const mountedCameras = (mountinfo = '/proc/self/mountinfo') => {
  let text: string
  try {
    text = fs.readFileSync(mountinfo, 'utf-8')
  } catch {
    return []
  }
  const roots = cameraRoots().map((root) => path.resolve(root))
  const mounted = text.split('\n').flatMap((line) => {
    const point = line.split(' ')[4]
    return point ? [unescapeMount(point)] : []
  })
  return [...new Set(mounted)].filter(
    (point) =>
      roots.some((root) => point.startsWith(`${root}${path.sep}`)) &&
      fs.existsSync(path.join(point, 'DCIM'))
  )
}

type Watch = {
  timer: ReturnType<typeof setInterval> | null
  /* the cameras already seen while they stay plugged in: one is copied once per plugging in */
  seen: Set<string>
  queue: string[]
  copying: boolean
}

declare global {
  var skydockCameraWatch: Watch | undefined
}

const watch = () =>
  (globalThis.skydockCameraWatch ??= { timer: null, seen: new Set(), queue: [], copying: false })

/* One camera at a time, in the order they were plugged in: two cards read at once are each read at
   half the speed, and their files would land interleaved. */
const copyNext = async (outputDir: string) => {
  const state = watch()
  const cameraDir = state.queue.shift()
  if (!cameraDir || state.copying) return
  state.copying = true
  const camera = path.basename(cameraDir)
  let last = { done: 0, total: 0, copied: 0, skipped: 0 }
  try {
    const result = await copyCamera({
      cameraDir: path.join(cameraDir, 'DCIM'),
      outputDir,
      onProgress: (progress) => {
        last = progress
        publish({ kind: 'camera', camera, state: 'copying', ...progress })
      }
    })
    /* only a copy that brought something new is worth a scan */
    if (result.copied > 0) {
      await scanMedia({ outputDir })
      void buildMissingProxies(outputDir).catch(() => undefined)
    }
    publish({ kind: 'camera', camera, state: 'done', ...result })
  } catch (e) {
    const gone = e instanceof CameraGone
    /* what did make it across is whole, and is scanned so it is not left out of the board */
    if (last.copied > 0) await scanMedia({ outputDir }).catch(() => undefined)
    publish({
      kind: 'camera',
      camera,
      state: gone ? 'gone' : 'failed',
      ...last,
      reason: e instanceof Error ? e.message : String(e)
    })
  } finally {
    state.copying = false
    if (state.queue.length > 0) void copyNext(outputDir)
  }
}

/* One look at what is mounted. A camera that has appeared is queued; one that has gone is forgotten,
   so plugging it in again copies what is new on it since. */
const lookForCameras = (outputDir: string, mountinfo?: string) => {
  const state = watch()
  const now = new Set(mountedCameras(mountinfo))
  for (const camera of now)
    if (!state.seen.has(camera)) {
      state.seen.add(camera)
      state.queue.push(camera)
    }
  for (const camera of state.seen) if (!now.has(camera)) state.seen.delete(camera)
  if (!state.copying && state.queue.length > 0) void copyNext(outputDir)
}

/* Started once, and kept for as long as the server runs — a camera plugged in with no board open is
   still copied, and the board shows it the next time it is opened. A camera already plugged in when
   this starts is copied too: what is already here is passed over, and costs next to nothing. */
const watchCameras = (outputDir: string) => {
  const state = watch()
  if (state.timer || cameraRoots().length === 0) return
  lookForCameras(outputDir)
  state.timer = setInterval(() => lookForCameras(outputDir), EVERY_MS)
}

export { lookForCameras, mountedCameras, watchCameras }
