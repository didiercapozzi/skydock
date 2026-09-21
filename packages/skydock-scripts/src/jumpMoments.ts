import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { ffmpegPath, ffprobePath, hasCommand } from './utils'

/* The three moments a jump is cut around: leaving the plane, the canopy opening, and the ground.
   Finding them is what an editor does first, every time — the music is hung on the exit, the cabin
   before it is trimmed to a few seconds, and two cameras of one jump are lined up on the instant
   they both left.

   A GoPro writes down what it felt, two hundred times a second, and that answers it exactly.
   Leaving the plane is weightlessness — briefly, until the air catches up and freefall weighs one
   gravity again, which is why the mark is the dip and not a lasting nothing. The canopy is the
   second that weighs two, and the ground the last one that weighs any more than usual.

   Read by the second, averaged, never by the single reading: freefall buffets a camera hard enough
   to touch one and a half gravities for an instant every few seconds, so a peak says nothing. What
   a whole second weighs separates the moments cleanly. Measured off real jumps:

     leaving the plane   0.2 – 0.7   the air has not caught up yet
     freefall            1.0         drag against weight, the two equal
     under a canopy      1.0         the same again — this is not about how high anything is
     the canopy opening  1.5 – 2.2   a second or two of it, unmistakable
     the ground          1.4 – 1.6

   It needs the original: a copy keeps the picture and the sound, not what the camera felt.

   Not knowing is an answer, and the usual one. A clip shot on the ground has no exit; neither has
   one that never left the plane, nor one off a camera that writes nothing down — a DJI keeps what
   it felt too, but in a form of its own that nothing here reads yet. Those are marked by hand. */

type JumpMoments = {
  /* seconds into the clip; the exit is the only one always there when anything is */
  exit: number
  canopy?: number
  landing?: number
}

const GRAVITY = 9.81

/* the second the door is left in: light, and followed by lighter */
const LEAVING = 0.75 * GRAVITY

const FALLING = 0.6 * GRAVITY

/* a second weighing this much is the canopy or the ground; nothing else in a jump is */
const HEAVY = 1.4 * GRAVITY

/* A canopy cannot open the moment the door is left: a drogue is thrown within seconds of it, and
   the shove of that is not the opening. Sooner than this, a heavy second is freefall being itself. */
const SHORTEST_FREEFALL = 15

/* The stream a GoPro writes its measurements into, named rather than numbered: a clip's streams sit
   in whatever order the camera wrote them. */
const telemetryStream = (clip: string) => {
  const asked = childProcess.execFileSync(
    ffprobePath(),
    [
      '-v',
      'error',
      '-select_streams',
      'd',
      '-show_entries',
      'stream=index:stream_tags=handler_name',
      '-of',
      'json',
      clip
    ],
    { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 }
  )
  const parsed: unknown = JSON.parse(asked)
  const streams = (parsed as { streams?: { index?: number; tags?: { handler_name?: string } }[] })
    .streams
  return streams?.find((s) => (s.tags?.handler_name ?? '').includes('GoPro MET'))?.index ?? null
}

/* Every measurement in there is a key, a type, the size of one and how many follow, laid one after
   another and nested the same way — so it is walked rather than read at offsets. Only the
   accelerometer is wanted, and the scale that turns its counts into motion. */
const accelerationIn = (buffer: Buffer) => {
  const felt: number[] = []
  const walk = (start: number, end: number, scale: number): number => {
    let at = start
    let by = scale
    while (at + 8 <= end) {
      const key = buffer.toString('latin1', at, at + 4)
      const type = buffer.toString('latin1', at + 4, at + 5)
      const size = buffer[at + 5]
      const count = buffer.readUInt16BE(at + 6)
      const body = at + 8
      const length = size * count
      if (body + length > end) return by
      if (type === '\u0000') by = walk(body, body + length, by)
      else if (key === 'SCAL')
        by = (size === 2 ? buffer.readInt16BE(body) : buffer.readInt32BE(body)) || 1
      else if (key === 'ACCL' && type === 's')
        for (let one = 0; one + 6 <= length; one += 6) {
          const x = buffer.readInt16BE(body + one) / by
          const y = buffer.readInt16BE(body + one + 2) / by
          const z = buffer.readInt16BE(body + one + 4) / by
          felt.push(Math.sqrt(x * x + y * y + z * z))
        }
      at = body + length + (((-length % 4) + 4) % 4)
    }
    return by
  }
  walk(0, buffer.length, 1)
  return felt
}

/* what each second of the clip weighed */
const bySecond = (felt: number[], seconds: number) => {
  const rate = felt.length / seconds
  const each: number[] = []
  for (let second = 0; second < Math.floor(seconds); second++) {
    const from = Math.floor(second * rate)
    const upto = Math.min(felt.length, Math.floor((second + 1) * rate))
    if (upto <= from) break
    let sum = 0
    for (let at = from; at < upto; at++) sum += felt[at]
    each.push(sum / (upto - from))
  }
  return each
}

/* The door is the first light second with lighter ones after it; the canopy the first heavy second
   a sensible while later; the ground the last heavy second of all. */
const readFelt = (felt: number[], seconds: number): JumpMoments | null => {
  if (felt.length < 100 || seconds <= 0) return null
  const weighed = bySecond(felt, seconds)
  if (weighed.length < 5) return null

  const exit = weighed.findIndex(
    (second, at) =>
      second < LEAVING &&
      weighed[at + 1] !== undefined &&
      weighed[at + 1] < FALLING &&
      weighed[at + 2] !== undefined &&
      weighed[at + 2] < FALLING
  )
  if (exit === -1) return null

  const heavy = weighed.flatMap((second, at) => (second >= HEAVY ? [at] : []))
  const canopy = heavy.find((at) => at >= exit + SHORTEST_FREEFALL)
  const last = heavy[heavy.length - 1]
  const landing = canopy !== undefined && last !== undefined && last > canopy ? last : undefined

  return { exit, canopy, landing }
}

const secondsOf = (clip: string) => {
  try {
    const said = childProcess.execFileSync(
      ffprobePath(),
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clip],
      { encoding: 'utf-8' }
    )
    const seconds = Number.parseFloat(said.trim())
    return Number.isFinite(seconds) ? seconds : 0
  } catch {
    return 0
  }
}

/* What this clip shows of the jump, as its camera measured it — or nothing, which is no failure and
   needs no explaining. A quarter of a second for a clip of any size: the measurements are a stream
   of their own and the picture is never decoded. */
const jumpMoments = (clip: string): JumpMoments | null => {
  if (!fs.existsSync(clip) || !hasCommand('ffmpeg') || !hasCommand('ffprobe')) return null
  let stream: number | null = null
  try {
    stream = telemetryStream(clip)
  } catch {
    return null
  }
  if (stream === null) return null
  const seconds = secondsOf(clip)
  if (seconds <= 0) return null
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-felt-'))
  const written = path.join(staging, 'felt.bin')
  try {
    childProcess.execFileSync(
      ffmpegPath(),
      ['-v', 'error', '-y', '-i', clip, '-map', `0:${stream}`, '-c', 'copy', '-f', 'data', written],
      { stdio: 'ignore' }
    )
    return readFelt(accelerationIn(fs.readFileSync(written)), seconds)
  } catch {
    return null
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

export { accelerationIn, jumpMoments, readFelt }
export type { JumpMoments }
