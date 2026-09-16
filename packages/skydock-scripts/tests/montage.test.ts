// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { createMontageProject, listMontageTemplates } from '../src/montage'
import { createTmpDir } from './fixtures'

const REPO_TEMPLATE = path.join(__dirname, '..', '..', '..', 'templates', 'tandem.kdenlive')

afterEach(() => {
  delete process.env.SKYDOCK_HOST_OUTPUT_DIR
  delete process.env.SKYDOCK_MONTAGE_TEMPLATE
})

/* The shape that matters, taken from the user's own epco template: two audio tracks, then a muted
   and hidden audio track, then the two video tracks. The muted one is what makes `hide` useless for
   telling a track's kind apart — only `kdenlive:audio_track` says it. */
const twoAudioOneMutedTemplate = `<?xml version='1.0' encoding='utf-8'?>
<mlt root="/nowhere" profile="atsc_1080p_60">
 <producer id="producer0"><property name="resource">black</property></producer>
 <playlist id="playlist0"/>
 <playlist id="playlist1"/>
 <playlist id="playlist2"/>
 <playlist id="playlist3"/>
 <playlist id="playlist4"/>
 <playlist id="playlist5"/>
 <playlist id="playlist6"/>
 <playlist id="playlist7"/>
 <playlist id="playlist8"/>
 <playlist id="playlist9"/>
 <tractor id="tractor0"><property name="kdenlive:audio_track">1</property><track hide="video" producer="playlist0"/><track hide="video" producer="playlist1"/></tractor>
 <tractor id="tractor1"><property name="kdenlive:audio_track">1</property><track hide="video" producer="playlist2"/><track hide="video" producer="playlist3"/></tractor>
 <tractor id="tractor2"><property name="kdenlive:audio_track">1</property><track hide="both" producer="playlist4"/><track hide="both" producer="playlist5"/></tractor>
 <tractor id="tractor3"><track hide="audio" producer="playlist6"/><track hide="audio" producer="playlist7"/></tractor>
 <tractor id="tractor4"><track hide="audio" producer="playlist8"/><track hide="audio" producer="playlist9"/></tractor>
 <playlist id="main_bin"><property name="kdenlive:docproperties.uuid">{old}</property></playlist>
 <tractor id="tractor5"><property name="kdenlive:uuid">{25cd7034-f98e-4260-b8b3-f34fd91e8906}</property><track producer="producer0"/><track producer="tractor0"/><track producer="tractor1"/><track producer="tractor2"/><track producer="tractor3"/><track producer="tractor4"/></tractor>
</mlt>
`

const audioOnlyTemplate = `<?xml version='1.0' encoding='utf-8'?>
<mlt root="/nowhere">
 <playlist id="playlist0"/>
 <tractor id="tractor0"><property name="kdenlive:audio_track">1</property><track hide="video" producer="playlist0"/></tractor>
 <playlist id="main_bin"/>
 <tractor id="tractor1"><property name="kdenlive:uuid">{u}</property><track producer="tractor0"/></tractor>
</mlt>
`

const setup = (templateXml?: string) => {
  const outputDir = createTmpDir('skydock-montage-')
  const groupDir = path.join(outputDir, 'processed', 'Tandems', 'Luc Favre')
  fs.mkdirSync(groupDir, { recursive: true })
  if (templateXml === undefined) return { outputDir, groupDir, templatePath: REPO_TEMPLATE }
  const templatePath = path.join(outputDir, 'templates', 'epco', 'epco.kdenlive')
  fs.mkdirSync(path.dirname(templatePath), { recursive: true })
  fs.writeFileSync(templatePath, templateXml)
  return { outputDir, groupDir, templatePath }
}

const build = (templateXml?: string, clips: string[] = []) => {
  const { outputDir, groupDir, templatePath } = setup(templateXml)
  const result = createMontageProject({
    groupDir,
    outputDir,
    baseName: 'luc_favre_20260802',
    title: 'Luc Favre',
    templatePath,
    clips: clips.map((c) => ({ path: path.join(groupDir, 'videos', c) }))
  })
  return { ...result, outputDir, groupDir, xml: fs.readFileSync(result.projectPath, 'utf-8') }
}

/* the entries of one playlist, so a clip landing on the wrong track is visible. An empty track is
   written self-closing, and must not be read as the opening of the next one. */
const entriesOf = (xml: string, playlistId: string) => {
  const open = new RegExp(`<playlist id="${playlistId}"\\s*(/?)>`).exec(xml)
  if (!open || open[1] === '/') return []
  const rest = xml.slice(open.index + open[0].length)
  const body = rest.slice(0, rest.indexOf('</playlist>'))
  return [...body.matchAll(/<entry producer="([^"]+)"/g)].map((m) => m[1])
}

/* The editor parses the project before it does anything else, so a document that is merely
   plausible is worth nothing — these read it the way kdenlive does rather than by matching text. */
const parsed = (xml: string) => {
  const verdict = XMLValidator.validate(xml)
  if (verdict !== true) throw new Error(`${verdict.err.msg} (line ${verdict.err.line})`)
  return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(xml)
}

describe('montage — a document the editor can open', () => {
  /* two declarations made every project ever generated unopenable, and regular expressions over the
     text could not see it: everything was present, the file just was not XML */
  it('writes a project that parses', () => {
    expect(() => parsed(build(twoAudioOneMutedTemplate, ['a.mp4']).xml)).not.toThrow()
  })

  it('writes a project that parses from the committed template too', () => {
    expect(() => parsed(build(undefined, ['a.mp4']).xml)).not.toThrow()
  })

  it('declares itself once, at the very start', () => {
    const { xml } = build(twoAudioOneMutedTemplate, ['a.mp4'])
    expect(xml.match(/<\?xml/g) ?? []).toHaveLength(1)
    expect(xml.startsWith('<?xml')).toBe(true)
  })

  /* the passenger's name goes into an attribute and their folder into another, and entities are
     left alone everywhere else in the document — so nothing escapes these but this */
  it('survives a passenger whose name contains an ampersand', () => {
    const outputDir = createTmpDir('skydock-amp-name-')
    const groupDir = path.join(outputDir, 'processed', 'Tandems', 'Jean & Marie')
    fs.mkdirSync(groupDir, { recursive: true })
    const templatePath = path.join(outputDir, 'templates', 'epco', 'epco.kdenlive')
    fs.mkdirSync(path.dirname(templatePath), { recursive: true })
    fs.writeFileSync(templatePath, twoAudioOneMutedTemplate)
    const result = createMontageProject({
      groupDir,
      outputDir,
      baseName: 'jean_marie_20260802',
      title: 'Jean & Marie',
      templatePath,
      clips: [{ path: path.join(groupDir, 'videos', 'a & b.mp4') }]
    })
    const doc = parsed(fs.readFileSync(result.projectPath, 'utf-8'))
    expect(doc.mlt['@_title']).toBe('Jean & Marie')
    expect(doc.mlt['@_root']).toBe(groupDir)
  })

  it('keeps the clip paths and the film destination readable after parsing', () => {
    const { projectPath, groupDir } = build(twoAudioOneMutedTemplate, ['a.mp4'])
    const doc = parsed(fs.readFileSync(projectPath, 'utf-8'))
    const chains = [doc.mlt.chain].flat()
    const resources = chains.flatMap((c) =>
      [c.property]
        .flat()
        .filter((p) => p['@_name'] === 'resource')
        .map((p) => p['#text'])
    )
    expect(resources).toContain(path.join(groupDir, 'videos', 'a.mp4'))
    const bin = [doc.mlt.playlist].flat().find((p) => p['@_id'] === 'main_bin')
    const render = [bin.property]
      .flat()
      .find((p) => p['@_name'] === 'kdenlive:docproperties.renderurl')
    expect(render['#text']).toBe(path.join(groupDir, 'luc_favre_20260802.mp4'))
  })
})

describe('montage — which track the jump lands on', () => {
  it('uses the first video track of the template it was given, not a fixed one', () => {
    const { videoTrackId, xml } = build(twoAudioOneMutedTemplate, ['a.mp4', 'b.mp4'])
    expect(videoTrackId).toBe('playlist6')
    expect(entriesOf(xml, 'playlist6')).toEqual(['chain_skydock_0', 'chain_skydock_1'])
  })

  it('never mistakes a muted audio track for a video one', () => {
    const { xml } = build(twoAudioOneMutedTemplate, ['a.mp4'])
    expect(entriesOf(xml, 'playlist4')).toEqual([])
  })

  it('leaves the titles track above the footage alone', () => {
    const { xml } = build(twoAudioOneMutedTemplate, ['a.mp4'])
    expect(entriesOf(xml, 'playlist8')).toEqual([])
  })

  it('reads the committed template the same way it always did', () => {
    const { videoTrackId, xml } = build(undefined, ['a.mp4'])
    expect(videoTrackId).toBe('playlist4')
    expect(entriesOf(xml, 'playlist4')).toContain('chain_skydock_0')
  })

  it('refuses a template with no video track instead of guessing one', () => {
    expect(() => build(audioOnlyTemplate)).toThrow(/no video track/)
  })
})

describe('montage — where the film goes', () => {
  it('records the render destination and format kdenlive reads', () => {
    const { xml, groupDir } = build(twoAudioOneMutedTemplate)
    expect(xml).toContain(
      `<property name="kdenlive:docproperties.renderurl">${path.join(groupDir, 'luc_favre_20260802.mp4')}</property>`
    )
    expect(xml).toContain('"kdenlive:docproperties.renderprofile">MP4-H264/AAC<')
  })

  it('writes no consumer, so nothing can render it behind our back', () => {
    const { xml } = build(twoAudioOneMutedTemplate, ['a.mp4'])
    expect(xml).not.toContain('<consumer')
  })

  it('gives the project an identity of its own', () => {
    const { xml } = build(twoAudioOneMutedTemplate)
    expect(xml).not.toContain('{25cd7034-f98e-4260-b8b3-f34fd91e8906}')
  })
})

describe('montage — paths the editor can open', () => {
  it('writes host paths when the output directory is mounted from elsewhere', () => {
    process.env.SKYDOCK_HOST_OUTPUT_DIR = '/home/capo/Documents/skydock/output'
    const { xml, outputDir } = build(twoAudioOneMutedTemplate, ['a.mp4'])
    expect(xml).toContain(
      '/home/capo/Documents/skydock/output/processed/Tandems/Luc Favre/videos/a.mp4'
    )
    expect(xml).not.toContain(outputDir)
  })

  it('leaves paths alone when it runs where the editor runs', () => {
    const { xml, groupDir } = build(twoAudioOneMutedTemplate, ['a.mp4'])
    expect(xml).toContain(path.join(groupDir, 'videos', 'a.mp4'))
  })
})

describe('montage — the template survives the round trip', () => {
  it('keeps the title clips whole', () => {
    const before = fs.readFileSync(REPO_TEMPLATE, 'utf-8')
    const { xml } = build(undefined, ['a.mp4'])
    const titlesIn = (s: string) => (s.match(/kdenlivetitle/g) ?? []).length
    expect(titlesIn(xml)).toBe(titlesIn(before))
  })

  it('makes the template’s own music and logos absolute', () => {
    const { xml } = build(undefined)
    expect(xml).not.toMatch(/<property name="resource">template files\//)
  })

  /* the icons in the outro are referenced inside the title clip's own escaped XML, by the absolute
     path of the machine the template came from — the one place a resource property cannot reach */
  it('follows a title clip’s images to the template it travelled with', () => {
    const outputDir = createTmpDir('skydock-title-')
    const groupDir = path.join(outputDir, 'g')
    const templateDir = path.join(outputDir, 'templates', 'epco')
    fs.mkdirSync(path.join(templateDir, 'template files'), { recursive: true })
    fs.writeFileSync(path.join(templateDir, 'template files', 'facebook.png'), 'png')
    fs.writeFileSync(
      path.join(templateDir, 'epco.kdenlive'),
      twoAudioOneMutedTemplate.replace(
        '<playlist id="playlist0"/>',
        `<producer id="producer9"><property name="resource"></property><property name="mlt_service">kdenlivetitle</property><property name="xmldata">&lt;item&gt;&lt;content url="/home/someone-else/SkydiveVideo/template files/facebook.png"/&gt;&lt;/item&gt;</property></producer>
 <playlist id="playlist0"/>`
      )
    )
    const { projectPath } = createMontageProject({
      groupDir,
      outputDir,
      baseName: 'b',
      title: 't',
      clips: []
    })
    const xml = fs.readFileSync(projectPath, 'utf-8')
    expect(xml).toContain(
      `content url="${path.join(templateDir, 'template files', 'facebook.png')}"`
    )
    expect(xml).not.toContain('/home/someone-else/')
  })
})

describe('montage — choosing a template', () => {
  it('lists what is on offer', () => {
    const outputDir = createTmpDir('skydock-templates-')
    fs.mkdirSync(path.join(outputDir, 'templates', 'epco'), { recursive: true })
    fs.writeFileSync(path.join(outputDir, 'templates', 'epco', 'p.kdenlive'), audioOnlyTemplate)
    fs.writeFileSync(path.join(outputDir, 'templates', 'bare.kdenlive'), audioOnlyTemplate)
    expect(listMontageTemplates(outputDir).map((t) => t.name)).toEqual(['bare', 'epco'])
  })

  it('takes the only template there without being told', () => {
    const outputDir = createTmpDir('skydock-templates-')
    const groupDir = path.join(outputDir, 'g')
    fs.mkdirSync(path.join(outputDir, 'templates', 'epco'), { recursive: true })
    fs.writeFileSync(
      path.join(outputDir, 'templates', 'epco', 'p.kdenlive'),
      twoAudioOneMutedTemplate
    )
    const result = createMontageProject({
      groupDir,
      outputDir,
      baseName: 'b',
      title: 't',
      clips: []
    })
    expect(result.template).toContain(path.join('templates', 'epco'))
  })

  it('asks which one rather than picking someone’s branding for them', () => {
    const outputDir = createTmpDir('skydock-templates-')
    fs.mkdirSync(path.join(outputDir, 'templates'), { recursive: true })
    fs.writeFileSync(path.join(outputDir, 'templates', 'one.kdenlive'), twoAudioOneMutedTemplate)
    fs.writeFileSync(path.join(outputDir, 'templates', 'two.kdenlive'), twoAudioOneMutedTemplate)
    expect(() =>
      createMontageProject({
        groupDir: path.join(outputDir, 'g'),
        outputDir,
        baseName: 'b',
        title: 't',
        clips: []
      })
    ).toThrow(/one, two/)
  })

  /* one of the template's own music tracks has an `&` in its name, which the XML spells `&amp;`.
     Asking the filesystem for that literal name finds nothing, so it could never be relocated. */
  it('relocates an asset whose name contains an ampersand', () => {
    const outputDir = createTmpDir('skydock-amp-')
    const groupDir = path.join(outputDir, 'g')
    const templateDir = path.join(outputDir, 'templates', 'epco')
    fs.mkdirSync(path.join(templateDir, 'template files'), { recursive: true })
    const track = 'Sky_MBB_&_ASHUTOSH_Happy.mp3'
    fs.writeFileSync(path.join(templateDir, 'template files', track), 'mp3')
    fs.writeFileSync(
      path.join(templateDir, 'epco.kdenlive'),
      twoAudioOneMutedTemplate.replace(
        '<playlist id="playlist0"/>',
        `<chain id="chain0"><property name="resource">template files/Sky_MBB_&amp;_ASHUTOSH_Happy.mp3</property></chain>
 <playlist id="playlist0"/>`
      )
    )
    const { projectPath } = createMontageProject({
      groupDir,
      outputDir,
      baseName: 'b',
      title: 't',
      clips: []
    })
    const xml = fs.readFileSync(projectPath, 'utf-8')
    const resource = /<property name="resource">([^<]*Sky_MBB[^<]*)</.exec(xml)?.[1] ?? ''
    /* it stays escaped in the document, and points at the file that is really there */
    expect(resource).toContain('&amp;')
    expect(fs.existsSync(resource.replace('&amp;', '&'))).toBe(true)
  })
})

/* The committed template references music, a logo and a title file that live beside it in nobody's
   repository — a montage made from it opens silent and full of holes, and the only way anyone found
   out was at the render. */
describe('montage — a template that arrived without its files', () => {
  it('names what it could not find instead of passing over it', () => {
    const outputDir = createTmpDir('skydock-missing-')
    const groupDir = path.join(outputDir, 'g')
    const templateDir = path.join(outputDir, 'templates', 'partial')
    fs.mkdirSync(templateDir, { recursive: true })
    fs.mkdirSync(path.join(templateDir, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(templateDir, 'assets', 'logo.png'), 'png')
    fs.writeFileSync(
      path.join(templateDir, 'partial.kdenlive'),
      twoAudioOneMutedTemplate.replace(
        '<playlist id="playlist0"/>',
        `<chain id="chain0"><property name="resource">assets/logo.png</property></chain>
 <chain id="chain1"><property name="resource">assets/music.mp3</property></chain>
 <playlist id="playlist0"/>`
      )
    )
    const result = createMontageProject({
      groupDir,
      outputDir,
      baseName: 'b',
      title: 't',
      clips: []
    })
    expect(result.missingAssets).toEqual(['assets/music.mp3'])
  })

  it('says nothing when the template brought everything it needs', () => {
    expect(build(twoAudioOneMutedTemplate, ['a.mp4']).missingAssets).toEqual([])
  })

  it('still writes the project, because the edit can start without the music', () => {
    const outputDir = createTmpDir('skydock-missing-')
    const templateDir = path.join(outputDir, 'templates', 'partial')
    fs.mkdirSync(templateDir, { recursive: true })
    fs.writeFileSync(
      path.join(templateDir, 'partial.kdenlive'),
      twoAudioOneMutedTemplate.replace(
        '<playlist id="playlist0"/>',
        `<chain id="chain0"><property name="resource">gone.mp3</property></chain>
 <playlist id="playlist0"/>`
      )
    )
    const result = createMontageProject({
      groupDir: path.join(outputDir, 'g'),
      outputDir,
      baseName: 'b',
      title: 't',
      clips: []
    })
    expect(fs.existsSync(result.projectPath)).toBe(true)
    expect(result.missingAssets).toContain('gone.mp3')
  })
})
