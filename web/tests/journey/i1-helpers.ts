import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect } from 'vitest'
import { z } from 'zod'
import type { Page } from 'playwright'
import type { World } from './app'
import type { Journey } from './harness'
import { editFile, WHO } from './media'
import { readJson } from './record'
import { details, place } from './steps'

const putEdit = (world: World, who = WHO) => {
  fs.mkdirSync(path.dirname(editFile(world, who)), { recursive: true })
  fs.writeFileSync(
    editFile(world, who),
    JSON.stringify({ version: 1, clips: [], music: [], texts: [], underSound: 0.15 })
  )
}

const makeEdit = async (j: Journey, who = WHO) => {
  putEdit(j.world, who)
  await expect
    .poll(async () => await place(j.page, who).innerText(), { timeout: 30_000 })
    .toContain('to render')
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
  await takeStep(j.page, 'Process', 'Edit the film')
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
  makeAndPrepare,
  makeEdit,
  nameFile,
  nameJump,
  putEdit,
  putSlowFfmpeg,
  seedMoments,
  seedTrim,
  slowFfmpegEnv,
  takeStep
}
