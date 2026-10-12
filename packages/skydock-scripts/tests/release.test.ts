// @vitest-environment node
import { readFile } from 'node:fs/promises'
import * as path from 'node:path'
import { describe, it, expect } from 'vitest'
import { tagOf, versionIn, withVersion } from '../src/release'

const packageJson = await readFile(
  path.join(import.meta.dirname, '..', '..', '..', 'package.json'),
  'utf-8'
)

describe('the version About SkyDock shows', () => {
  it('is the plain x.y.z the installer is named after', () => {
    expect(versionIn(packageJson)).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('making a release', () => {
  it('moves only the version the app is named after, not one of the packages it lists', () => {
    const text =
      '{\n  "name": "skydock",\n  "version": "1.2.3",\n  "devDependencies": { "electron": "^1.0.0" }\n}'
    const after = withVersion(text, '2.3.4')
    expect(after).toBe(text.replace('1.2.3', '2.3.4'))
  })

  it('tags it with the version and a v in front', () => {
    expect(tagOf('1.2.3')).toBe('v1.2.3')
  })
})
