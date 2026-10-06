import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import type { World } from './app'
import {
  bringTemplate,
  editorCalls,
  editorEnv,
  nameFile,
  nameJump,
  putEditor,
  putTemplate,
  templatesDialog
} from './i1-helpers'
import { filesUnder, montageFolder } from './media'

/* A template is somebody's folder, brought in from the computer, owned by the folder's owner from then on,
   and chosen — never silently — for each montage's project. SkyDock ships with none. The output folder
   belongs to the person on the host, as it does when SkyDock runs as root in a container. */

const HOST_USER = 1000

const put = (world: World, ...parts: string[]) => {
  const file = path.join(world.computer, ...parts)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  return file
}

const j = harness({
  name: 'i1-templates',
  state: 'sorted',
  prepare: (world) => {
    putEditor(world)
    putTemplate(world, 'club')
    putTemplate(world, 'zeta', { music: false })
    /* the same name brought again, with other music */
    const second = path.join(world.computer, 'again', 'club')
    fs.mkdirSync(path.join(second, 'sounds'), { recursive: true })
    fs.writeFileSync(
      path.join(second, 'club.kdenlive'),
      fs
        .readFileSync(path.join(world.computer, 'zeta', 'zeta.kdenlive'), 'utf8')
        .replace('song.mp3', 'other.mp3')
    )
    fs.writeFileSync(path.join(second, 'sounds', 'other.mp3'), 'other music')
    /* one archive, packed the way kdenlive's Archive project packs it, and the project with its music one by one */
    const packed = path.join(world.root, 'packed')
    fs.mkdirSync(path.join(packed, 'audio'), { recursive: true })
    fs.writeFileSync(
      path.join(packed, 'packed.kdenlive'),
      fs
        .readFileSync(path.join(world.computer, 'zeta', 'zeta.kdenlive'), 'utf8')
        .replace('song.mp3', 'jingle.mp3')
    )
    fs.writeFileSync(path.join(packed, 'audio', 'jingle.mp3'), 'jingle')
    execFileSync('tar', ['czf', path.join(world.computer, 'packed.tar.gz'), '-C', packed, '.'])
    fs.copyFileSync(path.join(packed, 'packed.kdenlive'), put(world, 'loose', 'solo.kdenlive'))
    fs.copyFileSync(path.join(packed, 'audio', 'jingle.mp3'), put(world, 'loose', 'jingle.mp3'))
    /* an archive that names a way out of the folder it is unpacked into */
    fs.writeFileSync(path.join(world.root, 'outside.kdenlive'), 'x')
    execFileSync('tar', [
      'czf',
      path.join(world.computer, 'evil.tar.gz'),
      '--transform',
      's,^,../,',
      '-C',
      world.root,
      'outside.kdenlive'
    ])
    fs.chownSync(world.output, HOST_USER, HOST_USER)
  },
  env: editorEnv
})
const { quiet, see } = j

const templates = () => path.join(j.world.output, 'templates')
const read = (...parts: string[]) => fs.readFileSync(path.join(templates(), ...parts), 'utf8')

const openTemplates = async () => {
  await j.page.getByRole('button', { name: 'Settings' }).click()
  await j.page.getByRole('button', { name: 'Templates…' }).click()
  await templatesDialog(j.page).waitFor()
}

const closeDialog = async () => {
  await templatesDialog(j.page).getByRole('button', { name: 'Close' }).click()
  await templatesDialog(j.page).waitFor({ state: 'detached' })
}

/* the first jump of Fresh files, named Anna Roux and prepared, ready for its project */
const prepareAnna = async () => {
  await j.page.getByRole('link', { name: /^Fresh files/ }).click()
  await nameJump(j.page, 'Jump 1', 'Anna Roux')
  await j.page.getByRole('button', { name: 'Process', exact: true }).click()
  await j.page.getByText('Make the editing project').first().waitFor({ timeout: 60_000 })
}

const projectOf = (who: string) =>
  filesUnder(montageFolder(j.world, who)).find((f) => f.endsWith('.kdenlive'))

describe('templates', () => {
  test('has none to offer until one is brought in, as SkyDock ships with none', async () => {
    await j.open()
    await see('Jump 2')
    await openTemplates()
    await templatesDialog(j.page).getByText('No template yet — bring one in below.').waitFor()
    expect(fs.existsSync(templates())).toBe(false)
    await closeDialog()
    await quiet()
  })

  test('keeps a template with a file missing, names what is missing straight away, and shows it before a project is made from it even as the only one', async () => {
    await prepareAnna()
    await openTemplates()
    await bringTemplate(j.page, path.join(j.world.computer, 'zeta'))
    await templatesDialog(j.page)
      .getByText(/1 file it uses is not here: song\.mp3/)
      .waitFor()
    /* left exactly as its owner wrote it: nobody brought the music, so it stays named where it was */
    expect(read('zeta', 'zeta.kdenlive')).toContain('/home/them/club/song.mp3')
    await closeDialog()

    await j.page.getByRole('button', { name: 'Make the project' }).click()
    await templatesDialog(j.page)
      .getByText(/1 file it uses is not here: song\.mp3/)
      .waitFor()
    expect(projectOf('Anna Roux')).toBeUndefined()
    await closeDialog()
    await quiet()
  })

  test('brings in the whole folder the editor left, and points the project at the music that came with it', async () => {
    await openTemplates()
    await bringTemplate(j.page, path.join(j.world.computer, 'club'))
    await templatesDialog(j.page).getByText('every file here').waitFor()
    expect(await templatesDialog(j.page).innerText()).toContain('kdenlive 24.08.1')
    /* each file the project names is now said by its way from the project, whatever machine made it */
    const project = read('club', 'club.kdenlive')
    expect(project).toContain('<property name="resource">sounds/song.mp3</property>')
    expect(project).not.toContain('/home/them')
    expect(filesUnder(path.join(templates(), 'club'))).toEqual(['club.kdenlive', 'sounds/song.mp3'])
    await quiet()
  })

  test('leaves what the archive brought readable and writable by anyone, so the editor can open every file', async () => {
    for (const file of ['club', 'club/club.kdenlive', 'club/sounds', 'club/sounds/song.mp3'])
      expect(fs.statSync(path.join(templates(), file)).mode & 0o006, file).toBe(0o006)
    await quiet()
  })

  test('leaves what the archive brought owned by the owner of the output folder', async () => {
    for (const file of ['club', 'club/club.kdenlive', 'club/sounds', 'club/sounds/song.mp3'])
      expect(fs.statSync(path.join(templates(), file)).uid, file).toBe(HOST_USER)
  })

  test('replaces a template brought in again under a name already there, files and all', async () => {
    await bringTemplate(j.page, path.join(j.world.computer, 'again', 'club'))
    await expect
      .poll(() => filesUnder(path.join(templates(), 'club')))
      .toEqual(['club.kdenlive', 'sounds/other.mp3'])
    expect(read('club', 'club.kdenlive')).toContain('sounds/other.mp3')
    await expect
      .poll(() => fs.readdirSync(templates()).filter((n) => n.startsWith('.')))
      .toEqual([])
    await quiet()
  })

  test('takes a template packed as one archive, or the project and its files picked one by one, named after what it was', async () => {
    const chooser = j.page.waitForEvent('filechooser')
    await templatesDialog(j.page).getByRole('button', { name: 'Choose files instead…' }).click()
    await (await chooser).setFiles(path.join(j.world.computer, 'packed.tar.gz'))
    await expect
      .poll(() => fs.existsSync(path.join(templates(), 'packed', 'packed.kdenlive')))
      .toBe(true)
    expect(read('packed', 'packed.kdenlive')).toContain('audio/jingle.mp3')

    const second = j.page.waitForEvent('filechooser')
    await templatesDialog(j.page).getByRole('button', { name: 'Choose files instead…' }).click()
    await (
      await second
    ).setFiles([
      path.join(j.world.computer, 'loose', 'solo.kdenlive'),
      path.join(j.world.computer, 'loose', 'jingle.mp3')
    ])
    await expect
      .poll(() => filesUnder(path.join(templates(), 'solo')))
      .toEqual(['jingle.mp3', 'solo.kdenlive'])
    expect(read('solo', 'solo.kdenlive')).toContain(
      '<property name="resource">jingle.mp3</property>'
    )
    await quiet()
  })

  test('refuses an archive that names its way out of the folder, and leaves nothing half-arrived', async () => {
    const before = fs.readdirSync(templates()).sort()
    const chooser = j.page.waitForEvent('filechooser')
    await templatesDialog(j.page).getByRole('button', { name: 'Choose files instead…' }).click()
    await (await chooser).setFiles(path.join(j.world.computer, 'evil.tar.gz'))
    await templatesDialog(j.page).getByRole('alert').waitFor()
    expect(await templatesDialog(j.page).getByRole('alert').innerText()).toMatch(/outside/)
    expect(fs.readdirSync(templates()).sort()).toEqual(before)
    await closeDialog()
    await quiet()
  })
})

describe('choosing a template', () => {
  test('never decides which one a project is made from while several are there: nothing is made until one is picked', async () => {
    await j.page.getByRole('button', { name: 'Make the project' }).click()
    await templatesDialog(j.page).waitFor()
    const make = templatesDialog(j.page).getByRole('button', { name: 'Make the montage' })
    expect(await templatesDialog(j.page).getByRole('radio').count()).toBe(4)
    expect(await templatesDialog(j.page).getByRole('radio', { checked: true }).count()).toBe(0)
    expect(await make.isDisabled()).toBe(true)
    expect(projectOf('Anna Roux')).toBeUndefined()

    await templatesDialog(j.page).getByRole('radio', { name: /^club/ }).check()
    await make.click()
    await j.page
      .getByRole('button', { name: 'Open in kdenlive' })
      .first()
      .waitFor({ timeout: 30_000 })
    const project = projectOf('Anna Roux')!
    expect(
      fs.readFileSync(path.join(montageFolder(j.world, 'Anna Roux'), project), 'utf8')
    ).toContain(path.join(templates(), 'club', 'sounds', 'other.mp3'))
    await expect
      .poll(() => editorCalls(j.world))
      .toEqual([path.join(montageFolder(j.world, 'Anna Roux'), project)])
    await quiet()
  })

  test('ticks the one picked last time and still waits to be told, for the next montage', async () => {
    await j.page.getByRole('link', { name: /^Fresh files/ }).click()
    await nameFile(j.page, 'GX010001.MP4', 'Eva Roux')
    await j.page.getByRole('button', { name: 'Process', exact: true }).click()
    await j.page.getByText('Make the editing project').first().waitFor({ timeout: 60_000 })
    await j.page.getByRole('button', { name: 'Make the project' }).click()
    await templatesDialog(j.page).waitFor()
    await templatesDialog(j.page).getByRole('radio', { name: /^club/, checked: true }).waitFor()
    expect(projectOf('Eva Roux')).toBeUndefined()
    await quiet()
  })

  test('marks a template as the usual one, and takes the mark off the same way', async () => {
    await templatesDialog(j.page).getByRole('button', { name: 'Use by default' }).first().click()
    await templatesDialog(j.page).getByText('the usual one').waitFor()
    expect(fs.readFileSync(path.join(templates(), '.default'), 'utf8').trim()).toBe('club')
    await templatesDialog(j.page).getByRole('button', { name: 'Stop using by default' }).click()
    await expect.poll(() => fs.existsSync(path.join(templates(), '.default'))).toBe(false)
    await templatesDialog(j.page).getByRole('button', { name: 'Use by default' }).first().click()
    await templatesDialog(j.page).getByText('the usual one').waitFor()
    await closeDialog()
    expect(projectOf('Eva Roux')).toBeUndefined()
    await quiet()
  })

  test('makes a project from the usual one without asking anybody, however many templates there are', async () => {
    await j.page.getByRole('button', { name: 'Make the project' }).click()
    await j.page
      .getByRole('button', { name: 'Open in kdenlive' })
      .first()
      .waitFor({ timeout: 30_000 })
    expect(await templatesDialog(j.page).count()).toBe(0)
    expect(projectOf('Eva Roux')).toBeDefined()
  })
})
