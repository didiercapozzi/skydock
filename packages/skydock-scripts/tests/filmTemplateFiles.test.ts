// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FilmTemplate } from '../src/filmTemplate'
import {
  createFilmTemplate,
  deleteFilmTemplate,
  duplicateFilmTemplate,
  listFilmTemplates,
  renameFilmTemplate,
  saveFilmTemplate,
  updateFilmTemplate
} from '../src/filmTemplateFiles'
import { listTemplates } from '../src/templates'
import { createTmpDir } from './fixtures'

let outputDir: string

beforeEach(() => {
  outputDir = createTmpDir('film-templates-')
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
})

const template: FilmTemplate = {
  version: 1,
  length: 90,
  underSound: 0.2,
  texts: [
    {
      text: '{name}',
      from: 'start',
      at: 0,
      seconds: 4,
      effect: 'fade',
      font: 'bold',
      x: 0.5,
      y: 0.5,
      size: 0.09,
      colour: '#ffffff'
    }
  ],
  music: [{ name: 'Summer.mp3', from: 'start', at: 0, start: 0, end: 60, volume: 0.8 }]
}

const folder = () => path.join(outputDir, 'film-templates')

describe('film template files', () => {
  it('saves a film template beside the music and lists it by name', async () => {
    await saveFilmTemplate({ outputDir, name: 'Club', template, replace: false })
    expect(fs.existsSync(path.join(folder(), 'Club.film-template.json'))).toBe(true)
    const [one] = (await listFilmTemplates(outputDir)).templates
    expect(one).toEqual({ name: 'Club', template, missing: ['Summer.mp3'] })
  })

  it('reports the music that is not in the music folder', async () => {
    fs.mkdirSync(path.join(outputDir, 'music'))
    fs.writeFileSync(path.join(outputDir, 'music', 'Summer.mp3'), 'x')
    await saveFilmTemplate({ outputDir, name: 'Club', template, replace: false })
    expect((await listFilmTemplates(outputDir)).templates[0]?.missing).toEqual([])
  })

  it('cleans the name and refuses an empty or a long one', async () => {
    expect(await saveFilmTemplate({ outputDir, name: ' a/b ', template, replace: false })).toBe(
      'a b'
    )
    await expect(
      saveFilmTemplate({ outputDir, name: '..', template, replace: false })
    ).rejects.toThrow('Give the film template a name.')
    await expect(
      saveFilmTemplate({ outputDir, name: 'x'.repeat(61), template, replace: false })
    ).rejects.toThrow('Keep it under 60 characters.')
  })

  it('refuses a name already there unless told to replace it', async () => {
    await saveFilmTemplate({ outputDir, name: 'Club', template, replace: false })
    await expect(
      saveFilmTemplate({ outputDir, name: 'Club', template, replace: false })
    ).rejects.toThrow('There is already a film template called Club.')
    await saveFilmTemplate({
      outputDir,
      name: 'Club',
      template: { ...template, length: 30 },
      replace: true
    })
    expect((await listFilmTemplates(outputDir)).templates[0]?.template.length).toBe(30)
  })

  it('makes an empty film template', async () => {
    await createFilmTemplate(outputDir, 'Blank')
    expect((await listFilmTemplates(outputDir)).templates[0]?.template).toEqual({
      version: 1,
      length: 60,
      underSound: 0.15,
      texts: [],
      music: []
    })
    await expect(createFilmTemplate(outputDir, 'Blank')).rejects.toThrow(
      'There is already a film template called Blank.'
    )
  })

  it('renames, duplicates under the next free name, and deletes', async () => {
    await saveFilmTemplate({ outputDir, name: 'Club', template, replace: false })
    await renameFilmTemplate(outputDir, 'Club', 'Team')
    expect(await duplicateFilmTemplate(outputDir, 'Team')).toBe('Team copy')
    expect(await duplicateFilmTemplate(outputDir, 'Team')).toBe('Team copy 2')
    expect((await listFilmTemplates(outputDir)).templates.map((t) => t.name)).toEqual([
      'Team',
      'Team copy',
      'Team copy 2'
    ])
    await expect(renameFilmTemplate(outputDir, 'Team', 'Team copy')).rejects.toThrow(
      'There is already a film template called Team copy.'
    )
    await expect(renameFilmTemplate(outputDir, 'Nobody', 'X')).rejects.toThrow(
      'There is no film template called Nobody.'
    )
    await deleteFilmTemplate(outputDir, 'Team copy')
    await expect(deleteFilmTemplate(outputDir, 'Team copy')).rejects.toThrow(
      'There is no film template called Team copy.'
    )
    expect((await listFilmTemplates(outputDir)).templates).toHaveLength(2)
  })

  it('passes over a file that is not a film template', async () => {
    await saveFilmTemplate({ outputDir, name: 'Club', template, replace: false })
    fs.writeFileSync(path.join(folder(), 'Bad.film-template.json'), '{"version":1}')
    fs.writeFileSync(path.join(folder(), 'notes.txt'), 'x')
    fs.writeFileSync(path.join(folder(), '.hidden.film-template.json'), JSON.stringify(template))
    expect((await listFilmTemplates(outputDir)).templates.map((t) => t.name)).toEqual(['Club'])
    expect(fs.existsSync(path.join(folder(), 'Bad.film-template.json'))).toBe(true)
  })

  it('lists a file that cannot be read as broken, so it can be deleted', async () => {
    fs.mkdirSync(folder(), { recursive: true })
    fs.writeFileSync(path.join(folder(), 'Bad.film-template.json'), '{"version":1}')
    fs.writeFileSync(path.join(folder(), 'Huge.film-template.json'), ' '.repeat(600_000))
    expect((await listFilmTemplates(outputDir)).broken).toEqual(['Bad', 'Huge'])
    await deleteFilmTemplate(outputDir, 'Bad')
    expect((await listFilmTemplates(outputDir)).broken).toEqual(['Huge'])
  })

  it('lets exactly one of two parallel creates of the same name win', async () => {
    const made = await Promise.allSettled([
      createFilmTemplate(outputDir, 'Club'),
      createFilmTemplate(outputDir, 'Club')
    ])
    expect(made.map((one) => one.status).sort()).toEqual(['fulfilled', 'rejected'])
    const to = await Promise.allSettled([
      saveFilmTemplate({ outputDir, name: 'Other', template, replace: false }),
      renameFilmTemplate(outputDir, 'Club', 'Other')
    ])
    expect(to.map((one) => one.status).sort()).toEqual(['fulfilled', 'rejected'])
  })

  it('updates only a film template that is still there', async () => {
    await expect(updateFilmTemplate(outputDir, 'Club', template)).rejects.toThrow(
      'There is no film template called Club.'
    )
    expect(fs.existsSync(folder())).toBe(false)
    await saveFilmTemplate({ outputDir, name: 'Club', template, replace: false })
    expect(await updateFilmTemplate(outputDir, 'Club', { ...template, length: 30 })).toBe('Club')
    expect((await listFilmTemplates(outputDir)).templates[0]?.template.length).toBe(30)
  })

  it('refuses names a file system cannot hold and a copy that is too long', async () => {
    for (const name of ['CON', 'nul', 'aux.2024', 'a.', 'a\u0001b'])
      await expect(createFilmTemplate(outputDir, name)).rejects.toThrow(
        'That name cannot be used for a file.'
      )
    await expect(createFilmTemplate(outputDir, '\u{1F600}'.repeat(60))).rejects.toThrow(
      'Keep it under 60'
    )
  })

  it('copies a name of the longest length under a shorter name', async () => {
    const long = 'x'.repeat(60)
    await createFilmTemplate(outputDir, long)
    expect(await duplicateFilmTemplate(outputDir, long)).toBe(`${'x'.repeat(50)} copy`)
  })

  it('copies a name with emoji without cutting one in half', async () => {
    const name = `a${'\u{1F600}'.repeat(29)}`
    await createFilmTemplate(outputDir, name)
    const copy = await duplicateFilmTemplate(outputDir, name)
    expect(() => encodeURIComponent(copy)).not.toThrow()
    expect(copy.endsWith(' copy')).toBe(true)
  })

  it('renames a film template to the same name in other letters', async () => {
    await saveFilmTemplate({ outputDir, name: 'Trip', template, replace: false })
    expect(await renameFilmTemplate(outputDir, 'Trip', 'trip')).toBe('trip')
    expect((await listFilmTemplates(outputDir)).templates.map((t) => t.name)).toEqual(['trip'])
  })

  it('never overwrites a film template whose name differs only by case', async () => {
    await saveFilmTemplate({ outputDir, name: 'Foo', template, replace: false })
    await saveFilmTemplate({
      outputDir,
      name: 'foo',
      template: { ...template, length: 30 },
      replace: false
    })
    const names = fs.readdirSync(folder())
    if (names.length === 2) {
      await expect(renameFilmTemplate(outputDir, 'Foo', 'foo')).rejects.toThrow('already')
      expect((await listFilmTemplates(outputDir)).templates).toHaveLength(2)
    }
  })

  it('keeps ".zip" and slashes out of the file name', async () => {
    expect(await createFilmTemplate(outputDir, 'Summer.zip')).toBe('Summer.zip')
    expect(await createFilmTemplate(outputDir, 'a/b')).toBe('a b')
  })

  it('leaves no stray file when a name is taken', async () => {
    await saveFilmTemplate({ outputDir, name: 'Trip', template, replace: false })
    await expect(createFilmTemplate(outputDir, 'Trip')).rejects.toThrow('already')
    expect(fs.readdirSync(folder())).toEqual(['Trip.film-template.json'])
  })

  it('leaves the editing templates alone', async () => {
    await saveFilmTemplate({ outputDir, name: 'Club', template, replace: false })
    expect((await listTemplates(outputDir)).templates).toEqual([])
  })
})
