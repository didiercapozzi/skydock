import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Page } from 'playwright'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { harness } from './harness'
import {
  editorCalls,
  editorEnv,
  FILM,
  filesUnder,
  makeAndPrepare,
  montageFolder,
  PROJECT,
  putEditor,
  putTemplate,
  seedMoments
} from './i1-helpers'

/* A processed montage is turned into an editing project made from a template, and kdenlive is opened on it.
   kdenlive is not here: the editor SkyDock is told about is a program that writes down what it was given. */

const j = harness({
  name: 'i1-project',
  state: 'sorted',
  prepare: (world) => {
    seedMoments(world)
    putEditor(world)
    putTemplate(world, 'club')
  },
  env: editorEnv
})
const { quiet } = j

let stale: Page | undefined
const projectFile = () => path.join(montageFolder(j.world), PROJECT)
const markersSchema = z.array(
  z.object({ comment: z.string(), pos: z.number(), duration: z.number(), type: z.number() })
)

describe('the editing project', () => {
  test('says there is no template to make a project from, and where to put one, while none was brought in', async () => {
    await makeAndPrepare(j)
    /* a second board, opened now and cut off from what the server tells boards: it keeps the button after the
       project is made, as a board left open in another window would */
    stale = await (await j.context.browser()!.newContext()).newPage()
    await stale.route('**/api/events*', (route) => route.abort())
    await stale.goto(`${j.app.url}/fresh`)
    await stale
      .getByRole('navigation', { name: 'Folders' })
      .getByRole('link', { name: /Luc Favre/ })
      .click()
    await stale.getByRole('button', { name: 'Make the project' }).waitFor()
    let asked = false
    await stale.route('**/*.data*', (route) => {
      if (route.request().method() === 'POST') asked = true
      return route.request().method() === 'GET' && !asked ? route.abort() : route.continue()
    })
    await j.page.getByRole('button', { name: 'Make the project' }).click()
    const dialog = j.page.getByRole('dialog', { name: 'Editing templates' })
    await dialog.getByText('No template yet — bring one in below.').waitFor()
    await dialog.getByText('Bring a template in').waitFor()
    expect(fs.existsSync(projectFile())).toBe(false)
    expect(editorCalls(j.world)).toEqual([])
    await quiet()
  })

  test('makes the project from the template brought in, and opens the editor on it', async () => {
    const dialog = j.page.getByRole('dialog', { name: 'Editing templates' })
    const chooser = j.page.waitForEvent('filechooser')
    await dialog.getByRole('button', { name: 'Choose the folder…' }).click()
    await (await chooser).setFiles(path.join(j.world.computer, 'club'))
    await dialog.getByText('every file here').waitFor()
    await dialog.getByRole('button', { name: 'Make the montage' }).click()
    await j.page
      .getByRole('button', { name: 'Open in kdenlive' })
      .first()
      .waitFor({ timeout: 30_000 })

    /* named after the montage, in its folder; the editor was handed that file and no other */
    expect(fs.existsSync(projectFile())).toBe(true)
    await expect.poll(() => editorCalls(j.world)).toEqual([projectFile()])
    await j.page.getByText(/Montage ready — 2 clips in the bin/).waitFor()
    await quiet()
  })

  test('lays the clips whole in the bin in the order shot, each playing from its proxy, and leaves the template’s timeline as it was', async () => {
    const xml = fs.readFileSync(projectFile(), 'utf8')
    const chains = [...xml.matchAll(/<chain id="(chain_skydock_\d)">([\s\S]*?)<\/chain>/g)]
    expect(chains.map((c) => c[1])).toEqual(['chain_skydock_0', 'chain_skydock_1'])
    const property = (body: string, name: string) =>
      new RegExp(`<property name="${name}">([^<]*)</property>`).exec(body)?.[1]
    const copies = ['luc_favre_20260906_090000.mp4', 'luc_favre_20260906_090300.mp4']
    for (const [i, [, , body]] of chains.entries()) {
      const copy = path.join(montageFolder(j.world), 'videos', copies[i]!)
      /* the edit is of the real copy, which the editor renders from; what plays is its proxy */
      expect(property(body!, 'kdenlive:originalurl')).toBe(copy)
      expect(property(body!, 'resource')).toBe(property(body!, 'kdenlive:proxy'))
      expect(property(body!, 'resource')).toContain(`${path.sep}proxies${path.sep}`)
      expect(fs.existsSync(property(body!, 'resource')!)).toBe(true)
    }
    /* the bin holds them, whole: no in or out on its entries, and the photo is not in it */
    expect(xml).toContain('<entry producer="chain_skydock_0"/>')
    expect(xml).toContain('<entry producer="chain_skydock_1"/>')
    expect(xml).not.toContain('090130')
    /* nothing added to the timeline: the template's own playlist and its two tracks, and no clip on them */
    expect((xml.match(/<entry producer="chain_skydock/g) ?? []).length).toBe(2)
    expect(
      /<playlist id="playlist0">\s*<entry producer="music" in="0" out="2499"\/>\s*<\/playlist>/.test(
        xml
      )
    ).toBe(true)
    expect(
      /<tractor id="tractor5">[\s\S]*?<track producer="producer0"\/>[\s\S]*?<track producer="tractor0"\/>[\s\S]*?<\/tractor>/.test(
        xml
      )
    ).toBe(true)
    /* the template's music is its own, found beside the project and said by where it is now */
    expect(xml).toContain(path.join(j.world.output, 'templates', 'club', 'sounds', 'song.mp3'))
    /* where the film goes and in what format */
    expect(xml).toContain(
      `<property name="kdenlive:docproperties.renderurl">${path.join(montageFolder(j.world), FILM)}</property>`
    )
    expect(xml).toContain(
      '<property name="kdenlive:docproperties.renderprofile">MP4-H264/AAC</property>'
    )
    await quiet()
  })

  test('marks the jump on each clip as markers of its own, and lays none along the timeline', async () => {
    const xml = fs.readFileSync(projectFile(), 'utf8')
    const marks = [
      ...xml.matchAll(/<property name="kdenlive:markers">([\s\S]*?)<\/property>/g)
    ].map((m) => markersSchema.parse(JSON.parse(m[1]!.replaceAll('&quot;', '"'))))
    /* the exit, the opening and the ground, named as the board names them, a second apart at 25 frames a second */
    expect(marks).toHaveLength(2)
    for (const own of marks)
      expect(own.map(({ comment, pos }) => [comment, pos])).toEqual([
        ['exit', 25],
        ['opening', 50],
        ['ground', 75]
      ])
    expect(/guides|kdenlive:sequenceproperties\.guides/.test(xml)).toBe(false)
    /* and every clip in the bin is whole: the copies are the clips, with nothing cut out of them */
    expect(filesUnder(path.join(montageFolder(j.world), 'videos'))).toHaveLength(2)
    await quiet()
  })

  test('says its step is the film now, and offers the way back into the project', async () => {
    await expect
      .poll(
        async () =>
          await j.page
            .getByRole('navigation', { name: 'Folders' })
            .getByRole('link', { name: /Luc Favre/ })
            .innerText()
      )
      .toContain('to render')
    await j.page
      .getByRole('img', { name: /3 of 6 steps done/ })
      .first()
      .waitFor()
    await j.page.getByRole('button', { name: 'Open in kdenlive' }).first().click()
    await expect.poll(() => editorCalls(j.world)).toEqual([projectFile(), projectFile()])
    await quiet()
  })
})

describe('the project is made once', () => {
  test('refuses to make a second project for a montage that has one, and the edit is left as it was', async () => {
    const before = fs.readFileSync(projectFile(), 'utf8')
    await stale!.getByRole('button', { name: 'Make the project' }).click()
    await stale!
      .getByText(/already has a project/)
      .first()
      .waitFor()
    expect(fs.readFileSync(projectFile(), 'utf8')).toBe(before)
    expect(editorCalls(j.world)).toHaveLength(2)
    await stale!.close()
    await quiet()
  })
})
