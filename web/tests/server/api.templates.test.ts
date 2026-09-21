// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { action, loader } from '../../app/routes/api.templates'
import { createTmpDir, routeArgs } from './fixtures'

/* The editing templates, listed for the board and brought in from the computer: the archive's bytes
   are the request's body, the way the board sends them. */

const project = `<?xml version='1.0' encoding='utf-8'?>
<mlt root="/elsewhere">
 <chain id="chain0"><property name="resource">audio/music.mp3</property></chain>
 <playlist id="main_bin"><property name="kdenlive:docproperties.kdenliveversion">24.12.1</property></playlist>
</mlt>
`

let tmpDir: string
let previous: string | undefined

const send = (filename: string, body: Uint8Array, name?: string) => {
  const params = new URLSearchParams({ filename, ...(name ? { name } : {}) })
  return action(
    routeArgs(
      new Request(`http://localhost/api/templates?${params.toString()}`, {
        method: 'POST',
        body: new Blob([Buffer.from(body)])
      })
    )
  ).then(async (res) => ({ status: res.status, said: await res.json() }))
}

beforeEach(() => {
  tmpDir = createTmpDir('skydock-api-templates-')
  previous = process.env.SKYDOCK_OUTPUT_DIR
  process.env.SKYDOCK_OUTPUT_DIR = tmpDir
  process.env.SKYDOCK_CONFIG_DIR = tmpDir
  fs.mkdirSync(path.join(tmpDir, 'templates', 'house'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, 'templates', 'house', 'house.kdenlive'), project)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (previous === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
  else process.env.SKYDOCK_OUTPUT_DIR = previous
})

describe('the editing templates', () => {
  it('are listed with the kdenlive that wrote each and the files each is missing', async () => {
    const said = await loader().json()
    expect(said.templates).toEqual([
      { name: 'house', version: '24.12.1', assets: 1, missing: ['music.mp3'] }
    ])
  })

  it('take in an archive sent from the computer, and answer with the templates as they now are', async () => {
    const archive = zipSync({
      'club/club.kdenlive': strToU8(project),
      'club/audio/music.mp3': strToU8('m')
    })

    const { status, said } = await send('club.zip', archive)

    expect(status).toBe(200)
    expect(said.template).toMatchObject({ name: 'club', missing: [] })
    expect(said.templates.map((t: { name: string }) => t.name)).toEqual(['club', 'house'])
  })

  it('say why when an archive is refused', async () => {
    const { status, said } = await send('house.zip', zipSync({ 'h/h.kdenlive': strToU8(project) }))

    expect(status).toBe(422)
    expect(said).toEqual({
      ok: false,
      error: 'There is already a template called house — give this one another name.'
    })
  })
})
