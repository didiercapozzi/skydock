// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { createMontageProject, listMontageTemplates } from '../src/montage'
import { createTmpDir } from './fixtures'

const REPO_TEMPLATE = path.join(__dirname, '..', '..', '..', 'templates', 'epco-template.kdenlive')

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

/* The same shape again, with what a template puts around the footage: music on the first audio
   track, and above the footage an intro, a title in the middle and an end card — the shipped
   template's in miniature. */
const templateWithFurniture = `<?xml version='1.0' encoding='utf-8'?>
<mlt root="/nowhere">
 <producer id="producer0"><property name="resource">black</property></producer>
 <producer id="music"><property name="resource">song.mp3</property></producer>
 <producer id="intro"><property name="resource">logo.png</property></producer>
 <producer id="middle"><property name="resource">title.png</property></producer>
 <producer id="card"><property name="resource">card.png</property></producer>
 <playlist id="playlist0"><entry producer="music" in="0" out="2499"/><blank length="100"/><entry producer="music" in="0" out="4999"/></playlist>
 <playlist id="playlist1"/>
 <playlist id="playlist2"/>
 <playlist id="playlist3"/>
 <playlist id="playlist4"/>
 <playlist id="playlist5"/>
 <playlist id="playlist6"/>
 <playlist id="playlist7"/>
 <playlist id="playlist8"><entry producer="intro" in="0" out="124"/><blank length="1000"/><entry producer="middle" in="0" out="124"/><blank length="3000"/><entry producer="card" in="0" out="124"/></playlist>
 <playlist id="playlist9"/>
 <tractor id="tractor0"><property name="kdenlive:audio_track">1</property><track hide="video" producer="playlist0"/><track hide="video" producer="playlist1"/></tractor>
 <tractor id="tractor1"><property name="kdenlive:audio_track">1</property><track hide="video" producer="playlist2"/><track hide="video" producer="playlist3"/></tractor>
 <tractor id="tractor2"><property name="kdenlive:audio_track">1</property><track hide="both" producer="playlist4"/><track hide="both" producer="playlist5"/></tractor>
 <tractor id="tractor3"><track hide="audio" producer="playlist6"/><track hide="audio" producer="playlist7"/></tractor>
 <tractor id="tractor4"><track hide="audio" producer="playlist8"/><track hide="audio" producer="playlist9"/></tractor>
 <playlist id="main_bin"/>
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

const sequenceOf = (xml: string) => {
  const doc = parsed(xml).mlt
  const tractors = [doc.tractor].flat()
  return tractors.find((t: { property?: unknown }) =>
    [t.property ?? []].flat().some((p: { '@_name': string }) => p['@_name'] === 'kdenlive:uuid')
  )
}
const groupsOf = (xml: string) => {
  const prop = [sequenceOf(xml).property]
    .flat()
    .find((p: { '@_name': string }) => p['@_name'] === 'kdenlive:sequenceproperties.groups')
  return JSON.parse(prop['#text'])
}
const chainProps = (xml: string, id: string) => {
  const chain = [parsed(xml).mlt.chain].flat().find((c: { '@_id': string }) => c['@_id'] === id)
  return Object.fromEntries(
    [chain.property]
      .flat()
      .map((p: { '@_name': string; '#text': string }) => [p['@_name'], p['#text']])
  )
}

describe('montage — a document the editor can open', () => {
  /* two declarations made every project ever generated unopenable, and regular expressions over the
     text could not see it: everything was present, the file just was not XML */
  it('writes a project the editor can open', () => {
    expect(() => parsed(build(twoAudioOneMutedTemplate, ['a.mp4']).xml)).not.toThrow()
  })

  it('writes a project the editor can open from the template that ships too', () => {
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

/* the tracks of the timeline bottom to top, by the tractor each one plays, black left out */
const stackOf = (xml: string) =>
  [sequenceOf(xml).track]
    .flat()
    .map((t: { '@_producer': string }) => t['@_producer'])
    .filter((p: string) => p.startsWith('tractor') || p.startsWith('skydock'))

const tractorProps = (xml: string, id: string) => {
  const tractor = [parsed(xml).mlt.tractor].flat().find((t: { '@_id': string }) => t['@_id'] === id)
  return Object.fromEntries(
    [tractor.property ?? []]
      .flat()
      .map((p: { '@_name': string; '#text': string }) => [p['@_name'], p['#text']])
  )
}

/* which track each composition of the timeline blends, by the tractor that track plays */
const blendedOf = (xml: string) => {
  const sequence = sequenceOf(xml)
  const stack = [sequence.track].flat().map((t: { '@_producer': string }) => t['@_producer'])
  return [sequence.transition ?? []].flat().map((t: { property: { '@_name': string }[] }) => {
    const b = [t.property].flat().find((p) => p['@_name'] === 'b_track') as { '#text': number }
    return stack[b['#text']]
  })
}

/* The template is somebody's film, laid out their way: the montage leaves every track of it as it
   was and adds two empty ones of its own for the jump to be dragged onto (RULES, Montage). */
describe('montage — two empty tracks for the jump', () => {
  it('adds a video track under every video track of the template, and its sound right under it', () => {
    const { xml } = build(twoAudioOneMutedTemplate, ['a.mp4'])
    expect(stackOf(xml)).toEqual([
      'tractor0',
      'tractor1',
      'tractor2',
      'skydock_jump_sound',
      'skydock_jump',
      'tractor3',
      'tractor4'
    ])
  })

  it('names them, and knows the sound one for an audio track', () => {
    const { xml } = build(twoAudioOneMutedTemplate)
    expect(tractorProps(xml, 'skydock_jump')).toMatchObject({ 'kdenlive:track_name': 'Jump' })
    expect(tractorProps(xml, 'skydock_jump')['kdenlive:audio_track']).toBeUndefined()
    expect(tractorProps(xml, 'skydock_jump_sound')).toMatchObject({
      'kdenlive:track_name': 'Jump sound',
      'kdenlive:audio_track': 1
    })
  })

  it('leaves both empty, for the editor to lay the clips on', () => {
    const { xml } = build(twoAudioOneMutedTemplate, ['a.mp4', 'b.mp4'])
    expect(entriesOf(xml, 'skydock_jump_clips')).toEqual([])
    expect(entriesOf(xml, 'skydock_jump_sound_clips')).toEqual([])
  })

  it('leaves the template’s own tracks exactly as they were', () => {
    const { xml } = build(templateWithFurniture, ['a.mp4'])
    expect(entriesOf(xml, 'playlist0')).toEqual(['music', 'music'])
    expect(entriesOf(xml, 'playlist8')).toEqual(['intro', 'middle', 'card'])
    expect(entriesOf(xml, 'playlist6')).toEqual([])
    expect(xml).toMatch(/<playlist id="playlist8">[\s\S]*?<blank length="3000"\/>/)
  })

  /* the template's titles are blended by number, and the number of the track they are on moves up
     by two — left behind, they would be blended onto the wrong track */
  it('keeps every composition of the template that ships on the track it blended', () => {
    const before = fs.readFileSync(REPO_TEMPLATE, 'utf-8')
    const { xml } = build(undefined, ['a.mp4'])
    expect(blendedOf(xml).filter((t) => !t.startsWith('skydock'))).toEqual(blendedOf(before))
  })

  it('blends the jump in the order of the stack, so the template’s titles stay on top of it', () => {
    const { xml } = build(undefined, ['a.mp4'])
    const stack = stackOf(xml)
    const blended = blendedOf(xml)
    expect(blended).toContain('skydock_jump')
    expect(blended).toContain('skydock_jump_sound')
    const video = blended.filter((t) => ['skydock_jump', 'tractor2', 'tractor3'].includes(t))
    expect(video).toEqual(['skydock_jump', 'tractor2', 'tractor3'])
    expect(stack.indexOf('skydock_jump')).toBeLessThan(stack.indexOf('tractor2'))
  })

  it('keeps clips the template grouped together, on the tracks they were on', () => {
    const grouped = twoAudioOneMutedTemplate.replace(
      '<track producer="producer0"/>',
      `<property name="kdenlive:sequenceproperties.groups">[{"type":"AVSplit","children":[{"data":"2:0","leaf":"clip","type":"Leaf"},{"data":"3:0","leaf":"clip","type":"Leaf"}]},{"type":"Normal","children":[{"data":"4:10","leaf":"clip","type":"Leaf"}]}]</property><track producer="producer0"/>`
    )
    const { xml } = build(grouped)
    expect(
      groupsOf(xml).map((g: { children: { data: string }[] }) => g.children.map((c) => c.data))
    ).toEqual([['2:0', '5:0'], ['6:10']])
  })

  it('adds them on top of a template with no video track at all', () => {
    const { xml } = build(audioOnlyTemplate)
    expect(stackOf(xml)).toEqual(['tractor0', 'skydock_jump_sound', 'skydock_jump'])
  })

  it('writes a project the editor can open from the template that ships', () => {
    expect(() => parsed(build(undefined, ['a.mp4', 'b.mp4']).xml)).not.toThrow()
  })
})

/* entries anywhere on the timeline that play one of the tandem's clips */
const laidOnTimeline = (xml: string) =>
  [parsed(xml).mlt.playlist]
    .flat()
    .filter((p: { '@_id': string }) => p['@_id'] !== 'main_bin')
    .flatMap((p: { entry?: unknown }) => [p.entry ?? []].flat())
    .filter((e: { '@_producer': string }) => e['@_producer'].startsWith('chain_skydock'))

const binOf = (xml: string) =>
  [
    [parsed(xml).mlt.playlist].flat().find((p: { '@_id': string }) => p['@_id'] === 'main_bin')
      .entry
  ]
    .flat()
    .map((e: { '@_producer': string }) => e['@_producer'])

describe('montage — the clips wait in the bin', () => {
  it('puts every clip in the bin, in the order shot', () => {
    const { xml } = build(twoAudioOneMutedTemplate, ['a.mp4', 'b.mp4'])
    expect(binOf(xml).filter((p: string) => p.startsWith('chain_skydock'))).toEqual([
      'chain_skydock_0',
      'chain_skydock_1'
    ])
  })

  /* where a clip goes in the film is the editor's decision and theirs alone */
  it('lays none of them on the timeline', () => {
    const { xml } = build(templateWithFurniture, ['a.mp4', 'b.mp4'])
    expect(laidOnTimeline(xml)).toEqual([])
  })

  it('gives each clip in the bin its whole sound and picture', () => {
    const { xml } = build(twoAudioOneMutedTemplate, ['a.mp4'])
    expect(chainProps(xml, 'chain_skydock_0')['set.test_audio']).toBeUndefined()
    expect(chainProps(xml, 'chain_skydock_0')['set.test_image']).toBeUndefined()
  })
})

describe('montage — where the film goes', () => {
  it('fills in where the film goes and its format', () => {
    const { xml, groupDir } = build(twoAudioOneMutedTemplate)
    expect(xml).toContain(
      `<property name="kdenlive:docproperties.renderurl">${path.join(groupDir, 'luc_favre_20260802.mp4')}</property>`
    )
    /* the card's own encoder, not the processor's (RULES, Montage) */
    expect(xml).toContain('"kdenlive:docproperties.renderprofile">NVENC H264 VBR<')
    expect(xml).toContain('"kdenlive:docproperties.rendercategory">hw<')
  })

  it('leaves nothing that would render the film without a person', () => {
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

/* A proxied clip is the whole point of pre-generating them: the editor opens on the small copy
   instead of transcoding every GoPro clip itself, and swaps back to the clip to render. Getting
   any one of these three properties wrong leaves a project that opens on the wrong thing — or
   renders from it, which nobody notices until the film is delivered. */
describe('montage — clips that have a proxy', () => {
  const buildWithProxy = (clips: { path: string; proxy?: string }[]) => {
    const { outputDir, groupDir, templatePath } = setup(twoAudioOneMutedTemplate)
    const result = createMontageProject({
      groupDir,
      outputDir,
      baseName: 'luc_favre_20260802',
      title: 'Luc Favre',
      templatePath,
      clips: clips.map((c) => ({
        path: path.join(groupDir, 'videos', c.path),
        ...(c.proxy ? { proxy: path.join(groupDir, 'proxy', c.proxy) } : {})
      }))
    })
    return { ...result, groupDir, xml: fs.readFileSync(result.projectPath, 'utf-8') }
  }

  /* the properties of one generated chain, read the way the editor reads them */
  const chainProps = (xml: string, id: string) => {
    const doc = parsed(xml)
    const chains = [doc.mlt.chain].flat().filter(Boolean)
    const chain = chains.find((c: Record<string, string>) => c['@_id'] === id)
    const props: Record<string, string> = {}
    for (const p of [chain.property].flat()) props[p['@_name']] = String(p['#text'] ?? p)
    return props
  }

  it('plays the proxy and keeps the clip itself as the original', () => {
    const { xml, groupDir } = buildWithProxy([{ path: 'a.mp4', proxy: 'a.mp4' }])
    const props = chainProps(xml, 'chain_skydock_0')
    expect(props.resource).toBe(path.join(groupDir, 'proxy', 'a.mp4'))
    expect(props['kdenlive:proxy']).toBe(path.join(groupDir, 'proxy', 'a.mp4'))
    expect(props['kdenlive:originalurl']).toBe(path.join(groupDir, 'videos', 'a.mp4'))
  })

  /* `-` is how a project says this clip has no proxy; leaving the property out entirely makes the
     editor go looking for one to generate */
  it('says so plainly when a clip has none', () => {
    const { xml, groupDir } = buildWithProxy([{ path: 'a.mp4' }])
    const props = chainProps(xml, 'chain_skydock_0')
    expect(props.resource).toBe(path.join(groupDir, 'videos', 'a.mp4'))
    expect(props['kdenlive:proxy']).toBe('-')
    expect(props['kdenlive:originalurl']).toBeUndefined()
  })

  it('takes each clip on its own, so one missing proxy does not cost the others theirs', () => {
    const { xml } = buildWithProxy([{ path: 'a.mp4', proxy: 'a.mp4' }, { path: 'b.mp4' }])
    expect(chainProps(xml, 'chain_skydock_0')['kdenlive:proxy']).toContain('/proxy/a.mp4')
    expect(chainProps(xml, 'chain_skydock_1')['kdenlive:proxy']).toBe('-')
  })

  /* the editor runs where the files are, not where SkyDock is */
  it('writes the proxy path the way the editing machine knows it', () => {
    process.env.SKYDOCK_HOST_OUTPUT_DIR = '/home/capo/Documents/skydock/output'
    const { xml } = buildWithProxy([{ path: 'a.mp4', proxy: 'a.mp4' }])
    const props = chainProps(xml, 'chain_skydock_0')
    expect(props['kdenlive:proxy']).toContain('/home/capo/Documents/skydock/output')
    expect(props['kdenlive:originalurl']).toContain('/home/capo/Documents/skydock/output')
  })
})

/* Where the jump is in a clip is measured before any of this (RULES, Where the jump is in a clip),
   and a montage marks the clip with it. The numbers below are a real tandem's: the door left at
   65 s, the canopy open at 120, the ground at 223. */
describe('montage — the jump marked on the clip', () => {
  /* the frames a second this template counts in, and the tandem's own moments */
  const FPS = 25
  const JUMP = { exit: 65, opening: 120.3, canopy: 123, landing: 223 }

  const marked = (clip: { seconds?: number; moments?: typeof JUMP; cropStart?: number }) => {
    const { outputDir, groupDir, templatePath } = setup(twoAudioOneMutedTemplate)
    const result = createMontageProject({
      groupDir,
      outputDir,
      baseName: 'luc_favre_20260802',
      title: 'Luc Favre',
      templatePath,
      clips: [{ path: path.join(groupDir, 'videos', 'jump.mp4'), ...clip }]
    })
    const xml = fs.readFileSync(result.projectPath, 'utf-8')
    const markers = chainProps(xml, 'chain_skydock_0')['kdenlive:markers']
    return {
      xml,
      markers:
        markers === undefined ? [] : (JSON.parse(markers) as { comment: string; pos: number }[])
    }
  }

  /* on the clip in the bin, so they come with it wherever it is dragged, and stay with it however
     often it is moved, trimmed or cut */
  it('writes the moments on the clip, counted from the clip’s own start', () => {
    const { markers } = marked({ seconds: 455, moments: JUMP })
    expect(markers.map((m) => m.comment)).toEqual(['exit', 'opening', 'canopy', 'ground'])
    expect(markers[0]!.pos).toBe(JUMP.exit * FPS)
  })

  /* A guide is nailed to a frame of the film, so moving the clip it was about — which is the whole
     of editing — leaves it behind pointing at nothing. The moments are the clip's, and go with it. */
  it('puts nothing along the timeline, which a clip moving would leave behind', () => {
    const { xml } = marked({ seconds: 455, moments: JUMP })
    const guides = [sequenceOf(xml).property]
      .flat()
      .find((p: { '@_name': string }) => p['@_name'] === 'kdenlive:sequenceproperties.guides')
    expect(guides).toBeUndefined()
  })

  /* A copy trimmed at the front is a different clip from the one the camera shot, and the moments
     were measured on what the camera shot. */
  it('shifts the moments by what was trimmed off the front of the clip', () => {
    const { markers } = marked({ seconds: 425, moments: JUMP, cropStart: 30 })
    expect(markers[0]!.pos).toBe((JUMP.exit - 30) * FPS)
    expect(markers.map((m) => m.comment)).toEqual(['exit', 'opening', 'canopy', 'ground'])
  })

  it('says nothing of a moment the copy does not reach', () => {
    /* a copy cut at 122 s holds the exit and the opening, and neither the canopy nor the ground */
    const { markers } = marked({ seconds: 122, moments: JUMP })
    expect(markers.map((m) => m.comment)).toEqual(['exit', 'opening'])
  })

  /* most clips are not jumps: ground footage, a plane ride, a camera that measures nothing */
  it('marks nothing on a clip with no jump in it', () => {
    expect(marked({ seconds: 33 }).markers).toEqual([])
  })

  it('writes a project the editor can open', () => {
    expect(() => parsed(marked({ seconds: 455, moments: JUMP }).xml)).not.toThrow()
  })
})
