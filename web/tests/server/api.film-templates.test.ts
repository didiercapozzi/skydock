// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { action, loader } from '../../app/routes/api.film-templates'
import { createTmpDir, routeArgs } from './fixtures'

let dir: string
let was: string | undefined

beforeEach(() => {
  dir = createTmpDir('skydock-api-film-templates-')
  was = process.env.SKYDOCK_OUTPUT_DIR
  process.env.SKYDOCK_OUTPUT_DIR = dir
  process.env.SKYDOCK_CONFIG_DIR = dir
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  if (was === undefined) delete process.env.SKYDOCK_OUTPUT_DIR
  else process.env.SKYDOCK_OUTPUT_DIR = was
})

const template = {
  version: 1,
  length: 90,
  underSound: 0.2,
  texts: [],
  music: [{ name: 'Summer.mp3', from: 'start', at: 0, start: 0, end: 60, volume: 0.8 }]
}

const send = async (body: object) => {
  const request = new Request('http://localhost/api/film-templates', {
    method: 'POST',
    body: JSON.stringify(body)
  })
  return (await action(routeArgs(request))) as unknown as {
    ok?: boolean
    success?: boolean
    globalErrors?: string[]
  }
}

const listed = async () =>
  (await loader()).json() as Promise<{
    templates: { name: string }[]
    broken: string[]
    music: unknown[]
  }>

describe('the film templates', () => {
  it('are listed with the music the film editor offers', async () => {
    expect(await listed()).toEqual({ templates: [], broken: [], music: [], images: [] })
    await send({ intent: 'save', name: 'Club', template })
    expect((await listed()).templates).toEqual([
      { name: 'Club', template, missing: ['Summer.mp3'] }
    ])
  })

  it('are made, saved, renamed, duplicated and deleted through the form', async () => {
    expect(await send({ intent: 'create', name: 'Blank' })).toMatchObject({ ok: true })
    expect(await send({ intent: 'save', name: 'Club', template })).toMatchObject({ ok: true })
    expect(await send({ intent: 'save', name: 'Club', template, replace: true })).toMatchObject({
      ok: true
    })
    expect(await send({ intent: 'rename', name: 'Club', to: 'Team' })).toMatchObject({ ok: true })
    expect(await send({ intent: 'duplicate', name: 'Team' })).toMatchObject({ ok: true })
    expect(await send({ intent: 'delete', name: 'Blank' })).toMatchObject({ ok: true })
    expect((await listed()).templates.map((one) => one.name)).toEqual(['Team', 'Team copy'])
  })

  it('answer with the name as it was kept, and update only what is there', async () => {
    expect(await send({ intent: 'create', name: ' a/b ' })).toEqual({ ok: true, name: 'a b' })
    expect(await send({ intent: 'save', name: 'trip.zip', template })).toEqual({
      ok: true,
      name: 'trip.zip'
    })
    expect(await send({ intent: 'update', name: 'trip.zip', template })).toEqual({
      ok: true,
      name: 'trip.zip'
    })
    expect((await send({ intent: 'update', name: 'Gone', template })).globalErrors?.[0]).toBe(
      'There is no film template called Gone.'
    )
  })

  it('refuse a bad name, an unknown name and a template that is not valid with a sentence', async () => {
    const said = async (body: object) => (await send(body)).globalErrors?.[0]
    expect(await said({ intent: 'create', name: ' ' })).toBe('Give the film template a name.')
    expect(await said({ intent: 'create', name: 'x'.repeat(61) })).toBe(
      'Keep it under 60 characters.'
    )
    expect(await said({ intent: 'delete', name: 'Nobody' })).toBe(
      'There is no film template called Nobody.'
    )
    await send({ intent: 'create', name: 'Blank' })
    expect(await said({ intent: 'save', name: 'Blank', template })).toBe(
      'There is already a film template called Blank.'
    )
    expect((await send({ intent: 'save', name: 'Other', template: { version: 1 } })).success).toBe(
      false
    )
    expect(fs.existsSync(path.join(dir, 'film-templates', 'Other.film-template.json'))).toBe(false)
  })
})
