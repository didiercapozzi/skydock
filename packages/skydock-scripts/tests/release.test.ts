// @vitest-environment node
import { readFile } from 'node:fs/promises'
import * as path from 'node:path'
import { describe, it, expect } from 'vitest'
import { versionIn } from '../src/release'

const packageJson = await readFile(
  path.join(import.meta.dirname, '..', '..', '..', 'package.json'),
  'utf-8'
)

describe('the version About SkyDock shows', () => {
  it('is the plain x.y.z the installer is named after', () => {
    expect(versionIn(packageJson)).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
