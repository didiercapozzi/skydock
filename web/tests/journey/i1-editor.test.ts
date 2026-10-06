import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import { editorCalls, makeAndPrepare, putEditor, putTemplate, templatesDialog } from './i1-helpers'
import { montageFolder, PROJECT } from './media'

/* Which command opens the editor is told to SkyDock when it starts, and where SkyDock runs it may not be
   reachable at all. Here it is first a program that is not there, and then one that stops at once. */

let editor = '/nowhere/kdenlive'
const j = harness({
  name: 'i1-editor',
  state: 'sorted',
  prepare: (world) => {
    putEditor(world)
    putTemplate(world, 'club')
    /* a program that stops at once, saying why, for as long as this file is in the world */
    fs.writeFileSync(
      path.join(world.root, 'bin', 'broken.sh'),
      '#!/bin/sh\necho "no display to open a window on" >&2\nexit 3\n',
      { mode: 0o755 }
    )
  },
  env: () => ({ SKYDOCK_EDITOR_COMMAND: editor })
})
const { quiet } = j

const project = () => path.join(montageFolder(j.world), PROJECT)

describe('opening the editor', () => {
  test('says the editor cannot be reached, still makes the project, and offers its path to copy', async () => {
    await j.context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await makeAndPrepare(j)
    await j.page.getByRole('button', { name: 'Make the project' }).click()
    const dialog = templatesDialog(j.page)
    await dialog.waitFor()
    const chooser = j.page.waitForEvent('filechooser')
    await dialog.getByRole('button', { name: 'Choose the folder…' }).click()
    await (await chooser).setFiles(path.join(j.world.computer, 'club'))
    await dialog.getByText('every file here').waitFor()
    await dialog.getByRole('button', { name: 'Make the montage' }).click()

    await j.page
      .getByText(/is not on this machine — set SKYDOCK_EDITOR_COMMAND/)
      .first()
      .waitFor({ timeout: 30_000 })
    expect(fs.existsSync(project())).toBe(true)
    await j.page.getByRole('button', { name: 'More' }).click()
    await j.page.getByRole('button', { name: 'Copy the project’s path' }).click()
    await expect.poll(() => j.page.evaluate(() => navigator.clipboard.readText())).toBe(project())
    await quiet()
  })

  test('refuses to open a project in an editor that stops at once, and says why', async () => {
    editor = path.join(j.world.root, 'bin', 'broken.sh')
    await j.restart()
    await j.open()
    await j.page.getByRole('link', { name: /Luc Favre/ }).click()
    await j.page.getByRole('button', { name: 'Open in kdenlive' }).first().click()
    await j.page
      .getByText(/stopped straight away \(code 3\): no display to open a window on/)
      .first()
      .waitFor({ timeout: 30_000 })
    expect(editorCalls(j.world)).toEqual([])
    await quiet()
  })

  test('opens the project it was made with, in the editor it is told about, when that is one that runs', async () => {
    editor = path.join(j.world.root, 'bin', 'editor.sh')
    await j.restart()
    await j.open()
    await j.page.getByRole('link', { name: /Luc Favre/ }).click()
    await j.page.getByRole('button', { name: 'Open in kdenlive' }).first().click()
    await expect.poll(() => editorCalls(j.world)).toEqual([project()])
    await quiet()
  })
})
