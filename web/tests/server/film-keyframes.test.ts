// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { POP, TEXT_FADE } from '@skydock/scripts/client'
import { TILE_LOOP as LOOP } from '../../app/helpers/filmTimeline'
import { describe, expect, it } from 'vitest'

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'app.css'), 'utf-8')

const stops = (name: string) =>
  [
    ...css
      .match(new RegExp(`@keyframes ${name} \\{[\\s\\S]*?\\n\\}`))![0]
      .matchAll(/^ {2}([\d.%,\s]+) \{/gm)
  ]
    .flatMap((one) => one[1]!.split(','))
    .map((stop) => parseFloat(stop))

describe('the text cards animation', () => {
  it('has the text fully in at the end of the fade the film gives it, and fully out when it starts to leave', () => {
    for (const name of ['fx-fade', 'fx-rise', 'fx-pop', 'fx-lower']) {
      expect(stops(name)).toContain(100 / LOOP)
      expect(stops(name)).toContain(100 - 100 / LOOP)
    }
  })

  it('has the pop settle when the film does', () => {
    const at = (POP / (LOOP * TEXT_FADE)) * 100
    expect(stops('fx-pop').some((stop) => Math.abs(stop - at) < 0.005)).toBe(true)
  })
})
