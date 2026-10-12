// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { once } from 'node:events'
import { setTimeout as wait } from 'node:timers/promises'
import { gentleWriter } from '../src/lib/gentle'
import { createTmpDir } from './fixtures'

describe('a card pulled out half way leaves nothing behind that could be taken for an original', () => {
  let dir: string

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('lets go of a file that is cut off while it is being opened, so it can be removed for good', async () => {
    dir = createTmpDir('skydock-gentle-')
    const file = path.join(dir, 'GX01.MP4.part')
    const writer = gentleWriter(file)
    writer.write(Buffer.from('x'))
    writer.destroy()
    await once(writer, 'close')
    fs.rmSync(file, { force: true })
    await wait(30)
    expect(fs.existsSync(file)).toBe(false)
  })
})
