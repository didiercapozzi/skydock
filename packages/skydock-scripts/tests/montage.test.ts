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
   track, and above the footage an intro, a title in the middle and an end card. The numbers are the
   shipped template's in miniature — furniture made for a film of a certain length, laid over a
   montage that is as long as its footage. */
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

  it('lays the jump on the first video track of the template that ships', () => {
    const { videoTrackId, xml } = build(undefined, ['a.mp4'])
    expect(videoTrackId).toBe('playlist4')
    expect(entriesOf(xml, 'playlist4')).toContain('chain_skydock_0')
  })

  it('refuses a template with no video track instead of guessing one', () => {
    expect(() => build(audioOnlyTemplate)).toThrow(/no video track/)
  })
})

/* A jump's clip is laid on V1 with its own sound on A1 beneath it, the two linked — as kdenlive
   leaves a clip whose audio was restored — so nobody restores the audio clip by clip. */
describe('montage — each clip with its sound', () => {
  const timed = (templateXml: string | undefined, clips: [string, number][]) => {
    const { outputDir, groupDir, templatePath } = setup(templateXml)
    const result = createMontageProject({
      groupDir,
      outputDir,
      baseName: 'luc_favre_20260802',
      title: 'Luc Favre',
      templatePath,
      clips: clips.map(([c, seconds]) => ({ path: path.join(groupDir, 'videos', c), seconds }))
    })
    return fs.readFileSync(result.projectPath, 'utf-8')
  }
  it('lays each clip on the first video track and its sound on the audio track under it, starting together', () => {
    const xml = timed(twoAudioOneMutedTemplate, [
      ['a.mp4', 2],
      ['b.mp4', 3]
    ])
    expect(entriesOf(xml, 'playlist6')).toEqual([
      'chain_skydock_0_picture',
      'chain_skydock_1_picture'
    ])
    expect(entriesOf(xml, 'playlist4')).toEqual(['chain_skydock_0_sound', 'chain_skydock_1_sound'])
  })

  it('plays the picture alone on the video track and the sound alone on the audio track', () => {
    const xml = timed(twoAudioOneMutedTemplate, [['a.mp4', 2]])
    /* read back as numbers, the way the parser reads any value */
    expect(chainProps(xml, 'chain_skydock_0_picture')).toMatchObject({
      'set.test_audio': 1,
      'set.test_image': 0
    })
    expect(chainProps(xml, 'chain_skydock_0_sound')).toMatchObject({
      'set.test_audio': 0,
      'set.test_image': 1
    })
  })

  it('links each picture with its sound, so they move together', () => {
    /* no frame rate in this template: 25 frames a second, so 2 s is 50 frames */
    const xml = timed(twoAudioOneMutedTemplate, [
      ['a.mp4', 2],
      ['b.mp4', 3]
    ])
    expect(groupsOf(xml)).toEqual([
      {
        type: 'AVSplit',
        children: [
          { data: '2:0', leaf: 'clip', type: 'Leaf' },
          { data: '3:0', leaf: 'clip', type: 'Leaf' }
        ]
      },
      {
        type: 'AVSplit',
        children: [
          { data: '2:50', leaf: 'clip', type: 'Leaf' },
          { data: '3:50', leaf: 'clip', type: 'Leaf' }
        ]
      }
    ])
  })

  /* the committed template opens V1 on a five-second title at 60 frames a second, and keeps a free,
     unmuted audio track under A1 */
  it('starts after what the video track already holds, with the sound held back as far', () => {
    const xml = timed(undefined, [['a.mp4', 2]])
    expect(groupsOf(xml)).toEqual([
      {
        type: 'AVSplit',
        children: [
          { data: '2:300', leaf: 'clip', type: 'Leaf' },
          { data: '3:300', leaf: 'clip', type: 'Leaf' }
        ]
      }
    ])
    expect(xml).toMatch(/<playlist id="playlist2">[\s\S]*?<blank length="300"\/>/)
  })

  it('keeps the clips on the video track alone, sound inside, when a clip’s length cannot be read', () => {
    const { xml } = build(twoAudioOneMutedTemplate, ['a.mp4'])
    expect(entriesOf(xml, 'playlist6')).toEqual(['chain_skydock_0'])
    expect(entriesOf(xml, 'playlist4')).toEqual([])
  })
})

describe('montage — the committed template', () => {
  /* an audio track of its own under A1, heard, empty — for whatever the edit needs besides the jump */
  it('has a free audio track, heard, under the one the jump’s sound goes on', () => {
    const xml = fs.readFileSync(REPO_TEMPLATE, 'utf-8')
    const order = [...xml.matchAll(/<track producer="(tractor\d+)"\/>/g)].map((m) => m[1])
    expect(order.slice(0, 3)).toEqual(['tractor0', 'tractor6', 'tractor1'])
    expect(xml).toMatch(/<tractor id="tractor6"[\s\S]*?<track hide="video" producer="playlist8"\/>/)
    expect(entriesOf(xml, 'playlist8')).toEqual([])
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
    expect(entriesOf(xml, 'playlist6')).toEqual(['chain_skydock_0', 'chain_skydock_1'])
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

  const laid = (
    clips: { name: string; seconds: number; moments?: typeof JUMP; cropStart?: number }[]
  ) => {
    const { outputDir, groupDir, templatePath } = setup(twoAudioOneMutedTemplate)
    const result = createMontageProject({
      groupDir,
      outputDir,
      baseName: 'luc_favre_20260802',
      title: 'Luc Favre',
      templatePath,
      clips: clips.map(({ name, seconds, moments, cropStart }) => ({
        path: path.join(groupDir, 'videos', name),
        seconds,
        moments,
        cropStart
      }))
    })
    return fs.readFileSync(result.projectPath, 'utf-8')
  }

  /* every entry of a playlist as the editor reads it: which producer, and which part of it */
  const piecesOf = (xml: string, playlistId: string) => {
    const open = new RegExp(`<playlist id="${playlistId}"\\s*(/?)>`).exec(xml)
    if (!open || open[1] === '/') return []
    const rest = xml.slice(open.index + open[0].length)
    const body = rest.slice(0, rest.indexOf('</playlist>'))
    return [...body.matchAll(/<entry producer="([^"]+)" in="(\d+)" out="(\d+)"/g)].map((m) => ({
      producer: m[1],
      in: Number(m[2]),
      out: Number(m[3])
    }))
  }

  const propOf = (xml: string, name: string) => {
    const found = new RegExp(`<property name="${name}">([^<]*)</property>`).exec(xml)
    return found ? found[1] : null
  }

  /* Where the film changes is the editor's decision and theirs alone: the clip goes down whole and
     the moments are marked on it. */
  it('lays a clip with a jump in it whole, and never cuts it at the marks', () => {
    const xml = laid([{ name: 'jump.mp4', seconds: 455, moments: JUMP }])

    expect(piecesOf(xml, 'playlist6')).toEqual([
      { producer: 'chain_skydock_0_picture', in: 0, out: 455 * FPS - 1 }
    ])
    expect(groupsOf(xml)).toHaveLength(1)
  })

  it('lays the clips after it where they have always been laid', () => {
    const xml = laid([
      { name: 'jump.mp4', seconds: 455, moments: JUMP },
      { name: 'after.mp4', seconds: 10 }
    ])

    const pieces = piecesOf(xml, 'playlist6')
    expect(pieces).toHaveLength(2)
    /* the jump whole, then the next clip whole after it */
    expect(pieces[0]).toMatchObject({ in: 0, out: 455 * FPS - 1 })
    expect(pieces[1]).toMatchObject({ in: 0, out: 10 * FPS - 1 })
  })

  it('gives it its own sound under it, linked, as any other clip has', () => {
    const xml = laid([{ name: 'jump.mp4', seconds: 455, moments: JUMP }])

    const picture = piecesOf(xml, 'playlist6')
    const sound = piecesOf(xml, 'playlist4')
    expect(sound.map((p) => [p.in, p.out])).toEqual(picture.map((p) => [p.in, p.out]))
    const groups = groupsOf(xml)
    expect(groups).toHaveLength(1)
    /* both leaves name the same frame, one track apart */
    const [under, over] = groups[0].children.map((c: { data: string }) => c.data.split(':')[1])
    expect(under).toBe(over)
  })

  /* Most clips are not jumps: ground footage, a plane ride, a camera that measures nothing. Nothing
     is cut and nothing is trimmed away for them. */
  it('lays a clip with no jump in it whole, as it always was', () => {
    const xml = laid([{ name: 'ground.mp4', seconds: 33 }])

    expect(piecesOf(xml, 'playlist6')).toEqual([
      { producer: 'chain_skydock_0_picture', in: 0, out: 33 * FPS - 1 }
    ])
    expect(groupsOf(xml)).toHaveLength(1)
  })

  it('writes the moments on the clip, counted from the clip’s own start', () => {
    const xml = laid([{ name: 'jump.mp4', seconds: 455, moments: JUMP }])

    const markers = JSON.parse(propOf(xml, 'kdenlive:markers') ?? '[]')
    expect(markers.map((m: { comment: string }) => m.comment)).toEqual([
      'exit',
      'opening',
      'canopy',
      'ground'
    ])
    expect(markers[0].pos).toBe(JUMP.exit * FPS)
  })

  /* A guide is nailed to a frame of the film, so moving the clip it was about — which is the whole
     of editing — leaves it behind pointing at nothing. The moments are the clip's, and go with it. */
  it('puts nothing along the timeline, which a clip moving would leave behind', () => {
    const xml = laid([{ name: 'jump.mp4', seconds: 455, moments: JUMP }])

    expect(JSON.parse(propOf(xml, 'kdenlive:sequenceproperties.guides') ?? '[]')).toEqual([])
  })

  /* A copy trimmed at the front is a different clip from the one the camera shot, and the moments
     were measured on what the camera shot. */
  it('shifts the moments by what was trimmed off the front of the clip', () => {
    const xml = laid([{ name: 'jump.mp4', seconds: 425, moments: JUMP, cropStart: 30 }])

    const markers = JSON.parse(propOf(xml, 'kdenlive:markers') ?? '[]')
    expect(markers[0].pos).toBe((JUMP.exit - 30) * FPS)
    expect(markers.map((m: { comment: string }) => m.comment)).toEqual([
      'exit',
      'opening',
      'canopy',
      'ground'
    ])
  })

  it('says nothing of a moment the copy does not reach', () => {
    const xml = laid([{ name: 'jump.mp4', seconds: 122, moments: JUMP }])

    const markers = JSON.parse(propOf(xml, 'kdenlive:markers') ?? '[]')
    /* a copy cut at 122 s holds the exit and the opening, and neither the canopy nor the ground */
    expect(markers.map((m: { comment: string }) => m.comment)).toEqual(['exit', 'opening'])
    expect(piecesOf(xml, 'playlist6')).toHaveLength(1)
  })

  it('writes a project the editor can open', () => {
    expect(() => parsed(laid([{ name: 'jump.mp4', seconds: 455, moments: JUMP }]))).not.toThrow()
  })
})

/* A template is made for a film of a certain length and a montage is as long as its footage, so
   what the template puts at the ends is put where the film's ends actually are (RULES, Montage). */
describe('montage — the template’s furniture follows the film', () => {
  const furnished = (clips: [string, number][]) => {
    const { outputDir, groupDir, templatePath } = setup(templateWithFurniture)
    const result = createMontageProject({
      groupDir,
      outputDir,
      baseName: 'luc_favre_20260802',
      title: 'Luc Favre',
      templatePath,
      clips: clips.map(([name, seconds]) => ({
        path: path.join(groupDir, 'videos', name),
        seconds
      }))
    })
    return { ...result, xml: fs.readFileSync(result.projectPath, 'utf-8') }
  }

  /* one playlist read as the editor reads it: its blanks and its entries in order */
  const trackOf = (xml: string, playlistId: string) => {
    const open = new RegExp(`<playlist id="${playlistId}"\\s*(/?)>`).exec(xml)
    if (!open || open[1] === '/') return []
    const rest = xml.slice(open.index + open[0].length)
    const body = rest.slice(0, rest.indexOf('</playlist>'))
    /* an entry holding an effect is written open, and is still an entry */
    return [...body.matchAll(/<(blank|entry)([^>]*?)\/?>/g)].map((m) => ({
      what: m[1],
      length: Number(/length="(\d+)"/.exec(m[2])?.[1] ?? 0),
      in: Number(/in="(\d+)"/.exec(m[2])?.[1] ?? 0),
      out: Number(/out="(\d+)"/.exec(m[2])?.[1] ?? 0)
    }))
  }

  /* two clips of a hundred seconds: a film of 5000 frames, where the template's card sat at 4250 */
  const FILM = 5000

  it('moves the end card to follow the last clip, so the film ends on it', () => {
    const { xml } = furnished([
      ['a.mp4', 100],
      ['b.mp4', 100]
    ])

    const titles = trackOf(xml, 'playlist8')
    /* the blank before the card is widened, and the card itself is left as the template made it */
    expect(titles.at(-2)).toMatchObject({ what: 'blank', length: 3750 })
    expect(titles.at(-1)).toMatchObject({ what: 'entry', in: 0, out: 124 })
    const start = titles
      .slice(0, -1)
      .reduce((sum, i) => sum + (i.what === 'blank' ? i.length : i.out - i.in + 1), 0)
    expect(start).toBe(FILM)
  })

  it('leaves the titles in the middle where the template put them', () => {
    const { xml } = furnished([
      ['a.mp4', 100],
      ['b.mp4', 100]
    ])

    expect(trackOf(xml, 'playlist8').slice(0, 3)).toEqual([
      { what: 'entry', length: 0, in: 0, out: 124 },
      { what: 'blank', length: 1000, in: 0, out: 0 },
      { what: 'entry', length: 0, in: 0, out: 124 }
    ])
  })

  it('cuts the music where the film ends', () => {
    const { xml } = furnished([
      ['a.mp4', 100],
      ['b.mp4', 100]
    ])

    const music = trackOf(xml, 'playlist0')
    const plays = music.reduce(
      (sum, i) => sum + (i.what === 'blank' ? i.length : i.out - i.in + 1),
      0
    )
    /* the film is the footage and the card that follows it */
    expect(plays).toBe(FILM + 125)
  })

  it('says what it moved', () => {
    const { repositioned } = furnished([['a.mp4', 100]])
    expect(repositioned).toEqual(['the end card', 'the music'])
  })

  /* A film shorter than the template's own furniture cannot have its card pulled back without
     putting it before a title that has not happened yet, so the card is left where it is — and the
     music is still cut to where the last thing anybody sees ends, which is that card. */
  it('leaves the end card alone when the film is shorter than the template’s furniture', () => {
    const { xml, repositioned } = furnished([['a.mp4', 5]])

    expect(repositioned).toEqual(['the music'])
    expect(trackOf(xml, 'playlist8').at(-2)).toMatchObject({ what: 'blank', length: 3000 })
    const music = trackOf(xml, 'playlist0')
    const plays = music.reduce(
      (sum, i) => sum + (i.what === 'blank' ? i.length : i.out - i.in + 1),
      0
    )
    /* the card still ends at 4375, and the music now stops there instead of at 7600 */
    expect(plays).toBe(4375)
  })

  /* kdenlive writes its projects indented, and the spaces between one tag and the next are part of
     the document: read without knowing that, the last thing on a track is the newline after its last
     clip and no template is ever recognised. Which is what happened to the one that ships. */
  it('finds the furniture of a template written the way the editor writes one', () => {
    const { outputDir, groupDir, templatePath } = setup(
      templateWithFurniture.replace(/><(blank|entry)/g, '>\n  <$1')
    )
    const result = createMontageProject({
      groupDir,
      outputDir,
      baseName: 'luc_favre_20260802',
      title: 'Luc Favre',
      templatePath,
      clips: [{ path: path.join(groupDir, 'videos', 'a.mp4'), seconds: 100 }]
    })

    expect(result.repositioned).toEqual(['the end card', 'the music'])
  })

  it('writes a project the editor can open', () => {
    expect(() => parsed(furnished([['a.mp4', 100]]).xml)).not.toThrow()
  })
})

/* The same on every film, so it is not done by hand on every film (RULES, Montage). */
describe('montage — how the film opens and closes', () => {
  const fades = (clips: [string, number][], templateXml = templateWithFurniture) => {
    const { outputDir, groupDir, templatePath } = setup(templateXml)
    const result = createMontageProject({
      groupDir,
      outputDir,
      baseName: 'luc_favre_20260802',
      title: 'Luc Favre',
      templatePath,
      clips: clips.map(([name, seconds]) => ({
        path: path.join(groupDir, 'videos', name),
        seconds
      }))
    })
    return fs.readFileSync(result.projectPath, 'utf-8')
  }

  /* which effects sit where, read off the project: the fades kdenlive names in its own words */
  const effects = (xml: string) =>
    [...xml.matchAll(/<property name="kdenlive_id">([^<]+)<\/property>/g)].map((m) => m[1])

  /* Whatever comes first is the first thing anybody sees, and fading it up is a choice about the
     film rather than a fact about the footage. */
  it('never fades the first video up', () => {
    const xml = fades(
      [
        ['a.mp4', 100],
        ['b.mp4', 100]
      ],
      twoAudioOneMutedTemplate
    )

    expect(effects(xml)).not.toContain('fade_from_black')
  })

  it('closes into black when the footage is the last thing in the film', () => {
    const xml = fades(
      [
        ['a.mp4', 100],
        ['b.mp4', 100]
      ],
      twoAudioOneMutedTemplate
    )

    expect(effects(xml).filter((e) => e === 'fade_to_black')).toHaveLength(1)
  })

  /* and not when a template's end card follows it, since that card comes out of black on its own */
  it('leaves the closing to a template whose end card follows the film', () => {
    const xml = fades([['a.mp4', 100]])

    expect(effects(xml)).not.toContain('fade_to_black')
  })

  it('takes the music down where it ends rather than cutting it off', () => {
    const xml = fades([['a.mp4', 100]])
    expect(effects(xml)).toContain('volume')
  })

  it('writes a project the editor can open', () => {
    expect(() => parsed(fades([['a.mp4', 100]]))).not.toThrow()
  })
})
