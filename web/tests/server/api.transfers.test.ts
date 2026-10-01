// @vitest-environment node
import * as fs from 'node:fs'
import { recordTransfer } from '@skydock/scripts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { action, loader } from '../../app/routes/api.transfers'
import { createTmpDir, routeArgs } from './fixtures'

/* What was sent and copied, kept to be looked at afterwards, and forgotten on request (RULES,
   Transfers). */

let tmpDir: string
let previous: string | undefined

const remove = (id: string) =>
  action(
    routeArgs(
      new Request('http://localhost/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove: id })
      })
    )
  )

const clear = () =>
  action(
    routeArgs(
      new Request('http://localhost/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true })
      })
    )
  )

beforeEach(() => {
  tmpDir = createTmpDir('skydock-api-transfers-')
  previous = process.env.SKYDOCK_OUTPUT_DIR
  process.env.SKYDOCK_OUTPUT_DIR = tmpDir
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (previous === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
  else process.env.SKYDOCK_OUTPUT_DIR = previous
})

describe('the transfers kept', () => {
  it('are none before anything was done', async () => {
    expect(await loader().json()).toEqual({ transfers: [] })
  })

  it('are listed, the latest first, and forgotten when asked', async () => {
    recordTransfer({ kind: 'upload', label: 'Luc', state: 'done', items: [] }, tmpDir)
    recordTransfer({ kind: 'camera', label: 'GoPro', state: 'failed', items: [] }, tmpDir)

    const said = await loader().json()
    expect(said.transfers.map((t: { label: string }) => t.label)).toEqual(['GoPro', 'Luc'])

    await clear()
    expect(await loader().json()).toEqual({ transfers: [] })
  })

  it('forgets one and keeps the others', async () => {
    const luc = recordTransfer({ kind: 'upload', label: 'Luc', state: 'done', items: [] }, tmpDir)
    recordTransfer({ kind: 'camera', label: 'GoPro', state: 'failed', items: [] }, tmpDir)

    await remove(luc.id)

    const said = await loader().json()
    expect(said.transfers.map((t: { label: string }) => t.label)).toEqual(['GoPro'])
  })
})
