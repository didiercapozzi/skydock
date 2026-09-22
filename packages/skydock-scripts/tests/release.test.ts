// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  nextVersion,
  tagOf,
  versionIn,
  versionOfTag,
  versionedFiles,
  withVersion
} from '../src/release'

/* A release is a version moved in three files at once and a tag that agrees with them. What is
   worth testing is the two ways that goes wrong: a version that moves in one file and not the
   others, and a file that has been restructured so nothing is found to move at all. */

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

describe('the three files that say which version this is', () => {
  it('each say it today, so a release is never made from a file that has been restructured', () => {
    for (const file of versionedFiles())
      expect(versionIn(real(file), file)).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('all say the same one, since an installer named after one of them carries the others', () => {
    const said = versionedFiles().map((file) => versionIn(real(file), file))
    expect(new Set(said).size).toBe(1)
  })

  it('are each moved where they say it and nowhere else', () => {
    for (const file of versionedFiles()) {
      const before = real(file)
      const after = withVersion(before, file, '2.3.4')
      expect(versionIn(after, file)).toBe('2.3.4')
      expect(after.length).toBe(before.length + '2.3.4'.length - versionIn(before, file).length)
    }
  })

  it('keep the lockfile talking about SkyDock and not about something else it lists', () => {
    const after = withVersion(real('src-tauri/Cargo.lock'), 'src-tauri/Cargo.lock', '2.3.4')
    expect(after).toContain('[[package]]\nname = "skydock"\nversion = "2.3.4"')
  })

  it('stop the release when one of them no longer says it', () => {
    expect(() => versionIn('[package]\nname = "skydock"\n', 'src-tauri/Cargo.toml')).toThrow(
      /no longer says/
    )
    expect(() => withVersion('{}', 'src-tauri/tauri.conf.json', '2.3.4')).toThrow(/no longer says/)
  })

  it('are not moved to something that is not a version', () => {
    expect(() =>
      withVersion(real('src-tauri/Cargo.toml'), 'src-tauri/Cargo.toml', 'latest')
    ).toThrow(/shape 1\.2\.3/)
  })
})

describe('the tag a release is made under', () => {
  it('is the version with a v in front, which is what the build checks the app against', () => {
    expect(tagOf('1.2.3')).toBe('v1.2.3')
    expect(versionOfTag('v1.2.3')).toBe('1.2.3')
  })
})
