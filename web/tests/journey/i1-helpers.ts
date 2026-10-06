import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import type { Page } from 'playwright'
import type { World } from './app'
import type { Journey } from './harness'
import { WHO } from './media'
import { readJson } from './record'
import { details, dialogNamed, place } from './steps'

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

const putTemplate = (world: World, name: string, options: { music?: boolean } = {}) => {
  const folder = path.join(world.computer, name)
  fs.mkdirSync(path.join(folder, 'sounds'), { recursive: true })
  fs.writeFileSync(path.join(folder, `${name}.kdenlive`), templateProject('song.mp3'))
  if (options.music !== false) fs.writeFileSync(path.join(folder, 'sounds', 'song.mp3'), 'music')
  return folder
}

const seedMoments = (world: World) => {
  const file = path.join(world.output, 'manifest.json')
  const record = z
    .looseObject({ files: z.array(z.looseObject({ filename: z.string() })) })
    .parse(readJson(world, 'manifest.json'))
  for (const clip of record.files)
    if (/^DJI_2026090609(00|03)00_000[67]_D\.MP4$/.test(clip.filename))
      clip.moments = { exit: 1, opening: 2, landing: 3 }
  fs.writeFileSync(file, JSON.stringify(record))
}

const seedTrim = (world: World, groupId = 'group_1') => {
  const file = path.join(world.output, 'groups.json')
  const record = z
    .object({
      groups: z.array(z.looseObject({ id: z.string(), files: z.array(z.looseObject({})) }))
    })
    .parse(readJson(world, 'groups.json'))
  const first = record.groups.find((g) => g.id === groupId)?.files[0]
  if (first) first.cropStart = 1
  fs.writeFileSync(file, JSON.stringify(record))
}

const nameFile = async (page: Page, filename: string, name: string) => {
  await page
    .getByRole('button', { name: new RegExp(`^Pick ${filename}`) })
    .getByRole('button', { name: 'Pick' })
    .click()
  await details(page)
    .getByRole('button', { name: /Make a montage/ })
    .click()
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.keyboard.press('Enter')
  await place(page, name).click()
  await page.getByRole('heading', { name, level: 1 }).waitFor()
}

const nameJump = async (page: Page, jump: string, name: string) => {
  await page.getByText(jump, { exact: true }).first().click()
  await page.getByRole('button', { name: /Make a montage/ }).click()
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.keyboard.press('Enter')
}

const takeStep = async (page: Page, button: string, offered: string) => {
  await page.getByRole('button', { name: button, exact: true }).click()
  await page.getByText(offered).first().waitFor({ timeout: 60_000 })
}

const makeAndPrepare = async (j: Journey) => {
  await j.open()
  await j.see('Jump 2')
  await nameJump(j.page, 'Jump 2', WHO)
  await j.see('Prepare the files')
  await takeStep(j.page, 'Process', 'Make the editing project')
}

const templatesDialog = (page: Page) => dialogNamed(page, 'Editing templates')

const bringTemplate = async (page: Page, folder: string) => {
  const dialog = templatesDialog(page)
  const chooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: 'Choose the folder…' }).click()
  await (await chooser).setFiles(folder)
  return dialog
}

const makeProject = async (page: Page, folder: string) => {
  await page.getByRole('button', { name: 'Make the project' }).click()
  const dialog = templatesDialog(page)
  await dialog.waitFor()
  await bringTemplate(page, folder)
  await dialog.getByText('every file here').waitFor()
  await dialog.getByRole('button', { name: 'Make the montage' }).click()
  await page.getByRole('button', { name: 'Open in kdenlive' }).first().waitFor({ timeout: 30_000 })
}

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
  makeAndPrepare,
  makeProject,
  nameFile,
  nameJump,
  putEditor,
  putSlowFfmpeg,
  putTemplate,
  seedMoments,
  seedTrim,
  slowFfmpegEnv,
  takeStep,
  templatesDialog
}
