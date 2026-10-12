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
import {
  forgetCamera,
  knownCameras,
  rememberCamera,
  setCameraAuto,
  touchCamera
} from './knownCameras'
import { scanMedia } from './scan'
import { messageOf } from './lib/words'
import { getTrashDir } from './utils'

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

const CAMERA_ON_GVFS = /^(mtp|gphoto2):/i

const isGvfsRoot = (root: string) => {
  const gvfs = gvfsRoot()
  return gvfs !== null && path.resolve(root) === path.resolve(gvfs)
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
      if (isGvfsRoot(root))
        return fs
          .readdirSync(root)
          .filter((name) => CAMERA_ON_GVFS.test(name))
          .map((name) => path.join(root, name))
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

const diskIds = () => {
  const folder = process.env.SKYDOCK_DISK_IDS ?? '/dev/disk/by-uuid'
  try {
    return new Map(
      fs.readdirSync(folder).flatMap((id) => {
        try {
          return [[fs.realpathSync(path.join(folder, id)), id] as const]
        } catch {
          return []
        }
      })
    )
  } catch {
    return new Map<string, string>()
  }
}

const mountOf = (mount: string, mountinfo = '/proc/self/mountinfo') => {
  let text: string
  try {
    text = fs.readFileSync(mountinfo, 'utf-8')
  } catch {
    return null
  }
  const here = path.resolve(mount)
  let best: { point: string; source: string } | null = null
  for (const line of text.split('\n')) {
    const [before, after] = line.split(' - ')
    const point = before?.split(' ')[4]
    const source = after?.split(' ')[1]
    if (!point || !source) continue
    const place = path.resolve(unescapeMount(point))
    if (
      (here === place || here.startsWith(`${place}${path.sep}`)) &&
      (!best || place.length > best.point.length)
    )
      best = { point: place, source }
  }
  return best
}

const deviceOf = (mount: string, mountinfo?: string) => mountOf(mount, mountinfo)?.source ?? null

const cameraKey = (mount: string, mountinfo?: string) => {
  if (!isKioCamera(mount) && process.platform === 'linux') {
    const device = deviceOf(mount, mountinfo)
    let real: string | null = null
    try {
      real = device ? fs.realpathSync(device) : null
    } catch {}
    const id = (real && diskIds().get(real)) || (device && diskIds().get(device)) || null
    if (id) return `id:${id}`
  }
  return `name:${cameraName(mount)}`
}

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
  outputDir?: string
  keys: Record<string, string>
  fresh: Record<string, number | null>
  checking: Set<string>
  prompts: string[]
  only: Record<string, Set<string>>
  saidKnown: string
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
    seenOn: {},
    keys: {},
    fresh: {},
    checking: new Set(),
    prompts: [],
    only: {},
    saidKnown: ''
  })

const copyNext = async (outputDir: string) => {
  const state = watch()
  const cameraDir = state.queue.shift()
  if (!cameraDir || state.copying) return
  const only = state.only[cameraDir]
  delete state.only[cameraDir]
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
      ? await copyThroughKde(cameraDir, outputDir, onProgress, onCopied, stop.signal, only)
      : await copyCamera({
          cameraDir: path.join(cameraDir, 'DCIM'),
          outputDir,
          onProgress,
          onCopied,
          stop: stop.signal,
          only
        })
    const onBoard = await gatherArrivals(outputDir, arrived)
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
    const onBoard = await gatherArrivals(outputDir, arrived)
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
    if (
      state.seen.has(cameraDir) &&
      !knownCameras().some((c) => c.auto && c.key === state.keys[cameraDir])
    ) {
      delete state.fresh[cameraDir]
      void check(cameraDir)
    }
    if (state.queue.length > 0) void copyNext(outputDir)
  }
}

const copyThroughKde = async (
  camera: string,
  outputDir: string,
  onProgress: (progress: CopyProgress) => void,
  onCopied: (copied: Copied) => void,
  stop: AbortSignal,
  only?: Set<string>
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
      fetch: only ? (clip) => only.has(clip.url) : undefined,
      onClip: (clip) => seen.clips.push(clip)
    })
  } finally {
    seen.done = true
  }
}

const lookThroughKde = async (camera: string, outputDir: string) => {
  const reader = await kioReader()
  if (!reader) return
  const seen = { done: false, clips: [] as SeenClip[] }
  watch().seenOn[camera] = seen
  try {
    await copyOverKio({
      camera,
      reader,
      outputDir,
      fetch: () => false,
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

const isOnCamera = (file: string, mounts = mountedCameras()) => {
  try {
    const real = fs.realpathSync(file)
    return mounts.some((mount) => {
      if (isKioCamera(mount)) return false
      const dcim = fs.realpathSync(path.join(mount, 'DCIM'))
      return real.startsWith(`${dcim}${path.sep}`)
    })
  } catch {
    return false
  }
}

const keyOfMount = (mount: string) => watch().keys[mount] ?? cameraKey(mount)

const describe = (mount: string, known: ReturnType<typeof knownCameras>) => {
  const state = watch()
  const key = state.keys[mount] ?? cameraKey(mount)
  const met = known.find((c) => c.key === key)
  return {
    camera: cameraName(mount),
    mount,
    over: overMtp(mount) ? ('mtp' as const) : ('drive' as const),
    key,
    known: Boolean(met),
    auto: met?.auto ?? false,
    fresh: state.fresh[mount] ?? null
  }
}

const sayCameras = (force = false) => {
  const state = watch()
  const known = knownCameras()
  const mounted = [...state.seen].sort().map((mount) => describe(mount, known))
  const prompts = state.prompts.filter((mount) => state.seen.has(mount))
  const said = JSON.stringify({ mounted, known, prompts })
  if (!force && said === state.saidKnown) return
  state.saidKnown = said
  state.said = [...state.seen].sort().join('\n')
  publish({
    kind: 'cameras',
    mounted,
    known: known.map(({ key, name, auto, lastSeen }) => ({ key, name, auto, lastSeen })),
    prompts
  })
}

const countNew = async (mount: string, outputDir: string) => {
  const { listCamera, listCameraThroughKde } = await import('./cameraFiles')
  if (isKioCamera(mount)) {
    await lookThroughKde(mount, outputDir)
    const seen = await listCameraThroughKde(mount, outputDir)
    return seen.files.filter((f) => f.state === 'missing').length
  }
  const listed = await listCamera(mount, outputDir, getTrashDir())
  return listed.files.filter((f) => f.state === 'missing').length
}

const check = async (mount: string) => {
  const state = watch()
  const outputDir = state.outputDir
  if (!outputDir || state.checking.has(mount)) return
  state.checking.add(mount)
  try {
    state.fresh[mount] = await countNew(mount, outputDir)
  } catch {
    state.fresh[mount] = null
  } finally {
    state.checking.delete(mount)
    if (state.seen.has(mount)) sayCameras()
  }
}

const meet = (mount: string, mountinfo?: string) => {
  const state = watch()
  const key = cameraKey(mount, mountinfo)
  state.keys[mount] = key
  const met = knownCameras().find((c) => c.key === key)
  if (!met) {
    state.prompts.push(mount)
    void check(mount)
    return
  }
  touchCamera(key)
  if (met.auto) state.queue.push(mount)
  else void check(mount)
}

const lookForCameras = (outputDir: string, mountinfo?: string) => {
  const state = watch()
  state.outputDir = outputDir
  void askKde()
  const now = new Set([...mountedCameras(mountinfo), ...state.kde])
  for (const camera of now)
    if (!state.seen.has(camera)) {
      state.seen.add(camera)
      meet(camera, mountinfo)
    }
  for (const camera of state.seen)
    if (!now.has(camera)) {
      const key = state.keys[camera]
      if (key) touchCamera(key)
      state.seen.delete(camera)
      delete state.seenOn[camera]
      delete state.keys[camera]
      delete state.fresh[camera]
      delete state.only[camera]
      state.prompts = state.prompts.filter((mount) => mount !== camera)
    }
  sayCameras()
  if (!state.copying && state.queue.length > 0) void copyNext(outputDir)
}

const answerCamera = (
  outputDir: string,
  answer:
    | { remember: string; auto: boolean; copy: boolean }
    | { forget: string }
    | { auto: { key: string; on: boolean } }
) => {
  const state = watch()
  const mountOf = (key: string) => [...state.seen].find((mount) => state.keys[mount] === key)
  if ('remember' in answer) {
    const mount = mountOf(answer.remember)
    const name =
      knownCameras().find((c) => c.key === answer.remember)?.name ??
      (mount ? cameraName(mount) : answer.remember)
    rememberCamera({ key: answer.remember, name, auto: answer.auto })
    state.prompts = state.prompts.filter((m) => m !== mount)
    if (mount && answer.copy) copyAgain(outputDir, mount, [mount])
  } else if ('forget' in answer) {
    forgetCamera(answer.forget)
  } else setCameraAuto(answer.auto.key, answer.auto.on)
  sayCameras(true)
}

const watchCameras = (outputDir: string) => {
  const state = watch()
  if (state.timer) clearInterval(state.timer)
  state.timer = null
  if (cameraRoots().length === 0) return
  lookForCameras(outputDir)
  state.timer = setInterval(() => lookForCameras(outputDir), EVERY_MS)
}

const copyAgain = (
  outputDir: string,
  camera?: string,
  mounts = mountedCameras(),
  only?: Set<string>
) => {
  const state = watch()
  const now = [...mounts, ...state.kde]
  const wanted = camera
    ? now.filter((c) => c === camera)
    : now.filter((c) => !state.prompts.includes(c))
  for (const c of wanted) {
    if (only) state.only[c] = only
    if (c !== state.current && !state.queue.includes(c)) state.queue.push(c)
  }
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
  answerCamera,
  askKde,
  cameraKey,
  stopCameraCopy,
  cameraCopying,
  cameraName,
  camerasSeenThroughKde,
  copyAgain,
  deviceOf,
  mountOf,
  isOnCamera,
  keyOfMount,
  lookForCameras,
  mountedCameras,
  overMtp,
  seenOnCamera,
  watchCameras
}
