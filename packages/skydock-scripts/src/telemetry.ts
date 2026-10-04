import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { run, runWatched } from './tools'
import { ffmpegPath, ffprobePath, hasCommand } from './utils'

const GRAVITY = 9.81

const KINDS = [
  { handler: 'GoPro MET', kind: 'gopro' },
  { handler: 'CAM meta', kind: 'dji' }
] as const

type Kind = (typeof KINDS)[number]['kind']

const telemetryStream = async (clip: string) => {
  const asked = await run(ffprobePath(), [
    '-v',
    'error',
    '-select_streams',
    'd',
    '-show_entries',
    'stream=index:stream_tags=handler_name',
    '-of',
    'json',
    clip
  ])
  if (!asked.ok) return null
  const parsed: unknown = JSON.parse(asked.stdout)
  const streams =
    (parsed as { streams?: { index?: number; tags?: { handler_name?: string } }[] }).streams ?? []
  for (const { handler, kind } of KINDS) {
    const found = streams.find((s) => (s.tags?.handler_name ?? '').includes(handler))
    if (found?.index !== undefined) return { index: found.index, kind }
  }
  return null
}

const secondsOf = async (clip: string) => {
  const said = await run(ffprobePath(), [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    clip
  ])
  const seconds = said.ok ? Number.parseFloat(said.stdout.trim()) : 0
  return Number.isFinite(seconds) ? seconds : 0
}

const telemetryOf = async (clip: string, onPercent?: (percent: number) => void) => {
  if (!fs.existsSync(clip) || !hasCommand('ffmpeg') || !hasCommand('ffprobe')) return null
  let stream: { index: number; kind: Kind } | null = null
  try {
    stream = await telemetryStream(clip)
  } catch {
    return null
  }
  if (!stream) return null
  const seconds = await secondsOf(clip)
  if (seconds <= 0) return null
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-felt-'))
  const written = path.join(staging, 'felt.bin')
  try {
    const copied = await runWatched(
      ffmpegPath(),
      [
        '-v',
        'error',
        '-y',
        '-i',
        clip,
        '-map',
        `0:${stream.index}`,
        '-c',
        'copy',
        '-f',
        'data',
        written
      ],
      onPercent,
      seconds
    )
    if (!copied.ok) return null
    return { kind: stream.kind, seconds, data: fs.readFileSync(written) }
  } catch {
    return null
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

type Entry = {
  key: string
  type: string
  size: number
  count: number
  at: number
  length: number
  scale: number[]
}

const scalesIn = (buffer: Buffer, at: number, size: number, count: number) =>
  Array.from({ length: count }, (_, one) =>
    size === 2 ? buffer.readInt16BE(at + one * 2) : buffer.readInt32BE(at + one * 4)
  ).map((by) => by || 1)

const gpmf = (buffer: Buffer, onEntry: (entry: Entry) => void) => {
  const walk = (start: number, end: number, scale: number[]) => {
    let at = start
    let by = scale
    while (at + 8 <= end) {
      const key = buffer.toString('latin1', at, at + 4)
      const type = buffer.toString('latin1', at + 4, at + 5)
      const size = buffer[at + 5]
      const count = buffer.readUInt16BE(at + 6)
      const body = at + 8
      const length = size * count
      if (body + length > end) return
      if (type === '\u0000') walk(body, body + length, by)
      else if (key === 'SCAL') by = scalesIn(buffer, body, size, count)
      else onEntry({ key, type, size, count, at: body, length, scale: by })
      at = body + length + (((-length % 4) + 4) % 4)
    }
  }
  walk(0, buffer.length, [1])
}

type Push = [number, number, number]

const sizeOf = ([x, y, z]: Push) => Math.sqrt(x * x + y * y + z * z)

const accelerationVectorsIn = (buffer: Buffer) => {
  const pushes: Push[] = []
  gpmf(buffer, ({ key, type, at, length, scale }) => {
    if (key !== 'ACCL' || type !== 's') return
    const by = scale[0]
    for (let one = 0; one + 6 <= length; one += 6)
      pushes.push([
        buffer.readInt16BE(at + one) / by,
        buffer.readInt16BE(at + one + 2) / by,
        buffer.readInt16BE(at + one + 4) / by
      ])
  })
  return pushes
}

const accelerationIn = (buffer: Buffer) => accelerationVectorsIn(buffer).map(sizeOf)

const GPS_3D = 3

const asKmH = 3.6

type Fix = { at: number | null; altitude: number; speed: number }

const scaled = (scale: number[], component: number) =>
  scale[component] ?? scale[scale.length - 1] ?? 1

const gpsIn = (buffer: Buffer) => {
  const fixes: Fix[] = []
  let fix = GPS_3D
  let clock: number | null = null
  gpmf(buffer, ({ key, at, size, length, scale }) => {
    if (key === 'GPSF') {
      fix = buffer.readUInt32BE(at)
      return
    }
    if (key === 'GPS5' && size === 20) {
      if (fix < GPS_3D) return
      for (let one = 0; one + 20 <= length; one += 20)
        fixes.push({
          at: null,
          altitude: buffer.readInt32BE(at + one + 8) / scaled(scale, 2),
          speed: (buffer.readInt32BE(at + one + 16) / scaled(scale, 4)) * asKmH
        })
      return
    }
    if (key === 'GPS9' && size === 32)
      for (let one = 0; one + 32 <= length; one += 32) {
        if (buffer.readUInt16BE(at + one + 30) < GPS_3D) continue
        const day = buffer.readInt32BE(at + one + 20) / scaled(scale, 5)
        const second = buffer.readInt32BE(at + one + 24) / scaled(scale, 6)
        const taken = day * 86_400 + second
        clock = clock ?? taken
        fixes.push({
          at: taken - clock,
          altitude: buffer.readInt32BE(at + one + 8) / scaled(scale, 2),
          speed: (buffer.readInt32BE(at + one + 16) / scaled(scale, 4)) * asKmH
        })
      }
  })
  return fixes
}

const DJI_ACCELERATION = [3, 2, 10] as const

const DJI_COMPONENTS = [2, 3, 4]

const varintAt = (buffer: Buffer, from: number) => {
  let at = from
  let shift = 0
  let value = 0
  while (at < buffer.length) {
    const byte = buffer[at++]
    value += (byte & 0x7f) * 2 ** shift
    if ((byte & 0x80) === 0) return { value, at }
    shift += 7
  }
  return null
}

const djiVectors = (buffer: Buffer) => {
  const pushes: Push[] = []
  const here = (path: readonly number[]) =>
    path.length === DJI_ACCELERATION.length && path.every((one, at) => one === DJI_ACCELERATION[at])

  const walk = (start: number, end: number, path: readonly number[]) => {
    const components = new Map<number, number>()
    let at = start
    while (at < end) {
      const key = varintAt(buffer, at)
      if (!key) break
      at = key.at
      const field = Math.floor(key.value / 8)
      const shape = key.value % 8
      if (shape === 0) {
        const skipped = varintAt(buffer, at)
        if (!skipped) break
        at = skipped.at
      } else if (shape === 1) at += 8
      else if (shape === 5) {
        if (at + 4 > end) break
        if (here(path) && DJI_COMPONENTS.includes(field))
          components.set(field, buffer.readFloatLE(at))
        at += 4
      } else if (shape === 2) {
        const length = varintAt(buffer, at)
        if (!length || length.at + length.value > end) break
        if (length.value >= 2 && path.length < DJI_ACCELERATION.length)
          walk(length.at, length.at + length.value, [...path, field])
        at = length.at + length.value
      } else break
    }
    if (components.size === DJI_COMPONENTS.length)
      pushes.push([
        (components.get(2) ?? 0) * GRAVITY,
        (components.get(3) ?? 0) * GRAVITY,
        (components.get(4) ?? 0) * GRAVITY
      ])
  }

  walk(0, buffer.length, [])
  return pushes
}

const djiAcceleration = (buffer: Buffer) => djiVectors(buffer).map(sizeOf)

const VECTOR_READERS: Record<Kind, (written: Buffer) => Push[]> = {
  gopro: accelerationVectorsIn,
  dji: djiVectors
}

const READERS: Record<Kind, (written: Buffer) => number[]> = {
  gopro: accelerationIn,
  dji: djiAcceleration
}

const POSITION: Record<Kind, ((written: Buffer) => Fix[]) | null> = {
  gopro: gpsIn,
  dji: null
}

export {
  accelerationIn,
  djiAcceleration,
  GRAVITY,
  gpsIn,
  POSITION,
  READERS,
  secondsOf,
  telemetryOf,
  VECTOR_READERS
}
export type { Fix, Kind, Push }
