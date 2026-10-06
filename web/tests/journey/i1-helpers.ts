import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import type { Page } from 'playwright'
import type { World } from './app'
import type { harness } from './harness'
import { filesUnder, makeBigClip, makeClip } from './media'

/* What the chapters about making a montage and its editing project share: the editor that is only a
   program writing down what it was given, a template as the editor leaves it, the montage made and prepared
   from the saved `sorted` state, and the record read the way the app's own schema reads it. */

type Journey = ReturnType<typeof harness>

const WHO = 'Luc Favre'
/* what a montage of the second jump of the saved state is called on disk: the day it was shot, and the clips by their time */
const FILM = 'luc_favre_20260906.mp4'
const PROJECT = 'luc_favre_20260906.kdenlive'
const SIDE = 'aside[aria-label=Details]'

const montageFolder = (world: World, who = WHO) =>
  path.join(world.output, 'processed', 'Montages', who)

/* The editor SkyDock is told about is a program that writes down the arguments it was given, one line a
   call, beside the work folder. kdenlive itself is not here, and never started. */
const editorEnv = (world: World) => ({
  SKYDOCK_EDITOR_COMMAND: path.join(world.root, 'bin', 'editor.sh')
})

const putEditor = (world: World) => {
  const bin = path.join(world.root, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(
    path.join(bin, 'editor.sh'),
    `#!/bin/sh\necho "$@" >> "${path.join(world.root, 'editor.log')}"\n`,
    { mode: 0o755 }
  )
}

const editorCalls = (world: World) => {
  const log = path.join(world.root, 'editor.log')
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []
}

/* A template as somebody's machine made it: the project names its music where it sat there, and the music
   is beside it, in a folder of its own. */
const templateProject = (music: string) => `<?xml version='1.0' encoding='utf-8'?>
<mlt root="/nowhere">
 <profile frame_rate_num="25" frame_rate_den="1" width="1920" height="1080"/>
 <producer id="producer0"><property name="resource">black</property></producer>
 <producer id="music"><property name="resource">/home/them/club/${music}</property></producer>
 <playlist id="playlist0"><entry producer="music" in="0" out="2499"/></playlist>
 <tractor id="tractor0"><property name="kdenlive:audio_track">1</property><track hide="video" producer="playlist0"/></tractor>
 <playlist id="main_bin"><property name="kdenlive:docproperties.kdenliveversion">24.08.1</property></playlist>
 <tractor id="tractor5"><property name="kdenlive:uuid">{25cd7034-f98e-4260-b8b3-f34fd91e8906}</property><track producer="producer0"/><track producer="tractor0"/></tractor>
</mlt>
`

/* the folder kdenlive's Archive project leaves, put on the computer to be chosen: the project, and its music
   in a folder beside it — or left out, for a template with a hole in it */
const putTemplate = (world: World, name: string, options: { music?: boolean } = {}) => {
  const folder = path.join(world.computer, name)
  fs.mkdirSync(path.join(folder, 'sounds'), { recursive: true })
  fs.writeFileSync(path.join(folder, `${name}.kdenlive`), templateProject('song.mp3'))
  if (options.music !== false) fs.writeFileSync(path.join(folder, 'sounds', 'song.mp3'), 'music')
  return folder
}

const recordSchema = z.object({
  groups: z.array(
    z.looseObject({
      id: z.string(),
      files: z.array(
        z.looseObject({
          id: z.string(),
          cropStart: z.number().nullable().optional(),
          cropEnd: z.number().nullable().optional()
        })
      ),
      destination: z.string().optional(),
      passenger: z.object({ firstname: z.string(), lastname: z.string() }).optional(),
      processed: z.boolean().optional(),
      day: z.string().optional()
    })
  )
})

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'))

/* the jumps as the record holds them, read with the app's own shape */
const groupsOf = (world: World) =>
  recordSchema.parse(readJson(path.join(world.output, 'groups.json'))).groups

const manifestSchema = z.object({
  files: z.array(
    z.looseObject({
      id: z.string(),
      filename: z.string(),
      path: z.string(),
      cropStart: z.number().nullable().optional()
    })
  )
})

const manifestOf = (world: World) =>
  manifestSchema.parse(readJson(path.join(world.output, 'manifest.json')))

/* Where the jump is in two of the clips of the second jump, as a camera that wrote down what it felt would
   have left it. Put in the record before the app starts, the way a scan of such a card would have. */
const seedMoments = (world: World) => {
  const file = path.join(world.output, 'manifest.json')
  const record = z
    .looseObject({ files: z.array(z.looseObject({ filename: z.string() })) })
    .parse(readJson(file))
  for (const clip of record.files)
    if (/^DJI_2026090609(00|03)00_000[67]_D\.MP4$/.test(clip.filename))
      clip.moments = { exit: 1, opening: 2, landing: 3 }
  fs.writeFileSync(file, JSON.stringify(record))
}

/* A trim already on the first file of the destination's jump, as an earlier afternoon left it: the first
   second of the clip cut away. */
const seedTrim = (world: World, groupId = 'group_1') => {
  const file = path.join(world.output, 'groups.json')
  const record = z
    .object({
      groups: z.array(z.looseObject({ id: z.string(), files: z.array(z.looseObject({})) }))
    })
    .parse(readJson(file))
  const first = record.groups.find((g) => g.id === groupId)?.files[0]
  if (first) first.cropStart = 1
  fs.writeFileSync(file, JSON.stringify(record))
}

/* A file of Fresh files made a montage on its own, from its own panel: it is picked, named, and Enter saves it. */
const nameFile = async (page: Page, filename: string, name: string) => {
  await page
    .getByRole('button', { name: new RegExp(`^Pick ${filename}`) })
    .getByRole('button', { name: 'Pick' })
    .click()
  await page
    .locator(SIDE)
    .getByRole('button', { name: /Make a montage/ })
    .click()
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.keyboard.press('Enter')
  /* the board opens the new montage's page by itself, but not every time: the entry in the menu is where a
     person goes next */
  await page
    .getByRole('navigation', { name: 'Folders' })
    .getByRole('link', { name: new RegExp(name) })
    .click()
  await page.getByRole('heading', { name, level: 1 }).waitFor()
}

/* a jump of Fresh files opened and given a name from its own panel: Enter saves it */
const nameJump = async (page: Page, jump: string, name: string) => {
  await page.getByText(jump, { exact: true }).first().click()
  await page.getByRole('button', { name: /Make a montage/ }).click()
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.keyboard.press('Enter')
}

/* the montage's own button of the step it is at, pressed once it is offered */
const takeStep = async (page: Page, button: string, offered: string) => {
  await page.getByRole('button', { name: button, exact: true }).click()
  await page.getByText(offered).first().waitFor({ timeout: 60_000 })
}

/* The second jump made a montage of Luc Favre, and prepared. */
const makeAndPrepare = async (j: Journey) => {
  await j.open()
  await j.see('Jump 2')
  await nameJump(j.page, 'Jump 2', WHO)
  await j.see('Prepare the files')
  await takeStep(j.page, 'Process', 'Make the editing project')
}

/* the template brought in by choosing its folder, the way the dialog asks for it, and the project made from it */
const bringTemplate = async (page: Page, folder: string) => {
  const dialog = page.getByRole('dialog', { name: 'Editing templates' })
  const chooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: 'Choose the folder…' }).click()
  await (await chooser).setFiles(folder)
  return dialog
}

/* the project made from the one template there is: a folder is brought in, then the project is written and opened */
const makeProject = async (page: Page, folder: string) => {
  await page.getByRole('button', { name: 'Make the project' }).click()
  const dialog = page.getByRole('dialog', { name: 'Editing templates' })
  await dialog.waitFor()
  await bringTemplate(page, folder)
  await dialog.getByText('every file here').waitFor()
  await dialog.getByRole('button', { name: 'Make the montage' }).click()
  await page.getByRole('button', { name: 'Open in kdenlive' }).first().waitFor({ timeout: 30_000 })
}

/* The film the editor would have left: an mp4 under the name the project renders to, in the montage's folder. */
const renderFilm = (world: World, who = WHO, name = FILM, seconds = 3) =>
  makeClip(path.join(montageFolder(world, who), name), '2026-09-06T09:00:00', seconds)

/* The tool that makes small copies, slowed or broken on request: ffmpeg itself, after waiting while a file
   named `hold-copies` or `hold-proxies` is in the world, or refusing a small copy while `fail-proxies` is. What
   the app asks of its tools is the app's own; only how long they take, and whether they can, is up to the world. */
const putSlowFfmpeg = (world: World) => {
  const bin = path.join(world.root, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  const mark = (name: string) => path.join(world.root, name)
  fs.writeFileSync(
    path.join(bin, 'ffmpeg.sh'),
    `#!/bin/sh
case "$*" in
  *"/proxies/cut/"*) ;;
  *"/proxies/"*)
    while [ -e "${mark('hold-proxies')}" ]; do sleep 0.2; done
    if [ -e "${mark('fail-proxies')}" ]; then echo "no small copy today" >&2; exit 1; fi ;;
  *"/processed/"*)
    while [ -e "${mark('hold-copies')}" ]; do sleep 0.2; done ;;
esac
exec ffmpeg "$@"
`,
    { mode: 0o755 }
  )
}

const slowFfmpegEnv = (world: World) => ({
  SKYDOCK_FFMPEG_PATH: path.join(world.root, 'bin', 'ffmpeg.sh')
})

export {
  bringTemplate,
  editorCalls,
  editorEnv,
  filesUnder,
  FILM,
  groupsOf,
  makeAndPrepare,
  makeBigClip,
  makeProject,
  manifestOf,
  montageFolder,
  nameFile,
  nameJump,
  PROJECT,
  putEditor,
  putSlowFfmpeg,
  putTemplate,
  renderFilm,
  seedMoments,
  seedTrim,
  SIDE,
  slowFfmpegEnv,
  takeStep,
  WHO
}
export type { Journey }
