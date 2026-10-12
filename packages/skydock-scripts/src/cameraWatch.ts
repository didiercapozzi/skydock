import { readdir, readFile, realpath } from 'node:fs/promises'
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
import { pathExists } from './lib/fs'
import { messageOf } from './lib/words'
import { getTrashDir, mapWithLimit } from './utils'

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

const windowsDrives = async () => {
  const drives = Array.from({ length: 26 }, (_, i) => `${String.fromCharCode(65 + i)}:${path.sep}`)
  const present = await Promise.all(drives.map(pathExists))
  return drives.filter((_, i) => present[i])
}

const cameraRoots = async () => {
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
const PARALLEL = 16

const unescapeMount = (field: string) =>
  field.replace(/\\([0-7]{3})/g, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8))
  )

const readMountinfo = (mountinfo = '/proc/self/mountinfo') =>
  readFile(mountinfo, 'utf-8').catch(() => '')

const mountsAt = async (mountinfo?: string) =>
  (await readMountinfo(mountinfo)).split('\n').flatMap((line) => {
    const point = line.split(' ')[4]
    return point ? [unescapeMount(point)] : []
  })

const foldersUnder = async (roots: string[]) =>
  (
    await Promise.all(
      roots.map(async (root) => {
        try {
          if (isGvfsRoot(root))
            return (await readdir(root))
              .filter((name) => CAMERA_ON_GVFS.test(name))
              .map((name) => path.join(root, name))
          return (await readdir(root, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
            .map((entry) => path.join(root, entry.name))
        } catch {
          return []
        }
      })
    )
  ).flat()

const camerasAt = async (point: string) => {
  if (await pathExists(path.join(point, 'DCIM'))) return [point]
  const stores = await foldersUnder([point])
  const holding = await mapWithLimit(stores, PARALLEL, (store) =>
    pathExists(path.join(store, 'DCIM'))
  )
  return stores.filter((_, i) => holding[i])
}

const mountedCameras = async (mountinfo?: string) => {
  const roots = (await cameraRoots()).map((root) => path.resolve(root))
  if (roots.length === 0) return []
  const points = await mountsAt(mountinfo)
  const live = new Set(points)
  const drives =
    process.platform === 'win32'
      ? roots
      : process.platform === 'darwin'
        ? await foldersUnder(roots)
        : [
            ...points.filter((point) =>
              roots.some((root) => point.startsWith(`${root}${path.sep}`))
            ),
            ...(await foldersUnder(roots.filter((root) => live.has(root))))
          ]
  return [...new Set((await mapWithLimit(drives, PARALLEL, (drive) => camerasAt(drive))).flat())]
}

const overMtp = (mount: string) => {
  if (isKioCamera(mount)) return true
  const gvfs = gvfsRoot()
  return gvfs !== null && path.resolve(mount).startsWith(`${path.resolve(gvfs)}${path.sep}`)
}

const cameraName = (mount: string) =>
  isKioCamera(mount) ? kioCameraName(mount) : path.basename(mount) || mount.replace(/[\\/]+$/, '')

const diskIds = async () => {
  const folder = process.env.SKYDOCK_DISK_IDS ?? '/dev/disk/by-uuid'
  try {
    const ids = await readdir(folder)
    const found = await mapWithLimit(ids, PARALLEL, (id) =>
      realpath(path.join(folder, id)).then(
        (real) => [real, id] as const,
        () => null
      )
    )
    return new Map(found.filter((entry) => entry !== null))
  } catch {
    return new Map<string, string>()
  }
}

const mountOf = async (mount: string, mountinfo?: string) => {
  const text = await readMountinfo(mountinfo)
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

const deviceOf = async (mount: string, mountinfo?: string) =>
  (await mountOf(mount, mountinfo))?.source ?? null

const cameraKey = async (mount: string, mountinfo?: string) => {
  if (!isKioCamera(mount) && process.platform === 'linux') {
    const device = await deviceOf(mount, mountinfo)
    const real = device ? await realpath(device).catch(() => null) : null
    const ids = await diskIds()
    const id = (real && ids.get(real)) || (device && ids.get(device)) || null
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
  looking: boolean
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
    looking: false,
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
  const onCopied = async (copied: Copied) => {
    await putOnBoard(outputDir, copied)
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

const usbDevices = async () => {
  const root = '/dev/bus/usb'
  try {
    const devices = await Promise.all(
      (await readdir(root)).map(async (bus) =>
        (await readdir(path.join(root, bus))).map((device) => `${bus}/${device}`)
      )
    )
    return devices.flat().sort().join(' ')
  } catch {
    return null
  }
}

const ASK_FOR_MS = 15_000
const ASK_EVERY_MS = 30_000

const askKde = async (find = camerasThroughKde) => {
  const state = watch()
  if (state.asking || state.copying) return
  state.asking = true
  try {
    if ((await cameraRoots()).length === 0) return
    const usb = await usbDevices()
    const at = Date.now()
    if (usb !== state.usb) {
      state.usb = usb
      state.askUntil = at + ASK_FOR_MS
    }
    if (usb === null ? at - state.askedAt < ASK_EVERY_MS : at > state.askUntil) return
    state.askedAt = at
    state.kde = await find()
  } catch {
  } finally {
    state.asking = false
  }
}

const isOnCamera = async (file: string, mounts?: string[]) => {
  try {
    const real = await realpath(file)
    for (const mount of mounts ?? (await mountedCameras())) {
      if (isKioCamera(mount)) continue
      const dcim = await realpath(path.join(mount, 'DCIM'))
      if (real.startsWith(`${dcim}${path.sep}`)) return true
    }
    return false
  } catch {
    return false
  }
}

const keyOfMount = async (mount: string) => watch().keys[mount] ?? cameraKey(mount)

const describe = async (mount: string, known: ReturnType<typeof knownCameras>) => {
  const state = watch()
  const key = await keyOfMount(mount)
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

const sayCameras = async (force = false) => {
  const state = watch()
  const known = knownCameras()
  const mounted = await Promise.all([...state.seen].sort().map((mount) => describe(mount, known)))
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
    if (state.seen.has(mount)) void sayCameras()
  }
}

const meet = async (mount: string, mountinfo?: string) => {
  const state = watch()
  const key = await cameraKey(mount, mountinfo)
  state.keys[mount] = key
  const met = knownCameras().find((c) => c.key === key)
  if (!met) {
    state.prompts.push(mount)
    void check(mount)
    return
  }
  await touchCamera(key)
  if (met.auto) state.queue.push(mount)
  else void check(mount)
}

const lookForCameras = async (outputDir: string, mountinfo?: string) => {
  const state = watch()
  if (state.looking) return
  state.looking = true
  try {
    state.outputDir = outputDir
    void askKde()
    const now = new Set([...(await mountedCameras(mountinfo)), ...state.kde])
    for (const camera of now)
      if (!state.seen.has(camera)) {
        state.seen.add(camera)
        await meet(camera, mountinfo)
      }
    for (const camera of state.seen)
      if (!now.has(camera)) {
        const key = state.keys[camera]
        if (key) await touchCamera(key)
        state.seen.delete(camera)
        delete state.seenOn[camera]
        delete state.keys[camera]
        delete state.fresh[camera]
        delete state.only[camera]
        state.prompts = state.prompts.filter((mount) => mount !== camera)
      }
    await sayCameras()
    if (!state.copying && state.queue.length > 0) void copyNext(outputDir)
  } finally {
    state.looking = false
  }
}

const answerCamera = async (
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
    await rememberCamera({ key: answer.remember, name, auto: answer.auto })
    state.prompts = state.prompts.filter((m) => m !== mount)
    if (mount && answer.copy) void copyAgain(outputDir, mount, [mount])
  } else if ('forget' in answer) {
    await forgetCamera(answer.forget)
  } else await setCameraAuto(answer.auto.key, answer.auto.on)
  await sayCameras(true)
}

const watchCameras = async (outputDir: string) => {
  const state = watch()
  const roots = await cameraRoots()
  if (state.timer) clearInterval(state.timer)
  state.timer = null
  if (roots.length === 0) return
  state.timer = setInterval(() => void lookForCameras(outputDir), EVERY_MS)
  await lookForCameras(outputDir)
}

const copyAgain = async (
  outputDir: string,
  camera?: string,
  mounts?: string[],
  only?: Set<string>
) => {
  const state = watch()
  const now = [...(mounts ?? (await mountedCameras())), ...state.kde]
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
