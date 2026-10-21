// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FilmTemplate } from '../src/filmTemplate'
import { bundleFilmTemplate, importFilmTemplate } from '../src/filmTemplateBundle'
import { listFilmTemplates, saveFilmTemplate } from '../src/filmTemplateFiles'
import { createTmpDir } from './fixtures'

let from: string
let into: string

beforeEach(() => {
  from = createTmpDir('film-bundle-from-')
  into = createTmpDir('film-bundle-into-')
})

afterEach(() => {
  fs.rmSync(from, { recursive: true, force: true })
  fs.rmSync(into, { recursive: true, force: true })
})

const template: FilmTemplate = {
  version: 1,
  length: 90,
  underSound: 0.2,
  texts: [],
  layers: [
    { name: 'logo.png', from: 'start', at: 0, seconds: 5, x: 0.5, y: 0.5, width: 0.5 },
    { colour: '#000000', from: 'end', at: 5, seconds: 5, x: 0.5, y: 0.5, width: 1 }
  ],
  music: [{ name: 'song.mp3', from: 'start', at: 0, start: 0, end: 30, volume: 0.5 }]
}

const put = (root: string, folder: string, name: string, bytes: string) => {
  fs.mkdirSync(path.join(root, folder), { recursive: true })
  fs.writeFileSync(path.join(root, folder, name), bytes)
}

const exported = async (name = 'epco') => {
  put(from, 'images', 'logo.png', 'a picture')
  put(from, 'images', 'other.png', 'a picture the template does not use')
  put(from, 'music', 'song.mp3', 'a song')
  await saveFilmTemplate({ outputDir: from, name, template, replace: false })
  return bundleFilmTemplate(from, name)
}

describe('exporting a film template with its files', () => {
  it('holds the template, and only the pictures and the music it names', async () => {
    const { zip, file, missing } = await exported()

    expect(file).toBe('epco.film-template.zip')
    expect(missing).toEqual([])
    expect(Object.keys(unzipSync(zip)).sort()).toEqual([
      'epco.film-template.json',
      'images/logo.png',
      'music/song.mp3'
    ])
  })

  it('says which file it names is not in the folder any more, and exports the rest', async () => {
    put(from, 'music', 'song.mp3', 'a song')
    await saveFilmTemplate({ outputDir: from, name: 'epco', template, replace: false })

    const { zip, missing } = await bundleFilmTemplate(from, 'epco')

    expect(missing).toEqual(['logo.png'])
    expect(Object.keys(unzipSync(zip)).sort()).toEqual([
      'epco.film-template.json',
      'music/song.mp3'
    ])
  })
})

describe('importing the zip of a film template', () => {
  it('keeps the template, puts the pictures and the music where the editor finds them', async () => {
    const { zip } = await exported()

    const made = await importFilmTemplate(into, zip)

    expect(made).toMatchObject({ name: 'epco', renamed: false, added: 2, kept: [], missing: [] })
    expect(fs.readFileSync(path.join(into, 'images', 'logo.png'), 'utf-8')).toBe('a picture')
    expect(fs.readFileSync(path.join(into, 'music', 'song.mp3'), 'utf-8')).toBe('a song')
    expect(fs.existsSync(path.join(into, 'images', 'other.png'))).toBe(false)
    const listed = await listFilmTemplates(into)
    expect(listed.templates.map((one) => [one.name, one.missing])).toEqual([['epco', []]])
  })

  it('never goes over a film template of the same name: it is kept as the next free one', async () => {
    const { zip } = await exported()
    await importFilmTemplate(into, zip)

    const again = await importFilmTemplate(into, zip)

    expect(again).toMatchObject({ name: 'epco 2', renamed: true, added: 0, there: 2 })
    expect((await listFilmTemplates(into)).templates.map((one) => one.name).sort()).toEqual([
      'epco',
      'epco 2'
    ])
  })

  it('leaves a picture that is there already as another file, and says so', async () => {
    const { zip } = await exported()
    put(into, 'images', 'logo.png', 'my own logo, which is longer')

    const made = await importFilmTemplate(into, zip)

    expect(made.kept).toEqual(['logo.png'])
    expect(fs.readFileSync(path.join(into, 'images', 'logo.png'), 'utf-8')).toBe(
      'my own logo, which is longer'
    )
  })

  it('takes nothing that is not a picture or a piece of music in its own folder, nor a path out of it', async () => {
    const { zip } = await exported()
    const entries = unzipSync(zip)
    const sneaky = zipSync({
      'epco.film-template.json': entries['epco.film-template.json']!,
      'images/../evil.png': new Uint8Array([1]),
      'images/logo.png': new Uint8Array([1, 2]),
      '../escape.mp3': new Uint8Array([1]),
      'music/song.mp3': new TextEncoder().encode('song.exe')
    })

    const made = await importFilmTemplate(into, sneaky)

    expect(made.added).toBe(2)
    expect(fs.existsSync(path.join(into, 'evil.png'))).toBe(false)
    expect(fs.existsSync(path.join(path.dirname(into), 'escape.mp3'))).toBe(false)
    expect(fs.readdirSync(path.join(into, 'images'))).toEqual(['logo.png'])
  })

  it('says which file it names is not in the zip', async () => {
    const { zip } = await exported()
    const entries = unzipSync(zip)
    delete entries['images/logo.png']

    const made = await importFilmTemplate(into, zipSync(entries))

    expect(made.missing).toEqual(['logo.png'])
    expect((await listFilmTemplates(into)).templates[0]?.missing).toBeDefined()
  })

  it('refuses what is not a zip, a zip with no film template and a film template that cannot be read', async () => {
    await expect(importFilmTemplate(into, new TextEncoder().encode('not a zip'))).rejects.toThrow(
      'not a zip SkyDock can read'
    )
    await expect(
      importFilmTemplate(into, zipSync({ 'notes.txt': new TextEncoder().encode('hello') }))
    ).rejects.toThrow('holds no film template')
    await expect(
      importFilmTemplate(
        into,
        zipSync({ 'epco.film-template.json': new TextEncoder().encode('{"version":2}') })
      )
    ).rejects.toThrow('cannot be read')
    expect((await listFilmTemplates(into)).templates).toEqual([])
  })
})
