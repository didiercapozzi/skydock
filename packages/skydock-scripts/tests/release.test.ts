// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect } from 'vitest'
import { nextVersion, tagOf, versionIn, versionedFiles, withVersion } from '../src/release'

/* A release is a version moved where the app says which one it is, and a tag that agrees with it.
   What is worth testing is the two ways that goes wrong: a version moved to something that is not
   one, and a file restructured so that nothing is found to move at all. */

const repo = path.join(__dirname, '..', '..', '..')
const real = (file: string) => fs.readFileSync(path.join(repo, file), 'utf-8')

describe('the version after this one', () => {
  it('is the next patch by default', () => {
    expect(nextVersion('0.1.0', 'patch')).toBe('0.1.1')
  })

  it('starts the patches again on a new minor, and the minors on a new major', () => {
    expect(nextVersion('0.1.7', 'minor')).toBe('0.2.0')
    expect(nextVersion('0.9.3', 'major')).toBe('1.0.0')
  })

  it('is the one asked for when a version is named instead', () => {
    expect(nextVersion('0.1.0', '1.4.2')).toBe('1.4.2')
  })

  it('is refused when it is neither a step nor a version', () => {
    expect(() => nextVersion('0.1.0', 'soon')).toThrow(/patch, minor, major/)
    expect(() => nextVersion('0.1.0', '2.0')).toThrow(/patch, minor, major/)
  })
})

describe('the file that says which version this is', () => {
  it('says it today, so a release is never made from a file that has been restructured', () => {
    for (const file of versionedFiles())
      expect(versionIn(real(file), file)).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('is moved where it says it and nowhere else', () => {
    for (const file of versionedFiles()) {
      const before = real(file)
      const after = withVersion(before, file, '2.3.4')
      expect(versionIn(after, file)).toBe('2.3.4')
      expect(after.length).toBe(before.length + '2.3.4'.length - versionIn(before, file).length)
    }
  })

  it('is the version the app is named after, and not one of the packages it lists', () => {
    const after = withVersion(real('package.json'), 'package.json', '2.3.4')
    expect(after).toContain('"version": "2.3.4"')
    expect(after).toContain('"electron"')
  })

  it('stops the release when it no longer says it', () => {
    expect(() => versionIn('{}', 'package.json')).toThrow(/no longer says/)
    expect(() => withVersion('{}', 'package.json', '2.3.4')).toThrow(/no longer says/)
  })

  it('is not moved to something that is not a version', () => {
    expect(() => withVersion(real('package.json'), 'package.json', 'latest')).toThrow(
      /shape 1\.2\.3/
    )
  })
})

describe('the tag a release is made under', () => {
  it('is the version with a v in front, which is what the build checks the app against', () => {
    expect(tagOf('1.2.3')).toBe('v1.2.3')
  })
})
