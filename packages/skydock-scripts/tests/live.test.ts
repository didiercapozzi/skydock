// @vitest-environment node
import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { following, job, publish, subscribe } from '../src/live'
import type { LiveEvent } from '../src/live'
import { runWatched } from '../src/tools'
import { createTmpDir } from './fixtures'

const scripts: string[] = []

const printing = (prints: string) => {
  const dir = createTmpDir('skydock-progress-')
  scripts.push(dir)
  const target = path.join(dir, 'ffmpeg')
  fs.writeFileSync(target, `#!/bin/sh\n${prints}\n`, { mode: 0o755 })
  return target
}

afterAll(() => {
  for (const dir of scripts) fs.rmSync(dir, { recursive: true, force: true })
})

describe('how far a file being processed has got', () => {
  it('says the percentage of a trimmed clip against the length of the trim', async () => {
    const heard: number[] = []
    const ran = await runWatched(
      printing("printf 'out_time_us=2000000\\n'; sleep 0.2; printf 'out_time_us=5000000\\n'"),
      [],
      (percent) => heard.push(percent),
      10
    )
    expect(ran.ok).toBe(true)
    expect(heard).toEqual([20, 50])
  })

  it('takes the length from ffmpeg itself when the clip is not trimmed', async () => {
    const heard: number[] = []
    await runWatched(
      printing(
        "printf 'Duration: 00:00:20.00, start' >&2; sleep 0.2; printf 'out_time_us=5000000\\n'"
      ),
      [],
      (percent) => heard.push(percent)
    )
    expect(heard).toEqual([25])
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

  it('tells whoever starts listening what is already under way, and nothing that has ended', () => {
    following('process', 'ended').done(true)
    following('proxy', 'running').at(60)

    listen()

    expect(heard).toEqual([{ kind: 'file', work: 'proxy', fileId: 'running', percent: 60 }])
  })

  it('tells a late listener the task under way, with how every row so far went', () => {
    const copying = job({ type: 'camera-copy', label: 'GOPRO', total: 2 })
    copying.rows([
      { key: '0', name: 'a.MP4', size: 1 },
      { key: '1', name: 'b.MP4', size: 2 }
    ])
    copying.row({ key: '0', at: 'skipped' })

    listen()

    expect(heard).toHaveLength(1)
    expect(heard[0]).toMatchObject({
      kind: 'job',
      type: 'camera-copy',
      label: 'GOPRO',
      rows: [
        { key: '0', name: 'a.MP4', size: 1, at: 'skipped' },
        { key: '1', name: 'b.MP4', size: 2, at: 'later' }
      ]
    })
    copying.finish()
  })

  it('does not tell a late listener of a task that has ended', () => {
    const copying = job({ type: 'camera-copy', label: 'GOPRO', total: 1 })
    copying.finish()

    listen()

    expect(heard).toEqual([])
  })

  it('stops telling whoever stopped listening', () => {
    const stop = listen()
    stop()
    publish({ kind: 'file', work: 'proxy', fileId: 'a', percent: 10 })
    expect(heard).toEqual([])
  })
})
