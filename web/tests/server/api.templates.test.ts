// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { action, loader } from '../../app/routes/api.templates'
import { createTmpDir, routeArgs } from './fixtures'

/* The editing templates, listed for the board and brought in from the computer: the project and the
   files it uses are handed over together, the way the board hands them over. */

const project = `<?xml version='1.0' encoding='utf-8'?>
<mlt root="/elsewhere">
 <chain id="chain0"><property name="resource">audio/music.mp3</property></chain>
 <playlist id="main_bin"><property name="kdenlive:docproperties.kdenliveversion">24.12.1</property></playlist>
</mlt>
`

let tmpDir: string
let previous: string | undefined

const send = (
  files: { filename: string; body: Uint8Array }[],
  said: Record<string, string> = {}
) => {
  const form = new FormData()
  for (const [key, value] of Object.entries(said)) form.set(key, value)
  for (const file of files) form.append('files', new File([Buffer.from(file.body)], file.filename))
  return action(
    routeArgs(new Request('http://localhost/api/templates', { method: 'POST', body: form }))
  ).then(async (res) => ({ status: res.status, said: await res.json() }))
}

const bytes = (text: string) => strToU8(text)

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
      { name: 'house', version: '24.12.1', assets: 1, missing: ['music.mp3'], byDefault: false }
    ])
  })

  it('take in an archive sent from the computer, and answer with the templates as they now are', async () => {
    const archive = zipSync({
      'club/club.kdenlive': strToU8(project),
      'club/audio/music.mp3': strToU8('m')
    })

    const { status, said } = await send([{ filename: 'club.zip', body: archive }])

    expect(status).toBe(200)
    expect(said.template).toMatchObject({ name: 'club', missing: [] })
    expect(said.templates.map((t: { name: string }) => t.name)).toEqual(['club', 'house'])
  })

  it('take in the project and the files it uses, chosen together', async () => {
    const { status, said } = await send([
      { filename: 'club.kdenlive', body: bytes(project) },
      { filename: 'music.mp3', body: bytes('m') }
    ])

    expect(status).toBe(200)
    expect(said.template).toMatchObject({ name: 'club', missing: [] })
    expect(fs.existsSync(path.join(tmpDir, 'templates', 'club', 'music.mp3'))).toBe(true)
  })

  it('say why when nothing brought in is a template', async () => {
    const { status, said } = await send([{ filename: 'notes.txt', body: bytes('x') }])

    expect(status).toBe(422)
    expect(said.ok).toBe(false)
    expect(said.error).toMatch(/no kdenlive project/)
  })

  it('are told which one is the usual, and say so from then on', async () => {
    const { status, said } = await send([], { byDefault: 'house' })

    expect(status).toBe(200)
    expect(said.templates.find((t: { name: string }) => t.name === 'house').byDefault).toBe(true)

    const after = await send([], { byDefault: '' })
    expect(after.said.templates.every((t: { byDefault: boolean }) => !t.byDefault)).toBe(true)
  })
})
