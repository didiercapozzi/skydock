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

   A drive without a DCIM folder is not a camera and is never looked into. Copying only reads the
   camera; taking a file off it is a separate thing, asked for on its page and allowed only for a
   file proved to be here already. */

/* Where cameras turn up, which is a different place on each system: a Linux desktop mounts a
   removable drive under `/media` or `/run/media`, and `/mnt/osmo` is the host's media folder as the
   development container sees it; macOS puts every drive in `/Volumes`; Windows gives each one a
   letter of its own, so there every drive is a place to look.

   Somewhere else can be named instead, several separated the way this system separates paths — not
   by a colon, which is part of `C:\`. Naming nowhere turns this off. */
const DEFAULT_ROOTS: Record<string, string[]> = {
  darwin: ['/Volumes'],
  linux: ['/mnt/osmo', '/media', '/run/media']
}

/* every drive letter this Windows machine has, which is where its cameras are */
const windowsDrives = () =>
  Array.from({ length: 26 }, (_, i) => `${String.fromCharCode(65 + i)}:${path.sep}`).filter(
    (drive) => fs.existsSync(drive)
  )

const cameraRoots = () => {
  const told = process.env.SKYDOCK_CAMERA_ROOTS
  if (told === undefined)
    return process.platform === 'win32'
      ? windowsDrives()
      : (DEFAULT_ROOTS[process.platform] ?? DEFAULT_ROOTS.linux)
  return told
    .split(path.delimiter)
    .map((root) => root.trim())
    .filter(Boolean)
}

const EVERY_MS = 2000

/* mountinfo writes a space in a path as \040, and the like */
const unescapeMount = (field: string) =>
  field.replace(/\\([0-7]{3})/g, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8))
  )

/* What Linux has mounted under those places, read off the system's own list of mounts, which says
   the moment one comes or goes. */
const mountsUnder = (roots: string[], mountinfo = '/proc/self/mountinfo') => {
  let text: string
  try {
    text = fs.readFileSync(mountinfo, 'utf-8')
  } catch {
    return []
  }
  const mounted = text.split('\n').flatMap((line) => {
    const point = line.split(' ')[4]
    return point ? [unescapeMount(point)] : []
  })
  return mounted.filter((point) => roots.some((root) => point.startsWith(`${root}${path.sep}`)))
}

/* what macOS has in `/Volumes`: a drive is a folder there, and there is no list of mounts to read */
const foldersUnder = (roots: string[]) =>
  roots.flatMap((root) => {
    try {
      return fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => path.join(root, entry.name))
    } catch {
      return []
    }
  })

/* The drives that are cameras: a DCIM folder at the top, and nothing else asked of them. On Windows
   the drive is the camera; everywhere else it is mounted somewhere under the places looked at. */
const mountedCameras = (mountinfo?: string) => {
  const roots = cameraRoots().map((root) => path.resolve(root))
  if (roots.length === 0) return []
  const drives =
    process.platform === 'win32'
      ? roots
      : process.platform === 'darwin'
        ? foldersUnder(roots)
        : mountsUnder(roots, mountinfo)
  return [...new Set(drives)].filter((point) => fs.existsSync(path.join(point, 'DCIM')))
}

/* What a camera is called: the name of where it is mounted — or, on Windows, its drive letter,
   since a drive's root has no name of its own. */
const cameraName = (mount: string) => path.basename(mount) || mount.replace(/[\\/]+$/, '')

type Watch = {
  timer: ReturnType<typeof setInterval> | null
  /* the cameras already seen while they stay plugged in: one is copied once per plugging in */
  seen: Set<string>
  queue: string[]
  copying: boolean
  /* the cameras last said to be plugged in, so a change is said once */
  said: string
}

declare global {
  var skydockCameraWatch: Watch | undefined
}

const watch = () =>
  (globalThis.skydockCameraWatch ??= {
    timer: null,
    seen: new Set(),
    queue: [],
    copying: false,
    said: ''
  })

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
  const mounted = [...now].sort()
  if (mounted.join('\n') !== state.said) {
    state.said = mounted.join('\n')
    publish({
      kind: 'cameras',
      mounted: mounted.map((mount) => ({ camera: cameraName(mount), mount }))
    })
  }
  if (!state.copying && state.queue.length > 0) void copyNext(outputDir)
}

/* Kept for as long as the server runs — a camera plugged in with no board open is still copied, and
   the board shows it the next time it is opened. A camera already plugged in when this starts is
   copied too: what is already here is passed over, and costs next to nothing. Each start replaces
   the look left running by the one before, so code loaded afresh is the code that looks; what has
   been seen and what is being copied are kept, so nothing is copied twice. */
const watchCameras = (outputDir: string) => {
  const state = watch()
  if (state.timer) clearInterval(state.timer)
  state.timer = null
  if (cameraRoots().length === 0) return
  lookForCameras(outputDir)
  state.timer = setInterval(() => lookForCameras(outputDir), EVERY_MS)
}

/* whether a camera is being copied right now — nothing is taken off one while it is read */
const cameraCopying = () => watch().copying || watch().queue.length > 0

export { cameraCopying, cameraName, lookForCameras, mountedCameras, watchCameras }
