import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ProxyFact } from './boardAnswer'
import { outputKeyOf } from './fileStatus'
import { flushBoardChanges, loadManifestAsync, recordPass } from './manifest'
import type { Manifest, ManifestFile } from './types'
import { following, job } from './live'
import { ORIGINAL_MISSING } from './proxyWait'
import { lastComplaint, run, runWatched } from './tools'
import {
  ffmpegPath,
  ffprobePath,
  getManifestPath,
  getOutputDir,
  hasCommand,
  systemTool,
  isVideoFile,
  mapWithLimit
} from './utils'
import { pathExists } from './lib/fs'
import { untilQuiet } from './lib/quiet'
import { singleFlight } from './lib/singleFlight'
import { messageOf } from './lib/words'

const PROXY_WIDTH = 640

const PROXY_MIN_WIDTH = 1000

const CONTAINER_ARGS = [
  '-f',
  'mp4',
  '-g',
  '1',
  '-bf',
  '0',
  '-c:a',
  'aac',
  '-b:a',
  '128k',
  '-movflags',
  '+faststart'
]

type ProxyEncoder = 'nvenc' | 'vaapi' | 'cpu'

const DRI_DEVICE = () => process.env.SKYDOCK_DRI_DEVICE?.trim() || '/dev/dri/renderD128'

const ENCODER_ARGS: Record<ProxyEncoder, string[]> = {
  nvenc: ['-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'ull', '-rc', 'constqp', '-qp', '36'],
  vaapi: ['-c:v', 'h264_vaapi', '-qp', '30'],
  cpu: ['-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p']
}

const canEncode = async (program: string, args: string[], before: string[] = []) => {
  const trial = run(program, [
    '-hide_banner',
    '-loglevel',
    'error',
    ...before,
    '-f',
    'lavfi',
    '-i',
    'color=black:s=320x240:d=0.2',
    ...args,
    ...TRIAL_ARGS,
    '-f',
    'null',
    '-'
  ])
  const hung = new Promise<{ ok: false }>((resolve) =>
    setTimeout(() => resolve({ ok: false }), 20_000).unref()
  )
  return (await Promise.race([trial, hung])).ok
}

const vaapiCanScale = async (program: string) =>
  canEncode(
    program,
    [...ENCODER_ARGS.vaapi, '-vf', 'format=nv12,hwupload,scale_vaapi=w=160:h=-2'],
    ['-vaapi_device', DRI_DEVICE()]
  )

type Detected = { encoder: ProxyEncoder; cardScales: boolean; program: string }

const detectEncoder = async (): Promise<Detected> => {
  const asked = process.env.SKYDOCK_PROXY_ENCODER?.trim().toLowerCase()
  const carried = await ffmpegPath()
  if (asked === 'cpu' || asked === 'nvenc')
    return { encoder: asked, cardScales: true, program: carried }
  if (asked === 'vaapi')
    return { encoder: 'vaapi', cardScales: await vaapiCanScale(carried), program: carried }
  if (!(await hasCommand('ffmpeg'))) return { encoder: 'cpu', cardScales: false, program: carried }
  const vaapiReady = async (program: string) =>
    (await pathExists(DRI_DEVICE())) &&
    (await canEncode(
      program,
      [...ENCODER_ARGS.vaapi, '-vf', 'format=nv12,hwupload'],
      ['-vaapi_device', DRI_DEVICE()]
    ))
  const system = await systemTool('ffmpeg')
  for (const program of [carried, system].flatMap((one) => (one ? [one] : []))) {
    if (await canEncode(program, ENCODER_ARGS.nvenc))
      return { encoder: 'nvenc', cardScales: true, program }
    if (await vaapiReady(program))
      return { encoder: 'vaapi', cardScales: await vaapiCanScale(program), program }
  }
  return { encoder: 'cpu', cardScales: false, program: carried }
}

let detected: Promise<Detected> | null = null

const detection = () =>
  (detected ??= detectEncoder().then((found) => {
    console.log(`[Proxy] making small copies with ${found.encoder} through ${found.program}`)
    return found
  }))

const proxyEncoder = async () => (await detection()).encoder

const setProxyEncoder = (next: ProxyEncoder | null, cardScales = true) => {
  detected =
    next === null ? null : ffmpegPath().then((program) => ({ encoder: next, cardScales, program }))
}

const TRIAL_ARGS = CONTAINER_ARGS.filter((a, i) => a !== '-f' && CONTAINER_ARGS[i - 1] !== '-f')

const getProxyDir = (outputDir?: string) => path.join(outputDir || getOutputDir(), 'proxies')

const getCutProxyDir = (outputDir: string, groupId: string) =>
  path.join(getProxyDir(outputDir), 'cut', groupId)

const getProxyPath = (file: ManifestFile, outputDir?: string) => {
  const clip = file.copyOf ?? file.id
  return clip ? path.join(getProxyDir(outputDir), `${clip}.mp4`) : null
}

const videoShape = async (src: string) => {
  if (!(await hasCommand('ffprobe'))) return null
  const ran = await run(await ffprobePath(), [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height:stream_side_data=rotation',
    '-of',
    'default=nw=1',
    src
  ])
  if (!ran.ok) return null
  const out = ran.stdout
  const read = (key: string) => {
    const line = out.split(/\r?\n/).find((l) => l.startsWith(`${key}=`))
    const value = Number.parseInt(line?.slice(key.length + 1) ?? '', 10)
    return Number.isFinite(value) ? value : null
  }
  const width = read('width')
  const height = read('height')
  if (width === null || height === null) return null
  const turned = Math.abs(read('rotation') ?? 0) % 180 === 90
  return { width, height, turned }
}

const shownWidth = (shape: { width: number; height: number; turned: boolean }) =>
  shape.turned ? shape.height : shape.width

const scaleFilter = (shape: { turned: boolean } | null, hardware: boolean) => {
  if (!hardware) return `scale=${PROXY_WIDTH}:-2`
  return shape?.turned
    ? `scale_vaapi=w=-2:h=${PROXY_WIDTH}:format=nv12`
    : `scale_vaapi=w=${PROXY_WIDTH}:h=-2:format=nv12`
}

const buildWith = async (
  program: string,
  pick: ProxyEncoder,
  cardScales: boolean,
  src: string,
  dest: string,
  shape: Awaited<ReturnType<typeof videoShape>>,
  onPercent?: (percent: number) => void
) => {
  const vaapiHybrid = pick === 'vaapi' && !cardScales
  const decode =
    pick === 'nvenc'
      ? ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda']
      : vaapiHybrid
        ? ['-hwaccel', 'vaapi', '-vaapi_device', DRI_DEVICE()]
        : pick === 'vaapi'
          ? ['-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi', '-vaapi_device', DRI_DEVICE()]
          : []
  const filter =
    pick === 'nvenc'
      ? shape?.turned
        ? `scale_cuda=w=-2:h=${PROXY_WIDTH}:format=nv12`
        : `scale_cuda=w=${PROXY_WIDTH}:h=-2:format=nv12`
      : vaapiHybrid
        ? `${scaleFilter(shape, false)},format=nv12,hwupload`
        : scaleFilter(shape, pick === 'vaapi')
  const partial = `${dest}.${process.pid}.part`
  await mkdir(path.dirname(dest), { recursive: true })
  const cap =
    pick === 'cpu' ? ['-threads', String(Math.max(1, Math.floor(os.cpus().length / 2)))] : []
  const ran = await runWatched(
    program,
    [
      '-y',
      ...decode,
      '-i',
      src,
      '-vf',
      filter,
      ...ENCODER_ARGS[pick],
      ...cap,
      ...CONTAINER_ARGS,
      partial
    ],
    onPercent,
    undefined,
    true
  )
  if (ran.ok) {
    try {
      await rename(partial, dest)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, reason: messageOf(e) }
    }
  }
  await rm(partial, { force: true })
  return { ok: false as const, reason: lastComplaint(ran.stderr) }
}

const buildProxy = async (
  src: string,
  dest: string,
  shape: Awaited<ReturnType<typeof videoShape>> = null,
  onPercent?: (percent: number) => void
) => {
  if (!(await hasCommand('ffmpeg')))
    return { ok: false as const, reason: 'ffmpeg is not installed' }
  const { encoder, cardScales, program } = await detection()
  const first = await buildWith(program, encoder, cardScales, src, dest, shape, onPercent)
  if (first.ok || encoder === 'cpu') return first
  const again = await buildWith(await ffmpegPath(), 'cpu', false, src, dest, shape, onPercent)
  return again.ok ? again : first
}

const cropProxy = async (
  src: string,
  dest: string,
  cropStart: number | null | undefined,
  cropEnd: number | null | undefined
) => {
  if (!(await hasCommand('ffmpeg'))) return false
  await mkdir(path.dirname(dest), { recursive: true })
  const ran = await run(await ffmpegPath(), [
    '-y',
    ...(cropStart != null ? ['-ss', String(cropStart)] : []),
    '-i',
    src,
    ...(cropEnd != null ? ['-t', (cropEnd - (cropStart ?? 0)).toFixed(6)] : []),
    '-c',
    'copy',
    '-avoid_negative_ts',
    'make_zero',
    dest
  ])
  return ran.ok
}

const needsProxy = (file: ManifestFile) => isVideoFile(file.path) && !!file.id && !file.freed

type ProxyReport = { built: number; skipped: number; failed: string[]; reason?: string }

const ensureProxies = async (
  manifest: Manifest,
  outputDir?: string,
  onProgress?: (done: number, total: number, filename: string) => void,
  onBuilt?: () => void
) => {
  const report: ProxyReport = { built: 0, skipped: 0, failed: [] }
  const candidates = manifest.files.filter(needsProxy)
  if (candidates.length === 0) return report
  if (!(await hasCommand('ffmpeg'))) {
    for (const file of candidates)
      if (!(await pathExists(getProxyPath(file, outputDir) ?? '')) && file.proxy !== file.path)
        proxyFailures().set(file.path, 'ffmpeg is not installed, so no small copy can be made')
    return report
  }

  const missing = await mapWithLimit(candidates, 16, async (file) => {
    const proxyPath = getProxyPath(file, outputDir)
    return proxyPath !== null && !(await pathExists(proxyPath))
  })
  const toMake = candidates.filter((_, index) => missing[index])
  const making = toMake.length > 0 ? job({ type: 'proxy', label: '', total: toMake.length }) : null
  making?.rows(toMake.map((file) => ({ key: outputKeyOf(file), name: file.filename, size: 0 })))
  try {
    for (const [index, file] of candidates.entries()) {
      onProgress?.(index, candidates.length, file.filename)
      const proxyPath = getProxyPath(file, outputDir)
      if (!proxyPath) continue
      if (await pathExists(proxyPath)) {
        if (file.proxy !== proxyPath) {
          file.proxy = proxyPath
          onBuilt?.()
        }
        report.skipped++
        continue
      }
      if (!(await pathExists(file.path))) {
        proxyFailures().set(file.path, ORIGINAL_MISSING)
        making?.row({ key: outputKeyOf(file), at: 'failed', note: ORIGINAL_MISSING })
        making?.step()
        continue
      }
      await untilQuiet()
      const shape = await videoShape(file.path)
      if (shape !== null && shownWidth(shape) <= PROXY_MIN_WIDTH) {
        if (file.proxy !== file.path) {
          file.proxy = file.path
          onBuilt?.()
        }
        report.skipped++
        making?.row({ key: outputKeyOf(file), at: 'skipped' })
        making?.step()
        following('proxy', file.id).done(true, {
          proxy: { path: file.path, fact: { state: 'own', play: file.path } }
        })
        continue
      }
      const live = following('proxy', file.id)
      making?.row({ key: outputKeyOf(file), at: 'now', part: 0 })
      const built = await buildProxy(file.path, proxyPath, shape, (percent) => {
        live.at(percent)
        making?.row({ key: outputKeyOf(file), at: 'now', part: percent / 100 })
      })
      making?.row(
        built.ok
          ? { key: outputKeyOf(file), at: 'done' }
          : { key: outputKeyOf(file), at: 'failed', note: built.reason }
      )
      making?.step()
      if (built.ok) {
        proxyFailures().delete(file.path)
        file.proxy = proxyPath
        report.built++
        onBuilt?.()
        live.done(true, { proxy: { path: file.path, fact: { state: 'ready', play: proxyPath } } })
      } else {
        delete file.proxy
        proxyFailures().set(file.path, built.reason)
        report.failed.push(file.filename)
        report.reason ??= built.reason
        live.done(false, {
          proxy: {
            path: file.path,
            fact: { state: 'none', play: file.path, reason: built.reason }
          }
        })
      }
    }
    onProgress?.(candidates.length, candidates.length, '')
    making?.finish()
    return report
  } catch (e) {
    making?.fail(e instanceof Error ? e.message : String(e))
    throw e
  }
}

const recordProxies = (manifestPath: string, pass: Manifest) =>
  recordPass(
    manifestPath,
    pass,
    async (file, done) => {
      if (done.proxy) file.proxy = done.proxy
      else if (file.proxy && !(await pathExists(file.proxy))) delete file.proxy
    },
    'proxies'
  )

const buildMissingProxies = singleFlight(async (outputDir?: string) => {
  const dir = outputDir || getOutputDir()
  const manifestPath = getManifestPath(dir)
  const report: ProxyReport = { built: 0, skipped: 0, failed: [] }
  for (;;) {
    const manifest = await loadManifestAsync(manifestPath)
    if (!manifest) break
    const pass = await ensureProxies(manifest, dir, undefined, () =>
      recordProxies(manifestPath, manifest)
    )
    await flushBoardChanges(manifestPath)
    report.built += pass.built
    report.skipped = pass.skipped
    report.failed = [...new Set([...report.failed, ...pass.failed])]
    report.reason ??= pass.reason
    if (pass.built === 0) break
  }
  if (report.built > 0) {
    const { encoder, cardScales } = await detection()
    console.log(
      `[Proxy] Built ${report.built} proxy file(s) in ${dir}/proxies using ${encoder}${
        encoder === 'vaapi' && !cardScales ? ' (resized on the processor)' : ''
      }`
    )
  }
  if (report.failed.length > 0)
    console.warn(
      `[Proxy] Could not build ${report.failed.length} of ${report.failed.length + report.built + report.skipped}: ${report.reason}\n[Proxy] ${report.failed.join(', ')}`
    )
  return report
})

declare global {
  var skydockProxiesResumed: boolean | undefined
}

const isBeingWritten = (name: string) => {
  const pid = Number(/\.(\d+)\.part$/.exec(name)?.[1])
  if (!pid || pid === process.pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const clearHalfWritten = async (dir: string) => {
  const names = await readdir(dir).catch(() => [])
  await Promise.all(
    names
      .filter((name) => name.endsWith('.part') && !isBeingWritten(name))
      .map((name) => rm(path.join(dir, name), { force: true }))
  )
}

const resumeProxies = (outputDir?: string) => {
  const first = !globalThis.skydockProxiesResumed
  globalThis.skydockProxiesResumed = true
  void (async () => {
    if (first) await clearHalfWritten(getProxyDir(outputDir))
    await buildMissingProxies(outputDir)
  })().catch((e: unknown) => {
    console.error('[Proxy] resuming failed:', messageOf(e))
  })
}

declare global {
  var skydockProxyFailures: Map<string, string> | undefined
}

const proxyFailures = () => (globalThis.skydockProxyFailures ??= new Map())

const statProxies = async (manifest: Manifest, outputDir?: string) => {
  const files = manifest.files.filter(needsProxy)
  const facts = await mapWithLimit(files, 16, async (file): Promise<ProxyFact> => {
    const proxyPath = getProxyPath(file, outputDir)
    if (file.proxy === file.path) return { state: 'own', play: file.path }
    if (proxyPath && (await pathExists(proxyPath))) return { state: 'ready', play: proxyPath }
    const reason =
      proxyFailures().get(file.path) ??
      ((await pathExists(file.path)) ? undefined : ORIGINAL_MISSING)
    return { state: 'none', play: file.path, ...(reason ? { reason } : {}) }
  })
  const answer: Record<string, ProxyFact> = {}
  for (const [index, file] of files.entries()) answer[file.path] = facts[index]
  return answer
}

export {
  ORIGINAL_MISSING,
  buildMissingProxies,
  resumeProxies,
  cropProxy,
  DRI_DEVICE,
  proxyEncoder,
  setProxyEncoder,
  videoShape,
  ensureProxies,
  getCutProxyDir,
  getProxyPath,
  needsProxy,
  statProxies
}
export type { ProxyEncoder }
