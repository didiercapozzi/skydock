// @vitest-environment node
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultTemplate } from '../src/montage'
import { importTemplate, listTemplates, setDefaultTemplate } from '../src/templates'
import { createTmpDir } from './fixtures'

const project = (version = '24.12.1') => `<?xml version='1.0' encoding='utf-8'?>
<mlt root="/home/someone/elsewhere">
 <chain id="chain0"><property name="resource">audio/music.mp3</property></chain>
 <producer id="producer0"><property name="resource"/><property name="xmldata">&lt;kdenlivetitle&gt;&lt;content url="images/logo.png"/&gt;&lt;/kdenlivetitle&gt;</property></producer>
 <playlist id="main_bin"><property name="kdenlive:docproperties.kdenliveversion">${version}</property></playlist>
</mlt>
`

let outputDir: string
let incoming: string

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

const tarOf = (mode?: { file: number; folder: number }) => {
  const staged = path.join(incoming, 'club')
  fs.mkdirSync(path.join(staged, 'audio'), { recursive: true })
  fs.writeFileSync(path.join(staged, 'club.kdenlive'), project())
  fs.writeFileSync(path.join(staged, 'audio', 'music.mp3'), 'm')
  if (mode) {
    fs.chmodSync(path.join(staged, 'audio', 'music.mp3'), mode.file)
    fs.chmodSync(path.join(staged, 'audio'), mode.folder)
  }
  const archive = path.join(incoming, 'club.tar.gz')
  execSync(`tar -czf "${archive}" -C "${incoming}" club`)
  return archive
}

const bringIn = (archive: string, filename = path.basename(archive), name?: string) =>
  importTemplate({ outputDir, files: [{ filename, at: archive }], name })

const bringInAll = (files: { filename: string; at: string }[], name?: string) =>
  importTemplate({ outputDir, files, name })

const arriving = (filename: string, text = 'x') => {
  const at = path.join(incoming, `arriving-${filename.replace(/[\\/]/g, '-')}`)
  fs.writeFileSync(at, text)
  return { filename, at }
}

const templatesDir = () => path.join(outputDir, 'templates')

beforeEach(() => {
  outputDir = createTmpDir('skydock-templates-')
  incoming = createTmpDir('skydock-incoming-')
  fs.mkdirSync(path.join(templatesDir(), 'house'), { recursive: true })
  fs.writeFileSync(path.join(templatesDir(), 'house', 'house.kdenlive'), project('25.04.0'))
})

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.rmSync(incoming, { recursive: true, force: true })
})

describe('bringing a template in from a kdenlive archive', () => {
  it('unpacks a zip, finds the project in it, and finds every file it names', async () => {
    const made = await bringIn(zipOf(whole))

    expect(made).toMatchObject({ name: 'club', version: '24.12.1', assets: 2, missing: [] })
    expect(fs.existsSync(path.join(templatesDir(), 'club', 'audio', 'music.mp3'))).toBe(true)
  })

  it('leaves every file of it open to whoever edits it, whatever mode it was packed with', async () => {
    await bringIn(tarOf({ file: 0o600, folder: 0o700 }))

    const home = path.join(templatesDir(), 'club')
    const mode = (...parts: string[]) => fs.statSync(path.join(home, ...parts)).mode & 0o777
    expect(mode('audio', 'music.mp3')).toBe(0o666)
    expect(mode('audio')).toBe(0o777)
    expect(mode('club.kdenlive')).toBe(0o666)
  })

  it('unpacks a tar.gz the same way', async () => {
    const made = await bringIn(tarOf())

    expect(made).toMatchObject({ name: 'club', assets: 2 })
  })

  it('names the files the project uses that did not come with it', async () => {
    const made = await bringIn(
      zipOf({ 'club/club.kdenlive': project(), 'club/audio/music.mp3': 'm' })
    )

    expect(made.missing).toEqual(['logo.png'])
    expect((await listTemplates(outputDir)).templates.map((t) => t.name)).toContain('club')
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

  it('brought in again under a name already there, replaces it, files and all', async () => {
    fs.writeFileSync(path.join(templatesDir(), 'house', 'old-music.mp3'), 'old')

    const made = await bringIn(zipOf(whole), 'house.zip')

    expect(made.name).toBe('house')
    expect(fs.existsSync(path.join(templatesDir(), 'house', 'old-music.mp3'))).toBe(false)
    expect(fs.existsSync(path.join(templatesDir(), 'house', 'audio', 'music.mp3'))).toBe(true)
    expect(fs.existsSync(path.join(templatesDir(), 'house', 'house.kdenlive'))).toBe(false)
    expect(fs.readFileSync(path.join(templatesDir(), 'house', 'club.kdenlive'), 'utf-8')).toContain(
      '24.12.1'
    )
  })

  it('leaves the one that was there when what is brought in is not a template', async () => {
    await expect(bringIn(zipOf({ 'club/audio/music.mp3': 'm' }), 'house.zip')).rejects.toThrow(
      /no kdenlive project/
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

  it('refuses what holds no project at all', async () => {
    const other = path.join(incoming, 'notes.txt')
    fs.writeFileSync(other, 'x')
    await expect(bringIn(other)).rejects.toThrow(/no kdenlive project/)
  })
})

describe('bringing in the project and the files it uses, together', () => {
  const madeElsewhere = `<?xml version='1.0' encoding='utf-8'?>
<mlt root="/home/someone/elsewhere">
 <chain id="chain0"><property name="resource">/home/someone/elsewhere/audio/music.mp3</property></chain>
 <producer id="producer0"><property name="xmldata">&lt;content url="/home/someone/elsewhere/images/logo.png"/&gt;</property></producer>
 <playlist id="main_bin"><property name="kdenlive:docproperties.kdenliveversion">24.12.1</property></playlist>
</mlt>
`

  const projectFile = (text = madeElsewhere) => {
    const at = path.join(incoming, 'club.kdenlive')
    fs.writeFileSync(at, text)
    return { filename: 'club.kdenlive', at }
  }

  it('takes them as one template, named after the project', async () => {
    const made = await bringInAll([projectFile(), arriving('music.mp3'), arriving('logo.png')])

    expect(made).toMatchObject({ name: 'club', assets: 2, missing: [] })
    expect(fs.existsSync(path.join(templatesDir(), 'club', 'music.mp3'))).toBe(true)
    expect(fs.existsSync(path.join(templatesDir(), 'club', 'logo.png'))).toBe(true)
  })

  it('points what the project names at the copies brought in with it', async () => {
    await bringInAll([projectFile(), arriving('music.mp3'), arriving('logo.png')])

    const written = fs.readFileSync(path.join(templatesDir(), 'club', 'club.kdenlive'), 'utf-8')
    expect(written).toContain('<property name="resource">music.mp3</property>')
    expect(written).toContain('content url="logo.png"')
    expect(written).not.toContain('/home/someone/elsewhere')
  })

  it('keeps as it was what nobody brought in, and says it is missing', async () => {
    const made = await bringInAll([projectFile(), arriving('music.mp3')])

    expect(made.missing).toEqual(['logo.png'])
    const written = fs.readFileSync(path.join(templatesDir(), 'club', 'club.kdenlive'), 'utf-8')
    expect(written).toContain('/home/someone/elsewhere/images/logo.png')
  })

  it('takes a file by the name it ends in, so none of them lands outside the folder', async () => {
    await bringInAll([projectFile(), { filename: '../../escaped.mp3', at: arriving('m.mp3').at }])

    expect(fs.existsSync(path.join(templatesDir(), 'club', 'escaped.mp3'))).toBe(true)
    expect(fs.existsSync(path.join(outputDir, '..', 'escaped.mp3'))).toBe(false)
    expect(fs.existsSync(path.join(outputDir, 'escaped.mp3'))).toBe(false)
  })

  it('refuses a name that is nothing but a way out', async () => {
    await expect(
      bringInAll([projectFile(), { filename: '..', at: arriving('m.mp3').at }])
    ).rejects.toThrow(/is not a name/)
    expect(fs.existsSync(path.join(templatesDir(), 'club'))).toBe(false)
  })
})

describe('the usual template', () => {
  it('is none until one is said', async () => {
    expect(await defaultTemplate(outputDir)).toBeNull()
    expect((await listTemplates(outputDir)).templates.every((t) => !t.byDefault)).toBe(true)
  })

  it('is the one named, and the templates say which one it is', async () => {
    const said = await setDefaultTemplate(outputDir, 'house')

    expect(await defaultTemplate(outputDir)).toBe('house')
    expect(said.templates.find((t) => t.name === 'house')?.byDefault).toBe(true)
  })

  it('is refused when nothing answers to that name', async () => {
    await expect(setDefaultTemplate(outputDir, 'nobody')).rejects.toThrow(
      /no template called nobody/
    )
    expect(await defaultTemplate(outputDir)).toBeNull()
  })

  it('is forgotten when none is said', async () => {
    await setDefaultTemplate(outputDir, 'house')
    await setDefaultTemplate(outputDir, null)

    expect(await defaultTemplate(outputDir)).toBeNull()
  })

  it('is not itself a template', async () => {
    await setDefaultTemplate(outputDir, 'house')
    await bringIn(zipOf(whole))

    expect((await listTemplates(outputDir)).templates.map((t) => t.name)).toEqual(['club', 'house'])
  })
})

describe('bringing in the folder kdenlive left', () => {
  const archived = `<?xml version='1.0' encoding='utf-8'?>
<mlt root="/home/capo/Documents/club">
 <chain id="chain0"><property name="resource">sounds/Destiny.mp3</property></chain>
 <producer id="producer0"><property name="xmldata">&lt;content url="images/logo.png"/&gt;</property></producer>
 <playlist id="main_bin"><property name="kdenlive:docproperties.kdenliveversion">24.12.1</property></playlist>
</mlt>
`

  const folder = () => [
    { filename: 'club/club.kdenlive', at: arriving('club.kdenlive', archived).at },
    { filename: 'club/sounds/Destiny.mp3', at: arriving('Destiny.mp3').at },
    { filename: 'club/images/logo.png', at: arriving('logo.png').at }
  ]

  it('takes the project and everything under it, however deep', async () => {
    const made = await bringInAll(folder())

    expect(made).toMatchObject({ name: 'club', assets: 2, missing: [] })
    expect(fs.existsSync(path.join(templatesDir(), 'club', 'sounds', 'Destiny.mp3'))).toBe(true)
    expect(fs.existsSync(path.join(templatesDir(), 'club', 'images', 'logo.png'))).toBe(true)
  })

  it('keeps the shape its owner gave it, so the project needs no rewriting at all', async () => {
    await bringInAll(folder())

    const written = fs.readFileSync(path.join(templatesDir(), 'club', 'club.kdenlive'), 'utf-8')
    expect(written).toContain('<property name="resource">sounds/Destiny.mp3</property>')
    expect(written).toContain('content url="images/logo.png"')
  })

  it('leaves the chosen folder itself out, since that folder is the template', async () => {
    await bringInAll(folder())

    expect(fs.existsSync(path.join(templatesDir(), 'club', 'club'))).toBe(false)
  })

  it('refuses one naming its way out of the folder', async () => {
    await expect(
      bringInAll([
        { filename: 'club/club.kdenlive', at: arriving('club.kdenlive', archived).at },
        { filename: 'club/../../escaped.mp3', at: arriving('m.mp3').at }
      ])
    ).rejects.toThrow(/is not a name/)
    expect(fs.existsSync(path.join(outputDir, '..', 'escaped.mp3'))).toBe(false)
  })
})
