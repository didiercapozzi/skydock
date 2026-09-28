import * as fs from 'node:fs'
import * as path from 'node:path'
import { CameraGone, CopyStopped, copyCamera } from './copy'
import type { Copied, CopyProgress } from './copy'
import { gatherArrivals, putOnBoard } from './arrivals'
import { kioReader } from './kio'
import { camerasThroughKde, copyOverKio, isKioCamera, kioCameraName } from './kioCamera'
import type { SeenClip } from './kioCamera'
import { publish } from './live'
import { buildMissingProxies } from './proxy'
import { scanMedia } from './scan'
import { messageOf } from './lib/words'

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

/* Where a camera that is not a drive turns up. A GoPro, and most cameras of the last few years,
   does not present its card as a disk at all: it speaks MTP, a protocol for handing files over one
   request at a time, and the desktop mounts it through gvfs in a folder of the user's own. Each
   camera is then a folder inside that one rather than a mount of its own, so it is found by looking
   in rather than by reading the list of mounts. */
const gvfsRoot = () => {
  const runtime = process.env.XDG_RUNTIME_DIR?.trim()
  const uid = typeof process.getuid === 'function' ? process.getuid() : null
  const base = runtime || (uid === null ? null : `/run/user/${uid}`)
  return base ? path.join(base, 'gvfs') : null
}

/* every drive letter this Windows machine has, which is where its cameras are */
const windowsDrives = () =>
  Array.from({ length: 26 }, (_, i) => `${String.fromCharCode(65 + i)}:${path.sep}`).filter(
    (drive) => fs.existsSync(drive)
  )

const cameraRoots = () => {
  const told = process.env.SKYDOCK_CAMERA_ROOTS
  if (told !== undefined)
    return told
      .split(path.delimiter)
      .map((root) => root.trim())
      .filter(Boolean)
  if (process.platform === 'win32') return windowsDrives()
  if (process.platform !== 'linux') return (DEFAULT_ROOTS[process.platform] ?? []).slice()
  const gvfs = gvfsRoot()
  return gvfs ? [...DEFAULT_ROOTS.linux, gvfs] : [...DEFAULT_ROOTS.linux]
}

const EVERY_MS = 2000

/* mountinfo writes a space in a path as \040, and the like */
const unescapeMount = (field: string) =>
  field.replace(/\\([0-7]{3})/g, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8))
  )

/* Everything this Linux machine has mounted, read off its own list, which says the moment one comes
   or goes. */
const mountsAt = (mountinfo = '/proc/self/mountinfo') => {
  let text: string
  try {
    text = fs.readFileSync(mountinfo, 'utf-8')
  } catch {
    return []
  }
  return text.split('\n').flatMap((line) => {
    const point = line.split(' ')[4]
    return point ? [unescapeMount(point)] : []
  })
}

/* what is mounted under the places looked at — a drive the desktop mounted for somebody */
const mountsUnder = (roots: string[], mountinfo?: string) =>
  mountsAt(mountinfo).filter((point) =>
    roots.some((root) => point.startsWith(`${root}${path.sep}`))
  )

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

/* The cameras plugged in: a DCIM folder at the top, and nothing else asked of them. On Windows the
   drive is the camera; on a Mac every drive is a folder in one place; on Linux a drive is a mount,
   and a camera speaking MTP is a folder inside the one mount gvfs makes.

   That last folder is only ever looked into when gvfs is mounted — a folder that is not a live
   mount is one nobody has to wait on, and this runs every couple of seconds. */
const mountedCameras = (mountinfo?: string) => {
  const roots = cameraRoots().map((root) => path.resolve(root))
  if (roots.length === 0) return []
  const live = new Set(mountsAt(mountinfo))
  const drives =
    process.platform === 'win32'
      ? roots
      : process.platform === 'darwin'
        ? foldersUnder(roots)
        : [
            ...mountsUnder(roots, mountinfo),
            /* a folder that is itself a mount holds cameras rather than being one: what a desktop
               makes for the cameras it has been asked to hand over */
            ...foldersUnder(roots.filter((root) => live.has(root)))
          ]
  return [...new Set(drives.flatMap(camerasAt))]
}

/* Where the DCIM is, which is the only thing that makes something a camera.

   A card shows it at the top of the drive. A camera that hands its files over rather than showing
   them offers one or more stores, each a folder, and keeps its pictures inside one of those —
   `HERO5 Black` holds `GoPro MTP Client Disk Volume`, and that holds DCIM. So anything without a
   DCIM of its own is looked into, one level, before it is passed over. */
const camerasAt = (point: string) => {
  if (fs.existsSync(path.join(point, 'DCIM'))) return [point]
  return foldersUnder([point]).filter((store) => fs.existsSync(path.join(store, 'DCIM')))
}

/* Whether a camera hands its files over rather than showing them: it is under the folder gvfs
   mounts, which is where a camera that has no drive to offer ends up. Worth saying, because it is
   the whole of why such a camera is slower to read than a card in a reader. */
const overMtp = (mount: string) => {
  if (isKioCamera(mount)) return true
  const gvfs = gvfsRoot()
  return gvfs !== null && path.resolve(mount).startsWith(`${path.resolve(gvfs)}${path.sep}`)
}

/* What a camera is called: the name of where it is mounted — or, on Windows, its drive letter,
   since a drive's root has no name of its own. */
const cameraName = (mount: string) =>
  isKioCamera(mount) ? kioCameraName(mount) : path.basename(mount) || mount.replace(/[\\/]+$/, '')

type Watch = {
  timer: ReturnType<typeof setInterval> | null
  /* the cameras already seen while they stay plugged in: one is copied once per plugging in */
  seen: Set<string>
  queue: string[]
  copying: boolean
  /* the camera being copied now, so one asked for again meanwhile is not copied twice over */
  current?: string
  /* the cameras last said to be plugged in, so a change is said once */
  said: string
  /* the cameras KDE last said it could reach, and whether it is being asked right now */
  kde: string[]
  asking: boolean
  /* the USB devices last seen, and until when KDE is worth asking after they last changed */
  usb?: string | null
  askUntil: number
  askedAt: number
  /* what each camera read through KDE was found to hold, as its copy went over it — and whether
     that copy has been over all of it — kept while it stays plugged in */
  seenOn: Record<string, { done: boolean; clips: SeenClip[] }>
  /* stops the camera being copied now, between one file and the next */
  stop?: AbortController
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
    said: '',
    kde: [],
    asking: false,
    askUntil: 0,
    askedAt: 0,
    seenOn: {}
  })

/* One camera at a time, in the order they were plugged in: two cards read at once are each read at
   half the speed, and their files would land interleaved. */
const copyNext = async (outputDir: string) => {
  const state = watch()
  const cameraDir = state.queue.shift()
  if (!cameraDir || state.copying) return
  state.copying = true
  state.current = cameraDir
  const stop = new AbortController()
  state.stop = stop
  const camera = cameraName(cameraDir)
  let last = { done: 0, total: 0, copied: 0, skipped: 0 }
  const onProgress = (progress: CopyProgress) => {
    last = progress
    publish({ kind: 'camera', camera, state: 'copying', ...progress })
  }
  /* each file on the board as it lands; gathered into jumps once the card is done */
  const arrived: string[] = []
  const onCopied = (copied: Copied) => {
    if (putOnBoard(outputDir, copied)) arrived.push(copied.id)
  }
  try {
    const result = isKioCamera(cameraDir)
      ? await copyThroughKde(cameraDir, outputDir, onProgress, onCopied, stop.signal)
      : await copyCamera({
          cameraDir: path.join(cameraDir, 'DCIM'),
          outputDir,
          onProgress,
          onCopied,
          stop: stop.signal
        })
    gatherArrivals(outputDir, arrived)
    /* Every file that came off is on the board already; the scan is only for one that could not be
       put there — no board yet, or one that could not be read. It reads the whole library, which is
       no price to pay for nothing. */
    if (result.copied > arrived.length) await scanMedia({ outputDir })
    if (result.copied > 0) void buildMissingProxies(outputDir).catch(() => undefined)
    publish({ kind: 'camera', camera, state: 'done', ...result })
  } catch (e) {
    const gone = e instanceof CameraGone
    const stopped = e instanceof CopyStopped
    gatherArrivals(outputDir, arrived)
    /* what did make it across is whole, and is on the board — scanned for, if it could not be put
       there as it landed */
    if (last.copied > arrived.length) await scanMedia({ outputDir }).catch(() => undefined)
    publish({
      kind: 'camera',
      camera,
      state: gone ? 'gone' : stopped ? 'stopped' : 'failed',
      ...last,
      reason: messageOf(e)
    })
  } finally {
    state.copying = false
    state.current = undefined
    state.stop = undefined
    if (state.queue.length > 0) void copyNext(outputDir)
  }
}

/* a camera KDE reaches, copied through KDE — asked for its reader again, since it may be gone */
const copyThroughKde = async (
  camera: string,
  outputDir: string,
  onProgress: (progress: CopyProgress) => void,
  onCopied: (copied: Copied) => void,
  stop: AbortSignal
) => {
  const reader = await kioReader()
  if (!reader) throw new CameraGone('KDE no longer reaches this camera.')
  const seen = { done: false, clips: [] as SeenClip[] }
  watch().seenOn[camera] = seen
  try {
    return await copyOverKio({
      camera,
      reader,
      outputDir,
      onProgress,
      onCopied,
      stop,
      onClip: (clip) => seen.clips.push(clip)
    })
  } finally {
    seen.done = true
  }
}

/* The USB devices plugged in, by the nodes the system makes for them: cheap to read, and different
   the moment anything is plugged in or taken out. Nothing when there is no such folder to read. */
const usbDevices = () => {
  const root = '/dev/bus/usb'
  try {
    return fs
      .readdirSync(root)
      .flatMap((bus) => fs.readdirSync(path.join(root, bus)).map((device) => `${bus}/${device}`))
      .sort()
      .join(' ')
  } catch {
    return null
  }
}

/* How long KDE is worth asking after the USB devices change: a camera takes a few seconds after it
   is plugged in before KDE can reach it. And how often, where the devices cannot be read at all. */
const ASK_FOR_MS = 15_000
const ASK_EVERY_MS = 30_000

/* KDE asked which cameras it reaches — only while that could have changed. Asking is a program run,
   several for a camera, and a machine with nothing plugged in is not asked every couple of seconds
   for ever: it is asked for a while after its USB devices change, and while nothing is being copied.
   Where the devices cannot be read it is asked now and then instead. A question KDE does not
   answer changes nothing. */
const askKde = async (find = camerasThroughKde) => {
  const state = watch()
  if (state.asking || state.copying || cameraRoots().length === 0) return
  const usb = usbDevices()
  const at = Date.now()
  if (usb !== state.usb) {
    state.usb = usb
    state.askUntil = at + ASK_FOR_MS
  }
  if (usb === null ? at - state.askedAt < ASK_EVERY_MS : at > state.askUntil) return
  state.asking = true
  state.askedAt = at
  try {
    state.kde = await find()
  } catch {
  } finally {
    state.asking = false
  }
}

/* One look at what is mounted, and at what KDE last said it reaches. A camera that has appeared is
   queued; one that has gone is forgotten, so plugging it in again copies what is new on it since. */
const lookForCameras = (outputDir: string, mountinfo?: string) => {
  const state = watch()
  void askKde()
  const now = new Set([...mountedCameras(mountinfo), ...state.kde])
  for (const camera of now)
    if (!state.seen.has(camera)) {
      state.seen.add(camera)
      state.queue.push(camera)
    }
  for (const camera of state.seen)
    if (!now.has(camera)) {
      state.seen.delete(camera)
      delete state.seenOn[camera]
    }
  const mounted = [...now].sort()
  if (mounted.join('\n') !== state.said) {
    state.said = mounted.join('\n')
    publish({
      kind: 'cameras',
      mounted: mounted.map((mount) => ({
        camera: cameraName(mount),
        mount,
        over: overMtp(mount) ? ('mtp' as const) : ('drive' as const)
      }))
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

/* A camera copied again on request — one, or every camera plugged in — without unplugging it, the
   same way plugging it in copies it: what is already here is passed over, so what comes across is
   only what is missing, whatever the reason it is. One already waiting or being copied is left to that
   copy. Says how many cameras were asked for. */
const copyAgain = (outputDir: string, camera?: string, mounts = mountedCameras()) => {
  const state = watch()
  const now = [...mounts, ...state.kde]
  const wanted = camera ? now.filter((c) => c === camera) : now
  for (const c of wanted) if (c !== state.current && !state.queue.includes(c)) state.queue.push(c)
  if (!state.copying && state.queue.length > 0) void copyNext(outputDir)
  return wanted.length
}

/* The copy stopped when asked, with every camera waiting its turn: what came across is whole and on
   the board, and the rest stays on the card for the next Rescan or plug-in (RULES, Copying a
   camera). Says whether there was anything to stop. */
const stopCameraCopy = () => {
  const state = watch()
  const running = state.copying || state.queue.length > 0
  state.queue = []
  state.stop?.abort()
  return running
}

/* whether a camera is being copied right now — nothing is taken off one while it is read */
const cameraCopying = () => watch().copying || watch().queue.length > 0

/* the cameras KDE last said it reaches, for the page that lists what is on each */
const camerasSeenThroughKde = () => watch().kde

/* what the copy found on a camera read through KDE, so far — nothing before its copy has begun */
const seenOnCamera = (camera: string) => watch().seenOn[camera] ?? { done: false, clips: [] }

export {
  askKde,
  stopCameraCopy,
  cameraCopying,
  cameraName,
  camerasSeenThroughKde,
  copyAgain,
  lookForCameras,
  mountedCameras,
  overMtp,
  seenOnCamera,
  watchCameras
}
