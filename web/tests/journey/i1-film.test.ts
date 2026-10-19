import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { harness } from './harness'
import { filesUnder, filmFile, montageFolder, tool } from './media'
import { makeAndPrepare } from './i1-helpers'
import { dialogNamed } from './steps'

const j = harness({ name: 'i1-film', state: 'sorted', viewport: { width: 1440, height: 900 } })

const EDIT = 'luc_favre_20260906.edit.json'
const FIRST = 'luc_favre_20260906_090000.mp4'
const SECOND = 'luc_favre_20260906_090300.mp4'

const editor = () => j.page.getByRole('main', { name: 'Film editor' })

const savedEdit = () =>
  z
    .object({
      clips: z.array(
        z.object({
          name: z.string(),
          start: z.number(),
          end: z.number(),
          sound: z.boolean(),
          gap: z.number().optional(),
          fade: z.number().optional()
        })
      ),
      music: z.array(z.object({ name: z.string(), at: z.number() })),
      texts: z.array(z.object({ text: z.string() }))
    })
    .parse(JSON.parse(fs.readFileSync(path.join(montageFolder(j.world), EDIT), 'utf8')))

const lengthOf = (clip: { start: number; end: number }) => clip.end - clip.start

const endOnClock = async () =>
  Number(
    /\/ \d:(\d\d\.\d)$/.exec(
      await editor()
        .getByText(/^\d:\d\d\.\d \//)
        .innerText()
    )?.[1]
  )

const secondsOf = (file: string) =>
  Number(
    execFileSync(tool('ffprobe'), [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      file
    ]).toString()
  )

const pull = async (label: string, by: number) => {
  const box = await j.page.getByLabel(label).first().boundingBox()
  if (!box) throw new Error(`${label} is not on screen`)
  const y = box.y + box.height / 2
  await j.page.mouse.move(box.x + box.width / 2, y)
  await j.page.mouse.down()
  await j.page.mouse.move(box.x + box.width / 2 + by, y, { steps: 8 })
  await j.page.mouse.up()
}

describe('the film editor', () => {
  test('opens on a prepared montage with its clips laid end to end, and saves the edit beside them', async () => {
    await makeAndPrepare(j)
    await j.page.getByRole('button', { name: 'Edit the film' }).first().click()
    await editor().waitFor()
    expect(j.page.url()).toContain('/edit/')
    await editor().getByText(FIRST).first().waitFor()
    await expect.poll(() => filesUnder(montageFolder(j.world)), { timeout: 10_000 }).toContain(EDIT)
    expect(savedEdit().clips.map((clip) => clip.name)).toEqual([FIRST, SECOND])
    expect(savedEdit().texts.map((text) => text.text)).toEqual(['Luc Favre'])
  })

  test('trims a clip by its edge, and the clips after it close the gap', async () => {
    const before = lengthOf(savedEdit().clips[0]!)
    await pull('Trim the end', -80)
    await expect
      .poll(() => lengthOf(savedEdit().clips[0]!), { timeout: 10_000 })
      .toBeLessThan(before - 0.5)
    expect(savedEdit().clips.map((clip) => clip.name)).toEqual([FIRST, SECOND])
  })

  test('puts a clip in again with Add, at the end of the film', async () => {
    await editor().getByRole('button', { name: 'Add' }).first().click()
    await expect
      .poll(() => savedEdit().clips.map((clip) => clip.name), { timeout: 10_000 })
      .toEqual([FIRST, SECOND, FIRST])
    await editor().getByRole('button', { name: 'Remove', exact: true }).click()
    await expect
      .poll(() => savedEdit().clips.map((clip) => clip.name), { timeout: 10_000 })
      .toEqual([FIRST, SECOND])
  })

  test('cuts a clip at the playhead into two, and Undo makes it one again', async () => {
    await editor().getByRole('slider', { name: 'Timeline ruler' }).focus()
    await j.page.keyboard.press('ArrowRight')
    await editor().getByRole('button', { name: 'Cut at playhead' }).click()
    await expect
      .poll(() => savedEdit().clips.map((clip) => clip.name), { timeout: 10_000 })
      .toEqual([FIRST, FIRST, SECOND])
    await editor().getByRole('button', { name: 'Undo' }).click()
    await expect
      .poll(() => savedEdit().clips.map((clip) => clip.name), { timeout: 10_000 })
      .toEqual([FIRST, SECOND])
  })

  test('fades a clip in over the one before it with one click, which shortens the film, and a second click takes it off', async () => {
    const before = await endOnClock()
    await editor().getByTitle(`${SECOND} · double-click to choose the part`).click()
    const fade = editor().getByRole('button', { name: 'Fade in', exact: true })
    await fade.click()
    await expect.poll(() => savedEdit().clips[1]!.fade, { timeout: 10_000 }).toBeGreaterThan(0)
    await expect.poll(() => fade.getAttribute('aria-pressed')).toBe('true')
    await expect.poll(endOnClock).toBeCloseTo(before - savedEdit().clips[1]!.fade!, 1)
    await fade.click()
    await expect.poll(() => savedEdit().clips[1]!.fade, { timeout: 10_000 }).toBeUndefined()
    await expect.poll(() => fade.getAttribute('aria-pressed')).toBe('false')
    await expect.poll(endOnClock).toBeCloseTo(before, 1)
  })

  test('moves a clip with the keys, which leaves a gap before it, and the render keeps the gap', async () => {
    const before = await endOnClock()
    await editor().getByTitle(`${SECOND} · double-click to choose the part`).click()
    await j.page.keyboard.press('Alt+Shift+ArrowRight')
    await expect.poll(() => savedEdit().clips[1]!.gap, { timeout: 10_000 }).toBe(1)
    await expect.poll(endOnClock).toBeCloseTo(before + 1, 1)
  })

  test('chooses the part a clip shows in a window of its own, and keeps it', async () => {
    await editor().getByTitle(`${SECOND} · double-click to choose the part`).dblclick()
    const part = dialogNamed(j.page, `Choose the part of ${SECOND}`)
    await part.waitFor()
    await pull('Move the end', -150)
    await part.getByRole('button', { name: 'Use this part' }).click()
    await part.waitFor({ state: 'detached' })
    await expect.poll(() => savedEdit().clips[1]!.end, { timeout: 10_000 }).toBeLessThan(3.5)
  })

  test('brings music in from the computer, puts it in the film, and the saved edit carries it', async () => {
    const song = path.join(j.world.computer, 'Blue Sky.mp3')
    execFileSync(tool('ffmpeg'), [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=f=330:d=30',
      song
    ])
    await editor().getByRole('button', { name: 'Music', exact: true }).click()
    const chooser = j.page.waitForEvent('filechooser')
    await editor().getByText('Bring in music…').click()
    await (await chooser).setFiles(song)
    await editor().getByText('Blue Sky.mp3').first().waitFor()
    expect(fs.existsSync(path.join(j.world.output, 'music', 'Blue Sky.mp3'))).toBe(true)
    await editor().getByRole('button', { name: 'Add' }).first().click()
    await expect
      .poll(() => savedEdit().music.map((piece) => piece.name), { timeout: 10_000 })
      .toEqual(['Blue Sky.mp3'])
  })

  test('hears a clip whose speaker is turned on, and the music dips under it', async () => {
    await editor().getByText('Music 80%').waitFor()
    await editor().getByRole('button', { name: 'Hear this clip' }).first().click()
    await editor().getByText('Camera sound · music 12%').waitFor()
    await expect.poll(() => savedEdit().clips[0]!.sound, { timeout: 10_000 }).toBe(true)
  })

  test('adds a title from a preset, and the saved edit carries it', async () => {
    await editor().getByRole('button', { name: 'Text', exact: true }).click()
    await editor().getByRole('button', { name: 'Title', exact: true }).click()
    await expect
      .poll(() => editor().getByRole('textbox', { name: 'Text', exact: true }).inputValue())
      .toBe('Luc Favre')
    await expect
      .poll(() => savedEdit().texts.map((text) => text.text), { timeout: 10_000 })
      .toEqual(['Luc Favre', 'Luc Favre'])
  })

  test('keeps the titles and the music of the film as a film template, with the name as {name}', async () => {
    await editor().getByRole('button', { name: 'Film template…' }).click()
    const modal = dialogNamed(j.page, 'Film template')
    await modal.getByLabel('Name').fill('Club')
    await modal.getByRole('button', { name: 'Save', exact: true }).click()
    await modal.getByText('Saved as film template Club.').waitFor()
    const file = path.join(j.world.output, 'film-templates', 'Club.film-template.json')
    const kept = z
      .object({ texts: z.array(z.object({ text: z.string() })), music: z.array(z.object({})) })
      .parse(JSON.parse(fs.readFileSync(file, 'utf8')))
    expect(kept.texts.map((text) => text.text)).toEqual(['{name}', '{name}'])
    expect(kept.music).toHaveLength(1)
    await modal.getByTitle('Close (Esc)').click()
    await modal.waitFor({ state: 'hidden' })
  })

  test('plays the edit in the picture, and stops where it is', async () => {
    await editor().getByRole('button', { name: 'Play', exact: true }).click()
    await editor().getByRole('button', { name: 'Pause', exact: true }).waitFor()
    await j.page.waitForTimeout(800)
    await editor().getByRole('button', { name: 'Pause', exact: true }).click()
    expect(
      await editor()
        .getByText(/^\d:\d\d\.\d \/ /)
        .innerText()
    ).not.toMatch(/^0:00\.0 /)
  })

  test('plays and stops with Enter, even with a button focused by the mouse', async () => {
    const clock = () =>
      editor()
        .getByText(/^\d:\d\d\.\d \/ /)
        .innerText()
    const before = await clock()
    await j.page.keyboard.press('Enter')
    await editor().getByRole('button', { name: 'Pause', exact: true }).waitFor()
    await j.page.waitForTimeout(600)
    await j.page.keyboard.press('Enter')
    await editor().getByRole('button', { name: 'Play', exact: true }).waitFor()
    expect(await clock()).not.toBe(before)
  })

  test('renders the film into the montage’s folder, and the board takes it as the film', async () => {
    const length = savedEdit().clips.reduce(
      (total, clip) => total + (clip.gap ?? 0) + lengthOf(clip),
      0
    )
    await editor().getByRole('button', { name: 'Render the film' }).click()
    await editor().waitFor({ state: 'detached' })
    expect(j.page.url()).not.toContain('/edit/')
    await j.page.getByRole('button', { name: 'Upload…' }).first().waitFor({ timeout: 120_000 })
    expect(Math.abs(secondsOf(filmFile(j.world)) - length)).toBeLessThan(0.2)
    expect(filesUnder(montageFolder(j.world)).filter((file) => file.includes('rendering'))).toEqual(
      []
    )
    await j.quiet()
  })
})
