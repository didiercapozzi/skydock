import * as fs from 'node:fs'
import * as path from 'node:path'
import { CameraGone, CopyStopped, copyCamera } from './copy'
import type { Copied, CopyProgress } from './copy'
import { gatherArrivals, putOnBoard } from './arrivals'
import { kioReader } from './kio'
import { camerasThroughKde, copyOverKio, isKioCamera, kioCameraName } from './kioCamera'
import type { SeenClip } from './kioCamera'
import { job, publish } from './live'
import { catchUp } from './catchUp'
import { scanMedia } from './scan'
import { messageOf } from './lib/words'

const DEFAULT_ROOTS: Record<string, string[]> = {
  darwin: ['/Volumes'],
  linux: ['/mnt/osmo', '/media', '/run/media']
}

const gvfsRoot = () => {
  const runtime = process.env.XDG_RUNTIME_DIR?.trim()
  const uid = typeof process.getuid === 'function' ? process.getuid() : null
  const base = runtime || (uid === null ? null : `/run/user/${uid}`)
  return base ? path.join(base, 'gvfs') : null
}

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

const unescapeMount = (field: string) =>
  field.replace(/\\([0-7]{3})/g, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8))
  )

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

const mountsUnder = (roots: string[], mountinfo?: string) =>
  mountsAt(mountinfo).filter((point) =>
    roots.some((root) => point.startsWith(`${root}${path.sep}`))
  )

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
            ...foldersUnder(roots.filter((root) => live.has(root)))
          ]
  return [...new Set(drives.flatMap(camerasAt))]
}

const camerasAt = (point: string) => {
  if (fs.existsSync(path.join(point, 'DCIM'))) return [point]
  return foldersUnder([point]).filter((store) => fs.existsSync(path.join(store, 'DCIM')))
}

const overMtp = (mount: string) => {
  if (isKioCamera(mount)) return true
  const gvfs = gvfsRoot()
  return gvfs !== null && path.resolve(mount).startsWith(`${path.resolve(gvfs)}${path.sep}`)
}

const cameraName = (mount: string) =>
  isKioCamera(mount) ? kioCameraName(mount) : path.basename(mount) || mount.replace(/[\\/]+$/, '')

type Watch = {
  timer: ReturnType<typeof setInterval> | null
  seen: Set<string>
  queue: string[]
  copying: boolean
  current?: string
  said: string
  kde: string[]
  asking: boolean
  usb?: string | null
  askUntil: number
  askedAt: number
  seenOn: Record<string, { done: boolean; clips: SeenClip[] }>
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

const copyNext = async (outputDir: string) => {
  const state = watch()
  const cameraDir = state.queue.shift()
  if (!cameraDir || state.copying) return
  state.copying = true
  state.current = cameraDir
  const stop = new AbortController()
  state.stop = stop
  const camera = cameraName(cameraDir)
  let last: CopyProgress = { done: 0, total: 0, copied: 0, skipped: 0 }
  const copying = job({
    type: 'camera-copy',
    label: camera,
    total: 0,
    record: { kind: 'camera', outputDir, quietIfIdle: true, passOver: true }
  })
  let listed = false
  const onProgress = (progress: CopyProgress) => {
    last = progress
    copying.expect(progress.total)
    copying.at(progress.done)
    if (progress.files && !listed) {
      listed = true
      copying.rows(
        progress.files.map((file, at) => ({ key: String(at), name: file.name, size: file.size }))
      )
    }
    if (progress.last)
      copying.row({
        key: String(progress.done - 1),
        at: progress.last === 'copied' ? 'done' : progress.last === 'skipped' ? 'skipped' : 'failed'
      })
    if (progress.done < progress.total)
      copying.row({ key: String(progress.done), at: 'now', part: progress.part ?? 0 })
  }
  const arrived: string[] = []
  const onCopied = (copied: Copied) => {
    putOnBoard(outputDir, copied)
    arrived.push(copied.id)
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
    const onBoard = gatherArrivals(outputDir, arrived)
    if (result.copied > onBoard) await scanMedia({ outputDir })
    if (result.copied > 0) void catchUp(outputDir)
    last = { ...last, ...result }
    for (const name of last.unreadable ?? [])
      copying.row({ key: `unreadable:${name}`, name, size: 0, at: 'failed' })
    copying.finish({
      outcome: {
        state: 'done',
        copied: result.copied,
        skipped: result.skipped,
        ...(last.unreadable?.length ? { unreadable: last.unreadable } : {})
      }
    })
  } catch (e) {
    const gone = e instanceof CameraGone
    const stopped = e instanceof CopyStopped
    const onBoard = gatherArrivals(outputDir, arrived)
    if (last.copied > onBoard) await scanMedia({ outputDir }).catch(() => undefined)
    const outcome = {
      state: gone ? ('gone' as const) : stopped ? ('stopped' as const) : ('failed' as const),
      copied: last.copied,
      skipped: last.skipped,
      ...(last.unreadable?.length ? { unreadable: last.unreadable } : {})
    }
    if (outcome.state === 'failed') copying.fail(messageOf(e), outcome)
    else copying.finish({ outcome, reason: messageOf(e) })
  } finally {
    state.copying = false
    state.current = undefined
    state.stop = undefined
    if (state.queue.length > 0) void copyNext(outputDir)
  }
}

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

const ASK_FOR_MS = 15_000
const ASK_EVERY_MS = 30_000

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

const watchCameras = (outputDir: string) => {
  const state = watch()
  if (state.timer) clearInterval(state.timer)
  state.timer = null
  if (cameraRoots().length === 0) return
  lookForCameras(outputDir)
  state.timer = setInterval(() => lookForCameras(outputDir), EVERY_MS)
}

const copyAgain = (outputDir: string, camera?: string, mounts = mountedCameras()) => {
  const state = watch()
  const now = [...mounts, ...state.kde]
  const wanted = camera ? now.filter((c) => c === camera) : now
  for (const c of wanted) if (c !== state.current && !state.queue.includes(c)) state.queue.push(c)
  if (!state.copying && state.queue.length > 0) void copyNext(outputDir)
  return wanted.length
}

const stopCameraCopy = () => {
  const state = watch()
  const running = state.copying || state.queue.length > 0
  state.queue = []
  state.stop?.abort()
  return running
}

const cameraCopying = () => watch().copying || watch().queue.length > 0

const camerasSeenThroughKde = () => watch().kde

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
