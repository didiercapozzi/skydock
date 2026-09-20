// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSettings, rememberOutputDir, resolveOutputDir } from '../src/settings'
import { createTmpDir } from './fixtures'

/* Where SkyDock keeps the work is asked for once and remembered (RULES, What lands on disk): what
   this run was told comes first, then what was chosen before, then what the app suggests. */

let configDir: string
const env = {
  output: process.env.SKYDOCK_OUTPUT_DIR,
  suggested: process.env.SKYDOCK_DEFAULT_OUTPUT_DIR
}

const set = (key: 'SKYDOCK_OUTPUT_DIR' | 'SKYDOCK_DEFAULT_OUTPUT_DIR', value?: string) => {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

beforeEach(() => {
  configDir = createTmpDir('skydock-settings-')
  set('SKYDOCK_OUTPUT_DIR', undefined)
  set('SKYDOCK_DEFAULT_OUTPUT_DIR', undefined)
})

afterEach(() => {
  fs.rmSync(configDir, { recursive: true, force: true })
  set('SKYDOCK_OUTPUT_DIR', env.output)
  set('SKYDOCK_DEFAULT_OUTPUT_DIR', env.suggested)
})

describe('where the work is kept', () => {
  it('is what this run was told, before anything else', () => {
    rememberOutputDir('/chosen/before', configDir)
    set('SKYDOCK_OUTPUT_DIR', '/told/now')

    expect(resolveOutputDir(configDir)).toBe('/told/now')
  })

  it('is the folder chosen before, once nothing says otherwise', () => {
    set('SKYDOCK_DEFAULT_OUTPUT_DIR', '/suggested')
    rememberOutputDir('/movies/SkyDock', configDir)

    expect(resolveOutputDir(configDir)).toBe('/movies/SkyDock')
  })

  it('is the folder the app suggests when none was ever chosen', () => {
    set('SKYDOCK_DEFAULT_OUTPUT_DIR', '/movies/SkyDock')

    expect(resolveOutputDir(configDir)).toBe('/movies/SkyDock')
  })

  it('is remembered once, and asked for no more', () => {
    rememberOutputDir('/movies/SkyDock', configDir)

    expect(readSettings(configDir).outputDir).toBe('/movies/SkyDock')
    expect(fs.existsSync(path.join(configDir, 'settings.json'))).toBe(true)
  })

  it('reads as nothing chosen when the settings cannot be read', () => {
    fs.writeFileSync(path.join(configDir, 'settings.json'), 'not json at all')

    expect(readSettings(configDir)).toEqual({})
  })
})
