// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { following, publish, subscribe } from '../src/live'
import type { LiveEvent } from '../src/live'
import { durationIn, positionIn, runWatched } from '../src/tools'

/* A file being processed, or a proxy being made, shows how far along it is while it happens. The
   figure comes from ffmpeg's own account of where it is, and reaches the board over one stream
   instead of being asked for. */

describe('how far a file being processed has got', () => {
  it('reads its position out of what it prints, the latest one when several arrive at once', () => {
    expect(positionIn('frame=10\nout_time_us=2500000\nprogress=continue\n')).toBe(2.5)
    expect(positionIn('out_time_us=1000000\nout_time_us=4000000\n')).toBe(4)
    expect(positionIn('frame=10\n')).toBeNull()
  })

  it('reads how long the clip runs from what ffmpeg says on opening it', () => {
    expect(durationIn('  Duration: 00:02:28.50, start: 0.000000, bitrate: 60 kb/s')).toBe(148.5)
    expect(durationIn('Stream #0:0: Video: hevc')).toBeNull()
  })

  /* a real command through the real runner: what matters is that the figures arrive while it
     runs, not once it is over */
  it('says the percentage of a trimmed clip against the length of the trim', async () => {
    const heard: number[] = []
    const ran = await runWatched(
      "printf 'out_time_us=2000000\\n'; sleep 0.2; printf 'out_time_us=5000000\\n'",
      (percent) => heard.push(percent),
      10
    )
    expect(ran.ok).toBe(true)
    expect(heard).toEqual([20, 50])
  })

  it('takes the length from ffmpeg itself when the clip is not trimmed', async () => {
    const heard: number[] = []
    await runWatched(
      "printf 'Duration: 00:00:20.00, start' >&2; sleep 0.2; printf 'out_time_us=5000000\\n'",
      (percent) => heard.push(percent)
    )
    expect(heard).toEqual([25])
  })

  /* done is the command coming back, not the last frame going out */
  it('never says a hundred on its own', async () => {
    const heard: number[] = []
    await runWatched("printf 'out_time_us=99000000\\n'", (percent) => heard.push(percent), 10)
    expect(heard).toEqual([99])
  })
})

describe('what is happening to the files, said as it happens', () => {
  let heard: LiveEvent[]
  const listen = () => subscribe((event) => heard.push(event))

  beforeEach(() => {
    heard = []
    globalThis.skydockLive = undefined
  })

  it('says a file began, each step forward, and how it ended', () => {
    const stop = listen()
    const live = following('process', 'a')
    live.at(40)
    live.at(40)
    live.at(30)
    live.at(75)
    live.done(true)
    stop()

    expect(heard).toEqual([
      { kind: 'file', work: 'process', fileId: 'a', percent: 0 },
      { kind: 'file', work: 'process', fileId: 'a', percent: 40 },
      { kind: 'file', work: 'process', fileId: 'a', percent: 75 },
      { kind: 'file-done', work: 'process', fileId: 'a', ok: true }
    ])
  })

  /* the page opened in the middle of a run */
  it('tells whoever starts listening what is already under way, and nothing that has ended', () => {
    following('process', 'ended').done(true)
    following('proxy', 'running').at(60)

    listen()

    expect(heard).toEqual([{ kind: 'file', work: 'proxy', fileId: 'running', percent: 60 }])
  })

  it('stops telling whoever stopped listening', () => {
    const stop = listen()
    stop()
    publish({ kind: 'file', work: 'proxy', fileId: 'a', percent: 10 })
    expect(heard).toEqual([])
  })
})
