// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isOnCamera } from '../src/cameraWatch'
import { createTmpDir } from './fixtures'

/* A card's files may be asked for only from under its DCIM folder (RULES, Seeing what is on a camera). */

let root: string
let card: string
let outside: string

beforeEach(() => {
  root = fs.realpathSync(createTmpDir('skydock-preview-'))
  card = path.join(root, 'card')
  fs.mkdirSync(path.join(card, 'DCIM', '100MEDIA'), { recursive: true })
  fs.writeFileSync(path.join(card, 'DCIM', '100MEDIA', 'a.mp4'), 'x')
  fs.writeFileSync(path.join(card, 'notes.txt'), 'x')
  outside = path.join(root, 'secret.txt')
  fs.writeFileSync(outside, 'x')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('whether a file is on a camera', () => {
  it('accepts a file under the card DCIM folder', () => {
    expect(isOnCamera(path.join(card, 'DCIM', '100MEDIA', 'a.mp4'), [card])).toBe(true)
  })

  it('refuses a file on the card outside DCIM, or a file elsewhere', () => {
    expect(isOnCamera(path.join(card, 'notes.txt'), [card])).toBe(false)
    expect(isOnCamera(outside, [card])).toBe(false)
  })

  it('refuses the DCIM folder itself and a file that is not there', () => {
    expect(isOnCamera(path.join(card, 'DCIM'), [card])).toBe(false)
    expect(isOnCamera(path.join(card, 'DCIM', 'missing.mp4'), [card])).toBe(false)
  })

  it('refuses a path that climbs out of DCIM with ..', () => {
    expect(isOnCamera(path.join(card, 'DCIM', '..', '..', 'secret.txt'), [card])).toBe(false)
    expect(isOnCamera(`${card}/DCIM/100MEDIA/../../notes.txt`, [card])).toBe(false)
  })

  it('refuses a link inside DCIM that leads out', () => {
    const link = path.join(card, 'DCIM', 'link.txt')
    fs.symlinkSync(outside, link)
    expect(isOnCamera(link, [card])).toBe(false)
    const dirLink = path.join(card, 'DCIM', 'dirlink')
    fs.symlinkSync(root, dirLink)
    expect(isOnCamera(path.join(dirLink, 'secret.txt'), [card])).toBe(false)
  })

  it('refuses everything when no camera is given', () => {
    expect(isOnCamera(path.join(card, 'DCIM', '100MEDIA', 'a.mp4'), [])).toBe(false)
  })

  it('refuses a camera read through KDE', () => {
    expect(
      isOnCamera(path.join(card, 'DCIM', '100MEDIA', 'a.mp4'), ['mtp:/HERO5 Black/Disk'])
    ).toBe(false)
  })
})
