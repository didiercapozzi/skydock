// @vitest-environment node
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { availableTemplates } from '../src/montage'
import {
  defaultTemplate,
  importTemplate,
  listTemplates,
  setDefaultTemplate
} from '../src/templates'
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

/* everything that makes one template, handed over together, the way the board hands them over */
const bringIn = (archive: string, filename = path.basename(archive), name?: string) =>
  importTemplate({ outputDir, files: [{ filename, at: archive }], name })

const bringInAll = (files: { filename: string; at: string }[], name?: string) =>
  importTemplate({ outputDir, files, name })

/* a file on the way in, written where the board would have written what it received */
const arriving = (filename: string, text = 'x') => {
  const at = path.join(incoming, `arriving-${filename.replace(/[\\/]/g, '-')}`)
  fs.writeFileSync(at, text)
  return { filename, at }
}

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

  /* an import is the whole template: half an old one mixed with half a new one is nobody's */
  it('brought in again under a name already there, replaces it, files and all', async () => {
    fs.writeFileSync(path.join(templatesDir(), 'house', 'old-music.mp3'), 'old')

    const made = await bringIn(zipOf(whole), 'house.zip')

    expect(made.name).toBe('house')
    expect(fs.existsSync(path.join(templatesDir(), 'house', 'old-music.mp3'))).toBe(false)
    expect(fs.existsSync(path.join(templatesDir(), 'house', 'audio', 'music.mp3'))).toBe(true)
    /* the project that came in, under its own name: what replaced it is what was brought */
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

/* A template is often a project and a folder of files rather than an archive: somebody was sent the
   lot and hands them over together. What the project names is then pointed at the copy that came
   with it, so a template made on another machine finds its own files here. */
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

  /* a browser hands over a path when a folder is chosen, and a path is a way out of the folder */
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

/* Which template a montage is made from when nobody is asked. A template is somebody's branding, so
   this is only ever what somebody said, and it is forgotten when they say so. */
describe('the usual template', () => {
  it('is none until one is said', () => {
    expect(defaultTemplate(outputDir)).toBeNull()
    expect(listTemplates(outputDir).templates.every((t) => !t.byDefault)).toBe(true)
  })

  it('is the one named, and the templates say which one it is', () => {
    const said = setDefaultTemplate(outputDir, 'house')

    expect(defaultTemplate(outputDir)).toBe('house')
    expect(said.templates.find((t) => t.name === 'house')?.byDefault).toBe(true)
  })

  it('is refused when nothing answers to that name', () => {
    expect(() => setDefaultTemplate(outputDir, 'nobody')).toThrow(/no template called nobody/)
    expect(defaultTemplate(outputDir)).toBeNull()
  })

  it('is forgotten when none is said', () => {
    setDefaultTemplate(outputDir, 'house')
    setDefaultTemplate(outputDir, null)

    expect(defaultTemplate(outputDir)).toBeNull()
  })

  it('is not itself a template', async () => {
    setDefaultTemplate(outputDir, 'house')
    await bringIn(zipOf(whole))

    expect(listTemplates(outputDir).templates.map((t) => t.name)).toEqual(['club', 'house'])
  })
})

/* What kdenlive's own Archive project leaves when it is told to copy rather than pack: the project
   with its files in folders beside it. Choosing that folder hands every file over under its way down
   from it, and the template is laid out the same shape it had. */
describe('bringing in the folder kdenlive left', () => {
  const archived = `<?xml version='1.0' encoding='utf-8'?>
<mlt root="/home/capo/Documents/club">
 <chain id="chain0"><property name="resource">sounds/Destiny.mp3</property></chain>
 <producer id="producer0"><property name="xmldata">&lt;content url="images/logo.png"/&gt;</property></producer>
 <playlist id="main_bin"><property name="kdenlive:docproperties.kdenliveversion">24.12.1</property></playlist>
</mlt>
`

  /* the way a browser hands a chosen folder over: every file under the folder's own name */
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
