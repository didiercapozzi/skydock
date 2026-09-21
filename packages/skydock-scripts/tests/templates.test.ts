// @vitest-environment node
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { availableTemplates } from '../src/montage'
import { importTemplate, listTemplates } from '../src/templates'
import { createTmpDir } from './fixtures'

/* A template is brought in from a kdenlive archive — the project with the music, logos and titles
   it uses — and every file it names is looked for once it is in. Real archives, really unpacked:
   what matters is what ends up on the disk. */

const project = (version = '24.12.1') => `<?xml version='1.0' encoding='utf-8'?>
<mlt root="/home/someone/elsewhere">
 <chain id="chain0"><property name="resource">audio/music.mp3</property></chain>
 <producer id="producer0"><property name="resource"/><property name="xmldata">&lt;kdenlivetitle&gt;&lt;content url="images/logo.png"/&gt;&lt;/kdenlivetitle&gt;</property></producer>
 <playlist id="main_bin"><property name="kdenlive:docproperties.kdenliveversion">${version}</property></playlist>
</mlt>
`

let outputDir: string
let incoming: string

/* an archive as the editor packs one: a folder holding the project and what it uses */
const zipOf = (files: Record<string, string>) => {
  const target = path.join(incoming, 'club.zip')
  fs.writeFileSync(
    target,
    zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])))
  )
  return target
}

const whole = {
  'club/club.kdenlive': project(),
  'club/audio/music.mp3': 'm',
  'club/images/logo.png': 'l'
}

const bringIn = (archive: string, filename = path.basename(archive), name?: string) =>
  importTemplate({ outputDir, archive, filename, name })

const templatesDir = () => path.join(outputDir, 'templates')

beforeEach(() => {
  outputDir = createTmpDir('skydock-templates-')
  incoming = createTmpDir('skydock-incoming-')
  /* one template already there, so the one that ships with SkyDock is not what gets listed */
  fs.mkdirSync(path.join(templatesDir(), 'house'), { recursive: true })
  fs.writeFileSync(path.join(templatesDir(), 'house', 'house.kdenlive'), project('25.04.0'))
})

afterEach(() => {
  vi.unstubAllEnvs()
  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.rmSync(incoming, { recursive: true, force: true })
})

/* The installed app carries the templates it ships with, and says where they are: a packaged app is
   one file and has no folder beside it to count from. A dropzone's own are still what is used when
   it has any. */
describe('the templates the app itself carries', () => {
  it('are where the app says they are', () => {
    const shipped = path.join(incoming, 'shipped')
    fs.mkdirSync(path.join(shipped, 'epco'), { recursive: true })
    fs.writeFileSync(path.join(shipped, 'epco', 'epco.kdenlive'), project())
    vi.stubEnv('SKYDOCK_TEMPLATES_DIR', shipped)

    fs.rmSync(templatesDir(), { recursive: true, force: true })

    expect(availableTemplates(outputDir).map((t) => t.name)).toEqual(['epco'])
  })
})

describe('bringing a template in from a kdenlive archive', () => {
  it('unpacks a zip, finds the project in it, and finds every file it names', async () => {
    const made = await bringIn(zipOf(whole))

    expect(made).toMatchObject({ name: 'club', version: '24.12.1', assets: 2, missing: [] })
    expect(fs.existsSync(path.join(templatesDir(), 'club', 'audio', 'music.mp3'))).toBe(true)
  })

  it('unpacks a tar.gz the same way', async () => {
    const staged = path.join(incoming, 'club')
    fs.mkdirSync(path.join(staged, 'audio'), { recursive: true })
    fs.writeFileSync(path.join(staged, 'club.kdenlive'), project())
    fs.writeFileSync(path.join(staged, 'audio', 'music.mp3'), 'm')
    const archive = path.join(incoming, 'club.tar.gz')
    execSync(`tar -czf "${archive}" -C "${incoming}" club`)

    const made = await bringIn(archive)

    expect(made).toMatchObject({ name: 'club', assets: 2 })
  })

  /* the template is kept — an edit can start without the music — but nobody finds out at the render */
  it('names the files the project uses that did not come with it', async () => {
    const made = await bringIn(
      zipOf({ 'club/club.kdenlive': project(), 'club/audio/music.mp3': 'm' })
    )

    expect(made.missing).toEqual(['logo.png'])
    expect(listTemplates(outputDir).templates.map((t) => t.name)).toContain('club')
  })

  it('takes the name it is given rather than the archive’s', async () => {
    const made = await bringIn(zipOf(whole), 'club.zip', 'Summer 2026')
    expect(made.name).toBe('Summer 2026')
  })

  it('takes a project file on its own, and says what it would need beside it', async () => {
    const bare = path.join(incoming, 'bare.kdenlive')
    fs.writeFileSync(bare, project())

    const made = await bringIn(bare)

    expect(made).toMatchObject({ name: 'bare', missing: ['music.mp3', 'logo.png'] })
  })

  /* a template is somebody's branding: one in use is never written over */
  it('never replaces a template already there under that name', async () => {
    await expect(bringIn(zipOf(whole), 'house.zip')).rejects.toThrow(
      /already a template called house/
    )
    expect(
      fs.readFileSync(path.join(templatesDir(), 'house', 'house.kdenlive'), 'utf-8')
    ).toContain('25.04.0')
  })

  it('refuses an archive with no project in it, and leaves nothing behind', async () => {
    await expect(bringIn(zipOf({ 'club/audio/music.mp3': 'm' }))).rejects.toThrow(
      /no kdenlive project/
    )
    expect(fs.readdirSync(templatesDir())).toEqual(['house'])
  })

  it('refuses an archive that would write outside the template’s folder', async () => {
    const archive = zipOf({ '../../escaped.txt': 'x', 'club/club.kdenlive': project() })

    await expect(bringIn(archive)).rejects.toThrow(/outside the template/)
    expect(fs.existsSync(path.join(outputDir, 'escaped.txt'))).toBe(false)
    expect(fs.existsSync(path.join(outputDir, '..', 'escaped.txt'))).toBe(false)
    expect(fs.readdirSync(templatesDir())).toEqual(['house'])
  })

  it('refuses what is neither an archive nor a project', async () => {
    const other = path.join(incoming, 'notes.txt')
    fs.writeFileSync(other, 'x')
    await expect(bringIn(other)).rejects.toThrow(/\.zip or \.tar\.gz/)
  })
})
