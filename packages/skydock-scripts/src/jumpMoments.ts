import { GRAVITY, READERS, telemetryOf, VECTOR_READERS } from './telemetry'
import type { Push } from './telemetry'
import type { JumpMoments } from './types'

const RUN_UP = 1

const cutFrom = (moments: JumpMoments, montage: boolean) =>
  montage ? moments.exit : Math.max(0, moments.exit - RUN_UP)

const AFTER_LANDING = 8

const jumpTrim = (
  moments: JumpMoments,
  montage: boolean,
  cropEnd: number | null,
  duration?: number
) => {
  const landed = moments.landing !== undefined ? moments.landing + AFTER_LANDING : null
  return {
    cropStart: cutFrom(moments, montage),
    cropEnd: landed === null ? cropEnd : duration && landed >= duration ? null : landed
  }
}

const LEAVING = 0.82 * GRAVITY

const FALLING_FOR = 3

const STILL_ABOARD = 0.85 * GRAVITY

const ABOARD_WITHIN = 6

const HEAVY = 1.4 * GRAVITY

const OPENING_MEAN = 1.5 * GRAVITY

const OPENING_FOR = 3

const SHORTEST_FREEFALL = 6

const LONGEST_FREEFALL = 80

const FLYING_FROM = 0.75 * GRAVITY

const FLYING_TO = 1.35 * GRAVITY

const FLYING_FOR = 10

const FLYING_WITHIN = 12

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

const HARDEST_WITHIN = 5

const OPENING_LASTS = 10

const SMOOTH_OVER = 0.2

const smoothedAt = (felt: number[], rate: number, over = SMOOTH_OVER) => {
  const span = Math.max(1, Math.round(over * rate))
  return (at: number) => {
    const upto = Math.min(felt.length, at + 1)
    const from = Math.max(0, upto - span)
    if (upto <= from) return felt[0] ?? 0
    let sum = 0
    for (let one = from; one < upto; one++) sum += felt[one]
    return sum / (upto - from)
  }
}

const leftAt = (felt: number[], rate: number, second: number, level: number) => {
  const smoothed = smoothedAt(felt, rate)
  const from = Math.round(second * rate)
  const earliest = Math.max(0, from - Math.round(rate))
  const latest = Math.min(felt.length - 1, from + Math.round(rate))
  for (let at = latest; at >= earliest; at--)
    if (smoothed(at) >= level) return Math.round((at / rate) * 10) / 10
  return second
}

const TIPPED_OVER = 90

const ABOARD_FROM = 4

const ABOARD_TO = 1

const TIP_WITHIN = 1.5

const facingOver = (pushes: Push[], rate: number, from: number, to: number) => {
  const sum: Push = [0, 0, 0]
  const first = Math.max(0, Math.floor(from * rate))
  const last = Math.min(pushes.length, Math.floor(to * rate))
  for (let at = first; at < last; at++) {
    const push = pushes[at]
    const size = Math.hypot(push[0], push[1], push[2]) || 1
    sum[0] += push[0] / size
    sum[1] += push[1] / size
    sum[2] += push[2] / size
  }
  const size = Math.hypot(sum[0], sum[1], sum[2])
  return size === 0 || last <= first
    ? null
    : ([sum[0] / size, sum[1] / size, sum[2] / size] as Push)
}

const WELL_AHEAD = 0.5

const tippedAt = (pushes: Push[], rate: number, exit: number) => {
  for (let at = exit - TIP_WITHIN; at <= exit; at += 0.05) {
    const now = facingOver(pushes, rate, at, at + 0.1)
    const aboard = facingOver(pushes, rate, at - ABOARD_FROM, at - ABOARD_TO)
    if (!now || !aboard) continue
    const cosine = now[0] * aboard[0] + now[1] * aboard[1] + now[2] * aboard[2]
    if ((Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI >= TIPPED_OVER)
      return exit - at >= WELL_AHEAD ? Math.round(at * 10) / 10 : exit
  }
  return exit
}

const struckAt = (felt: number[], rate: number, second: number, level: number) => {
  const span = Math.max(1, Math.round(SMOOTH_OVER * rate))
  const ahead = (at: number) => {
    const upto = Math.min(felt.length, at + span)
    let sum = 0
    for (let one = at; one < upto; one++) sum += felt[one]
    return upto > at ? sum / (upto - at) : 0
  }
  const from = Math.round(second * rate)
  const latest = Math.min(felt.length - 1, from + Math.round(rate))
  for (let at = from; at <= latest; at++)
    if (ahead(at) >= level) return Math.round((at / rate) * 10) / 10
  return second
}

const HALF_GONE = 0.5

const SMOOTH_OPENING = 1

const hardestOf = (
  felt: number[],
  rate: number,
  second: number,
  smoothed: (at: number) => number
) => {
  const from = Math.round(second * rate)
  const hardest = Math.min(felt.length - 1, from + Math.round(HARDEST_WITHIN * rate))
  let peak = from
  for (let at = from; at <= hardest; at++) if (smoothed(at) > smoothed(peak)) peak = at
  return { from, peak }
}

const easedAt = (felt: number[], rate: number, second: number) => {
  const smoothed = smoothedAt(felt, rate, SMOOTH_OPENING)
  const { from, peak } = hardestOf(felt, rate, second, smoothed)
  const latest = Math.min(felt.length - 1, from + Math.round(OPENING_LASTS * rate))
  const eased = GRAVITY + (smoothed(peak) - GRAVITY) * HALF_GONE
  for (let at = peak; at <= latest; at++)
    if (smoothed(at) <= eased) return Math.round((at / rate) * 10) / 10
  return Math.round((peak / rate) * 10) / 10
}

const JUST_BEGUN = 0.25

const beganAt = (felt: number[], rate: number, second: number) => {
  const smoothed = smoothedAt(felt, rate, SMOOTH_OPENING)
  const { from, peak } = hardestOf(felt, rate, second, smoothed)
  const earliest = Math.max(0, from - Math.round(rate))
  const begun = GRAVITY + (smoothed(peak) - GRAVITY) * JUST_BEGUN
  for (let at = peak; at >= earliest; at--)
    if (smoothed(at) <= begun) return Math.round((at / rate) * 10) / 10
  return Math.round((earliest / rate) * 10) / 10
}

const readFelt = (felt: number[], seconds: number, pushes?: Push[]): JumpMoments | null => {
  if (felt.length < 100 || seconds <= 0) return null
  const weighed = bySecond(felt, seconds)
  if (weighed.length < 5) return null

  const dips = weighed.flatMap((second, at) => {
    if (second >= STILL_ABOARD) return []
    const falling = weighed.slice(at, at + FALLING_FOR)
    if (falling.length < FALLING_FOR) return []
    if (falling.reduce((sum, one) => sum + one, 0) / FALLING_FOR >= LEAVING) return []
    return weighed
      .slice(Math.max(0, at - ABOARD_WITHIN), at)
      .some((before) => before >= STILL_ABOARD)
      ? [at]
      : []
  })
  const candidates = dips.filter((at, index) => dips[index - 1] !== at - 1)
  if (candidates.length === 0) return null
  const depthAt = (at: number) =>
    weighed.slice(at, at + FALLING_FOR).reduce((sum, one) => sum + one, 0) / FALLING_FOR

  const opening = (at: number) => {
    const during = weighed.slice(at, at + OPENING_FOR)
    return during.length < OPENING_FOR ? 0 : during.reduce((sum, one) => sum + one, 0) / OPENING_FOR
  }
  const flyingAfter = (at: number) => {
    for (let from = at + 1; from <= at + FLYING_WITHIN; from++) {
      const flying = weighed.slice(from, from + FLYING_FOR)
      if (flying.length < FLYING_FOR) return false
      if (flying.every((one) => one >= FLYING_FROM && one <= FLYING_TO)) return true
    }
    return false
  }
  const canopyAfter = (exit: number) =>
    weighed.reduce(
      (best, _, at) =>
        at >= exit + SHORTEST_FREEFALL &&
        at <= exit + LONGEST_FREEFALL &&
        opening(at) >= OPENING_MEAN &&
        opening(at) > (best === -1 ? 0 : opening(best)) &&
        flyingAfter(at)
          ? at
          : best,
      -1
    )
  const read = candidates.map((at) => ({ at, canopy: canopyAfter(at) }))
  const chosen = read.reduce((best, one) => {
    if ((one.canopy !== -1) !== (best.canopy !== -1)) return one.canopy !== -1 ? one : best
    return depthAt(one.at) < depthAt(best.at) ? one : best
  })
  const exit = chosen.at
  const canopy = chosen.canopy
  const last = weighed.reduce<number | undefined>(
    (found, second, at) => (second >= HEAVY ? at : found),
    undefined
  )
  const landing = canopy !== -1 && last !== undefined && last > canopy ? last : undefined

  const rate = felt.length / seconds
  const left = leftAt(felt, rate, exit, STILL_ABOARD)
  return {
    exit: pushes && pushes.length === felt.length ? tippedAt(pushes, rate, left) : left,
    opening: canopy === -1 ? undefined : beganAt(felt, rate, canopy),
    canopy: canopy === -1 ? undefined : easedAt(felt, rate, canopy),
    landing: landing === undefined ? undefined : struckAt(felt, rate, landing, HEAVY)
  }
}

const jumpMoments = async (clip: string, onPercent?: (percent: number) => void) => {
  const written = await telemetryOf(clip, onPercent)
  return written
    ? readFelt(
        READERS[written.kind](written.data),
        written.seconds,
        VECTOR_READERS[written.kind](written.data)
      )
    : null
}

export { cutFrom, jumpMoments, jumpTrim, readFelt, RUN_UP }
