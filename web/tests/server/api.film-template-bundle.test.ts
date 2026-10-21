// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { unzipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { action as importAction } from '../../app/routes/api.film-template-import'
import { loader as exportLoader } from '../../app/routes/api.film-template-export'
import { saveFilmTemplate } from '../../../packages/skydock-scripts/src/filmTemplateFiles'
import { createTmpDir, routeArgs } from './fixtures'

let dir: string
let was: string | undefined

beforeEach(() => {
  dir = createTmpDir('skydock-api-film-template-bundle-')
  was = process.env.SKYDOCK_OUTPUT_DIR
  process.env.SKYDOCK_OUTPUT_DIR = dir
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  if (was === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
  else process.env.SKYDOCK_OUTPUT_DIR = was
})

const template = {
  version: 1 as const,
  length: 90,
  underSound: 0.2,
  texts: [],
  music: [{ name: 'Summer.mp3', from: 'start' as const, at: 0, start: 0, end: 60, volume: 0.8 }]
}

const exported = async (name: string) => {
  fs.mkdirSync(path.join(dir, 'music'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'music', 'Summer.mp3'), 'a song')
  await saveFilmTemplate({ outputDir: dir, name, template, replace: false })
  return (await exportLoader(
    routeArgs(
      new Request(`http://localhost/api/film-template-export?name=${encodeURIComponent(name)}`)
    )
  )) as unknown as Response
}

describe('the export of a film template', () => {
  it('is a zip to download, named after the film template, with its music in it', async () => {
    const res = await exported('Épco & Co')

    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toContain(
      encodeURIComponent('Épco & Co.film-template.zip')
    )
    const names = Object.keys(unzipSync(new Uint8Array(await res.arrayBuffer()))).sort()
    expect(names).toEqual(['Épco & Co.film-template.json', 'music/Summer.mp3'].sort())
  })

  it('says so, and gives no zip, for a film template that is not there', async () => {
    const res = (await exportLoader(
      routeArgs(new Request('http://localhost/api/film-template-export?name=nope'))
    )) as unknown as Response

    expect(res.status).toBe(422)
    expect(((await res.json()) as { error: string }).error).toMatch(/cannot be read/)
  })
})

describe('the import of a film template', () => {
  const send = async (file: Blob | null, name = 'x.zip') => {
    const body = new FormData()
    if (file) body.append('file', new File([file], name))
    return (await importAction(
      routeArgs(new Request('http://localhost/api/film-template-import', { method: 'POST', body }))
    )) as unknown as Response
  }

  it('takes the zip of an export whole, with its music', async () => {
    const zip = new Uint8Array(await (await exported('epco')).arrayBuffer())
    fs.rmSync(path.join(dir, 'film-templates'), { recursive: true, force: true })
    fs.rmSync(path.join(dir, 'music'), { recursive: true, force: true })

    const res = await send(new Blob([zip]), 'epco.film-template.zip')

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, name: 'epco', added: 1 })
    expect(fs.readFileSync(path.join(dir, 'music', 'Summer.mp3'), 'utf-8')).toBe('a song')
    expect(fs.existsSync(path.join(dir, 'film-templates', 'epco.film-template.json'))).toBe(true)
  })

  it('asks for a zip when there is none, and refuses what is not one, changing nothing', async () => {
    expect((await send(null)).status).toBe(400)

    const refused = await send(new Blob(['not a zip']))

    expect(refused.status).toBe(422)
    expect(((await refused.json()) as { error: string }).error).toMatch(/not a zip/)
    expect(fs.existsSync(path.join(dir, 'film-templates'))).toBe(false)
  })
})
