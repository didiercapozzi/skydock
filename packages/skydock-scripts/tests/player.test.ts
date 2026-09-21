// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { openInPlayer, playerCommand, playerParts } from '../src/player'
import { createTmpDir, onPlatform } from './fixtures'

/* A clip is handed to the machine's own video player when the browser cannot show it as it was
   shot — 4K HEVC off a DJI or a recent GoPro, which most browsers have no decoder for and every
   machine does (RULES, Cropping and turning). Which player is the machine's business: it is asked
   to open the file, and it decides. */
describe('handing a clip to the machine’s player', () => {
  let dir: string
  let clip: string
  const saved = process.env.SKYDOCK_PLAYER_COMMAND

  beforeEach(() => {
    dir = createTmpDir('skydock-player-')
    clip = path.join(dir, 'yverdon_20260920_162209.mp4')
    fs.writeFileSync(clip, 'not really a clip')
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.SKYDOCK_PLAYER_COMMAND
    else process.env.SKYDOCK_PLAYER_COMMAND = saved
    vi.unstubAllEnvs()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('asks the machine to open it, in the machine’s own words', () => {
    delete process.env.SKYDOCK_PLAYER_COMMAND
    onPlatform('linux', () => expect(playerParts()).toEqual(['xdg-open']))
    onPlatform('darwin', () => expect(playerParts()).toEqual(['open']))
    onPlatform('win32', () => expect(playerParts()).toEqual(['cmd', '/c', 'start', '']))
  })

  /* the setting is a command line — a bridge onto another machine is `sh -c "…"` and must not be
     torn apart on its spaces */
  it('reads the setting the way a shell reads a command line', () => {
    vi.stubEnv('SKYDOCK_PLAYER_COMMAND', 'flatpak run org.videolan.VLC')
    expect(playerParts()).toEqual(['flatpak', 'run', 'org.videolan.VLC'])
    expect(playerCommand()).toBe('flatpak run org.videolan.VLC')
  })

  it('opens the file it was given', async () => {
    const opened = path.join(dir, 'opened.txt')
    vi.stubEnv('SKYDOCK_PLAYER_COMMAND', `sh -c "printf %s \\"$1\\" > ${opened}" sh`)

    const said = await openInPlayer(clip)

    expect(said.opened).toBe(true)
    expect(fs.readFileSync(opened, 'utf-8')).toBe(clip)
  })

  it('says what is wrong rather than throwing when there is no such file', async () => {
    const said = await openInPlayer(path.join(dir, 'nothing.mp4'))
    expect(said.opened).toBe(false)
    expect(said.reason).toContain('No file at')
  })

  it('says what is wrong rather than throwing when the player is not on this machine', async () => {
    vi.stubEnv('SKYDOCK_PLAYER_COMMAND', 'definitely-not-installed-anywhere')
    const said = await openInPlayer(clip)
    expect(said.opened).toBe(false)
    expect(said.reason).toContain('SKYDOCK_PLAYER_COMMAND')
  })
})
