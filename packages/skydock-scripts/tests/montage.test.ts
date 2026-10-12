// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { createMontageProject, listMontageTemplates } from '../src/montage'
import { createTmpDir } from './fixtures'

const REAL_TEMPLATE = path.join(import.meta.dirname, 'fixtures', 'house.kdenlive')

afterEach(() => {
  vi.unstubAllEnvs()
})

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
  const groupDir = path.join(outputDir, 'processed', 'Montages', 'Luc Favre')
  fs.mkdirSync(groupDir, { recursive: true })
  if (templateXml === undefined) return { outputDir, groupDir, templatePath: REAL_TEMPLATE }
  const templatePath = path.join(outputDir, 'templates', 'epco', 'epco.kdenlive')
  fs.mkdirSync(path.dirname(templatePath), { recursive: true })
  fs.writeFileSync(templatePath, templateXml)
  return { outputDir, groupDir, templatePath }
}

type Clip = Parameters<typeof createMontageProject>[0]['clips'][number]

const build = async (
  templateXml?: string,
  clips: (string | Clip)[] = [],
  photos: string[] = [],
  title = 'Luc Favre'
) => {
  const { outputDir, groupDir, templatePath } = setup(templateXml)
  const result = await createMontageProject({
    groupDir,
    outputDir,
    baseName: 'luc_favre_20260802',
    title,
    templatePath,
    clips: clips.map((c) => {
      const { path: name, proxy, ...rest } = typeof c === 'string' ? { path: c } : c
      return {
        ...rest,
        path: path.join(groupDir, 'videos', name),
        ...(proxy ? { proxy: path.join(groupDir, 'proxy', proxy) } : {})
      }
    }),
    photos: photos.map((p) => path.join(groupDir, 'photos', p))
  })
  return { ...result, outputDir, groupDir, xml: fs.readFileSync(result.projectPath, 'utf-8') }
}

const withTemplate = (xml: string) => {
  const outputDir = createTmpDir('skydock-montage-')
  const templateDir = path.join(outputDir, 'templates', 'epco')
  fs.mkdirSync(templateDir, { recursive: true })
  fs.writeFileSync(path.join(templateDir, 'epco.kdenlive'), xml)
  return { outputDir, templateDir }
}

const briefProject = async (outputDir: string) => {
  const result = await createMontageProject({
    groupDir: path.join(outputDir, 'g'),
    outputDir,
    baseName: 'b',
    title: 't',
    clips: []
  })
  return { ...result, xml: fs.readFileSync(result.projectPath, 'utf-8') }
}

const beforeFirstTrack = (chain: string) =>
  twoAudioOneMutedTemplate.replace(
    '<playlist id="playlist0"/>',
    `${chain}\n <playlist id="playlist0"/>`
  )

const entriesOf = (xml: string, playlistId: string) => {
  const open = new RegExp(`<playlist id="${playlistId}"\\s*(/?)>`).exec(xml)
  if (!open || open[1] === '/') return []
  const rest = xml.slice(open.index + open[0].length)
  const body = rest.slice(0, rest.indexOf('</playlist>'))
  return [...body.matchAll(/<entry producer="([^"]+)"/g)].map((m) => m[1])
}

type Said = { '@_name': string; '#text'?: string | number }
type Part = {
  '@_id'?: string
  '@_producer'?: string
  '@_title'?: string
  '@_root'?: string
  property?: Said | Said[]
  track?: Part | Part[]
  transition?: Part | Part[]
  entry?: Part | Part[]
  tractor?: Part | Part[]
  chain?: Part | Part[]
  producer?: Part | Part[]
  playlist?: Part | Part[]
}

const many = <T>(held: T | T[] | undefined): T[] =>
  held === undefined ? [] : Array.isArray(held) ? held : [held]

const named = (part: Part | undefined, name: string) =>
  many(part?.property).find((p) => p['@_name'] === name)

const parsed = (xml: string) => {
  const verdict = XMLValidator.validate(xml)
  if (verdict !== true) throw new Error(`${verdict.err.msg} (line ${verdict.err.line})`)
  const document: { mlt: Part } = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  }).parse(xml)
  return document
}

const sequenceOf = (xml: string) =>
  many(parsed(xml).mlt.tractor).find((t) => named(t, 'kdenlive:uuid') !== undefined)

const groupsOf = (xml: string) =>
  JSON.parse(String(named(sequenceOf(xml), 'kdenlive:sequenceproperties.groups')?.['#text']))

const chainProps = (xml: string, id: string) => {
  const chain = many(parsed(xml).mlt.chain).find((c) => c['@_id'] === id)
  return Object.fromEntries(
    many(chain?.property).map((p) => [
      p['@_name'],
      p['#text'] === undefined ? '' : String(p['#text'])
    ])
  )
}

describe('montage — a document the editor can open', () => {
  it('keeps a passenger’s name with an ampersand in the project', async () => {
    const { xml } = await build(twoAudioOneMutedTemplate, [], [], 'Jean & Marie')
    expect(parsed(xml).mlt['@_title']).toBe('Jean & Marie')
  })
})

const stackOf = (xml: string) =>
  many(sequenceOf(xml)?.track)
    .map((t) => t['@_producer'] ?? '')
    .filter((p) => p.startsWith('tractor'))

const blendedOf = (xml: string) => {
  const sequence = sequenceOf(xml)
  const stack = many(sequence?.track).map((t) => t['@_producer'])
  return many(sequence?.transition).map((t) => stack[Number(named(t, 'b_track')?.['#text'])] ?? '')
}

describe('montage — the template’s timeline, as its owner made it', () => {
  it('adds no track to it', async () => {
    const { xml } = await build(twoAudioOneMutedTemplate, ['a.mp4', 'b.mp4'])
    expect(stackOf(xml)).toEqual(stackOf(twoAudioOneMutedTemplate))
  })

  it('leaves the template’s own tracks exactly as they were', async () => {
    const { xml } = await build(templateWithFurniture, ['a.mp4'])
    expect(entriesOf(xml, 'playlist0')).toEqual(['music', 'music'])
    expect(entriesOf(xml, 'playlist8')).toEqual(['intro', 'middle', 'card'])
    expect(entriesOf(xml, 'playlist6')).toEqual([])
    expect(xml).toMatch(/<playlist id="playlist8">[\s\S]*?<blank length="3000"\/>/)
  })

  it('keeps every composition of a real kdenlive project on the track it blended', async () => {
    const before = fs.readFileSync(REAL_TEMPLATE, 'utf-8')
    const { xml } = await build(undefined, ['a.mp4'])
    expect(blendedOf(xml)).toEqual(blendedOf(before))
  })

  it('keeps clips the template grouped together, on the tracks they were on', async () => {
    const grouped = twoAudioOneMutedTemplate.replace(
      '<track producer="producer0"/>',
      `<property name="kdenlive:sequenceproperties.groups">[{"type":"AVSplit","children":[{"data":"2:0","leaf":"clip","type":"Leaf"},{"data":"3:0","leaf":"clip","type":"Leaf"}]},{"type":"Normal","children":[{"data":"4:10","leaf":"clip","type":"Leaf"}]}]</property><track producer="producer0"/>`
    )
    const { xml } = await build(grouped)
    expect(
      groupsOf(xml).map((g: { children: { data: string }[] }) => g.children.map((c) => c.data))
    ).toEqual([['2:0', '3:0'], ['4:10']])
  })
})

const laidOnTimeline = (xml: string) =>
  many(parsed(xml).mlt.playlist)
    .filter((p) => p['@_id'] !== 'main_bin')
    .flatMap((p) => many(p.entry))
    .filter((e) => e['@_producer']?.startsWith('chain_skydock'))

const binOf = (xml: string) =>
  many(many(parsed(xml).mlt.playlist).find((p) => p['@_id'] === 'main_bin')?.entry).map(
    (e) => e['@_producer'] ?? ''
  )

const stillsOf = (xml: string) =>
  many(parsed(xml).mlt.producer)
    .filter((p) => String(p['@_id'] ?? '').startsWith('producer_skydock_photo'))
    .map((p) => Object.fromEntries(many(p.property).map((q) => [q['@_name'], q['#text']])))

describe('montage — a film of photos', () => {
  it('puts the photos in the bin, in the order shot', async () => {
    const { xml, photos } = await build(
      twoAudioOneMutedTemplate,
      [],
      ['G0062266.JPG', 'G0062267.JPG']
    )
    expect(photos).toBe(2)
    expect(binOf(xml).filter((p: string) => p.startsWith('producer_skydock_photo'))).toEqual([
      'producer_skydock_photo_0',
      'producer_skydock_photo_1'
    ])
  })

  it('writes each as kdenlive writes a still: read as an image, five seconds long', async () => {
    const { xml } = await build(twoAudioOneMutedTemplate, [], ['G0062266.JPG'])
    const [still] = stillsOf(xml)
    expect(still).toMatchObject({
      mlt_service: 'qimage',
      'kdenlive:clip_type': 2,
      'kdenlive:clipname': 'G0062266.JPG',
      'kdenlive:duration': '00:00:05:00'
    })
    expect(String(still?.resource)).toMatch(/photos\/G0062266\.JPG$/)
  })

  it('numbers them on from the clips, so no two things in the bin share a name', async () => {
    const { xml } = await build(twoAudioOneMutedTemplate, ['a.mp4'], ['G0062266.JPG'])
    const ids = [...many(parsed(xml).mlt.chain), ...many(parsed(xml).mlt.producer)].map((n) =>
      Number(many(n.property).find((q) => q['@_name'] === 'kdenlive:id')?.['#text'])
    )
    expect(new Set(ids.filter(Number.isFinite)).size).toBe(ids.filter(Number.isFinite).length)
  })

  it('leaves the timeline as the template made it, as clips do', async () => {
    const { xml } = await build(twoAudioOneMutedTemplate, [], ['G0062266.JPG'])
    expect(stackOf(xml)).toEqual(stackOf(twoAudioOneMutedTemplate))
  })

  it('writes a project the editor can open from a real kdenlive project', async () => {
    const { xml } = await build(undefined, [], ['G0062266.JPG'])
    expect(() => parsed(xml)).not.toThrow()
  })
})

describe('montage — the clips wait in the bin', () => {
  it('puts every clip in the bin, in the order shot', async () => {
    const { xml } = await build(twoAudioOneMutedTemplate, ['a.mp4', 'b.mp4'])
    expect(binOf(xml).filter((p: string) => p.startsWith('chain_skydock'))).toEqual([
      'chain_skydock_0',
      'chain_skydock_1'
    ])
  })

  it('lays none of them on the timeline', async () => {
    const { xml } = await build(templateWithFurniture, ['a.mp4', 'b.mp4'])
    expect(laidOnTimeline(xml)).toEqual([])
  })

  it('gives each clip in the bin its whole sound and picture', async () => {
    const { xml } = await build(twoAudioOneMutedTemplate, ['a.mp4'])
    expect(chainProps(xml, 'chain_skydock_0')['set.test_audio']).toBeUndefined()
    expect(chainProps(xml, 'chain_skydock_0')['set.test_image']).toBeUndefined()
  })
})

describe('montage — where the film goes', () => {
  it('fills in where the film goes and its format', async () => {
    const { xml, groupDir } = await build(twoAudioOneMutedTemplate)
    expect(xml).toContain(
      `<property name="kdenlive:docproperties.renderurl">${path.join(groupDir, 'luc_favre_20260802.mp4')}</property>`
    )
    expect(xml).toContain('"kdenlive:docproperties.renderprofile">MP4-H264/AAC<')
  })
})

describe('montage — paths the editor can open', () => {
  it('writes host paths when the output directory is mounted from elsewhere', async () => {
    vi.stubEnv('SKYDOCK_HOST_OUTPUT_DIR', '/home/capo/Documents/skydock/output')
    const { xml, outputDir } = await build(twoAudioOneMutedTemplate, ['a.mp4'])
    expect(xml).toContain(
      '/home/capo/Documents/skydock/output/processed/Montages/Luc Favre/videos/a.mp4'
    )
    expect(xml).not.toContain(outputDir)
  })

  it('leaves paths alone when it runs where the editor runs', async () => {
    const { xml, groupDir } = await build(twoAudioOneMutedTemplate, ['a.mp4'])
    expect(xml).toContain(path.join(groupDir, 'videos', 'a.mp4'))
  })
})

describe('montage — the template survives the round trip', () => {
  it('keeps the title clips whole', async () => {
    const before = fs.readFileSync(REAL_TEMPLATE, 'utf-8')
    const { xml } = await build(undefined, ['a.mp4'])
    const titlesIn = (s: string) => (s.match(/kdenlivetitle/g) ?? []).length
    expect(titlesIn(xml)).toBe(titlesIn(before))
  })

  it('makes the template’s own music and logos absolute', async () => {
    const { xml } = await build(undefined)
    expect(xml).not.toMatch(/<property name="resource">template files\//)
  })

  it('follows a title clip’s images to the template it travelled with', async () => {
    const { outputDir, templateDir } = withTemplate(
      beforeFirstTrack(
        `<producer id="producer9"><property name="resource"></property><property name="mlt_service">kdenlivetitle</property><property name="xmldata">&lt;item&gt;&lt;content url="/home/someone-else/SkydiveVideo/template files/facebook.png"/&gt;&lt;/item&gt;</property></producer>`
      )
    )
    fs.mkdirSync(path.join(templateDir, 'template files'))
    fs.writeFileSync(path.join(templateDir, 'template files', 'facebook.png'), 'png')
    const { xml } = await briefProject(outputDir)
    expect(xml).toContain(
      `content url="${path.join(templateDir, 'template files', 'facebook.png')}"`
    )
    expect(xml).not.toContain('/home/someone-else/')
  })
})

describe('montage — choosing a template', () => {
  it('lists what is on offer', async () => {
    const outputDir = createTmpDir('skydock-templates-')
    fs.mkdirSync(path.join(outputDir, 'templates', 'epco'), { recursive: true })
    fs.writeFileSync(path.join(outputDir, 'templates', 'epco', 'p.kdenlive'), audioOnlyTemplate)
    fs.writeFileSync(path.join(outputDir, 'templates', 'bare.kdenlive'), audioOnlyTemplate)
    expect((await listMontageTemplates(outputDir)).map((t) => t.name)).toEqual(['bare', 'epco'])
  })

  it('takes the only template there without being told', async () => {
    const { outputDir } = withTemplate(twoAudioOneMutedTemplate)
    const result = await briefProject(outputDir)
    expect(result.template).toContain(path.join('templates', 'epco'))
  })

  it('asks which one rather than picking someone’s branding for them', async () => {
    const outputDir = createTmpDir('skydock-templates-')
    fs.mkdirSync(path.join(outputDir, 'templates'), { recursive: true })
    fs.writeFileSync(path.join(outputDir, 'templates', 'one.kdenlive'), twoAudioOneMutedTemplate)
    fs.writeFileSync(path.join(outputDir, 'templates', 'two.kdenlive'), twoAudioOneMutedTemplate)
    await expect(briefProject(outputDir)).rejects.toThrow(/one, two/)
  })

  it('relocates an asset whose name contains an ampersand', async () => {
    const { outputDir, templateDir } = withTemplate(
      beforeFirstTrack(
        `<chain id="chain0"><property name="resource">template files/Sky_MBB_&amp;_ASHUTOSH_Happy.mp3</property></chain>`
      )
    )
    fs.mkdirSync(path.join(templateDir, 'template files'))
    fs.writeFileSync(
      path.join(templateDir, 'template files', 'Sky_MBB_&_ASHUTOSH_Happy.mp3'),
      'mp3'
    )
    const { xml } = await briefProject(outputDir)
    const resource = /<property name="resource">([^<]*Sky_MBB[^<]*)</.exec(xml)?.[1] ?? ''
    expect(resource).toContain('&amp;')
    expect(fs.existsSync(resource.replace('&amp;', '&'))).toBe(true)
  })
})

describe('montage — a template that arrived without its files', () => {
  it('names what it could not find instead of passing over it', async () => {
    const { outputDir, templateDir } = withTemplate(
      beforeFirstTrack(
        `<chain id="chain0"><property name="resource">assets/logo.png</property></chain>\n <chain id="chain1"><property name="resource">assets/music.mp3</property></chain>`
      )
    )
    fs.mkdirSync(path.join(templateDir, 'assets'))
    fs.writeFileSync(path.join(templateDir, 'assets', 'logo.png'), 'png')
    const result = await briefProject(outputDir)
    expect(result.missingAssets).toEqual(['assets/music.mp3'])
  })

  it('says nothing when the template brought everything it needs', async () => {
    expect((await build(twoAudioOneMutedTemplate, ['a.mp4'])).missingAssets).toEqual([])
  })

  it('still writes the project, because the edit can start without the music', async () => {
    const { outputDir } = withTemplate(
      beforeFirstTrack(`<chain id="chain0"><property name="resource">gone.mp3</property></chain>`)
    )
    const result = await briefProject(outputDir)
    expect(fs.existsSync(result.projectPath)).toBe(true)
    expect(result.missingAssets).toContain('gone.mp3')
  })
})

describe('montage — clips that have a proxy', () => {
  it('plays the proxy and keeps the clip itself as the original', async () => {
    const { xml, groupDir } = await build(twoAudioOneMutedTemplate, [
      { path: 'a.mp4', proxy: 'a.mp4' }
    ])
    const props = chainProps(xml, 'chain_skydock_0')
    expect(props.resource).toBe(path.join(groupDir, 'proxy', 'a.mp4'))
    expect(props['kdenlive:proxy']).toBe(path.join(groupDir, 'proxy', 'a.mp4'))
    expect(props['kdenlive:originalurl']).toBe(path.join(groupDir, 'videos', 'a.mp4'))
  })

  it('says so plainly when a clip has none', async () => {
    const { xml, groupDir } = await build(twoAudioOneMutedTemplate, ['a.mp4'])
    const props = chainProps(xml, 'chain_skydock_0')
    expect(props.resource).toBe(path.join(groupDir, 'videos', 'a.mp4'))
    expect(props['kdenlive:proxy']).toBe('-')
    expect(props['kdenlive:originalurl']).toBeUndefined()
  })

  it('takes each clip on its own, so one missing proxy does not cost the others theirs', async () => {
    const { xml } = await build(twoAudioOneMutedTemplate, [
      { path: 'a.mp4', proxy: 'a.mp4' },
      'b.mp4'
    ])
    expect(chainProps(xml, 'chain_skydock_0')['kdenlive:proxy']).toContain('/proxy/a.mp4')
    expect(chainProps(xml, 'chain_skydock_1')['kdenlive:proxy']).toBe('-')
  })

  it('writes the proxy path the way the editing machine knows it', async () => {
    vi.stubEnv('SKYDOCK_HOST_OUTPUT_DIR', '/home/capo/Documents/skydock/output')
    const { xml } = await build(twoAudioOneMutedTemplate, [{ path: 'a.mp4', proxy: 'a.mp4' }])
    const props = chainProps(xml, 'chain_skydock_0')
    expect(props['kdenlive:proxy']).toContain('/home/capo/Documents/skydock/output')
    expect(props['kdenlive:originalurl']).toContain('/home/capo/Documents/skydock/output')
  })
})

describe('montage — the jump marked on the clip', () => {
  const FPS = 25
  const JUMP = { exit: 65, opening: 120.3, canopy: 123, landing: 223 }

  const marked = async (clip: { seconds?: number; moments?: typeof JUMP; cropStart?: number }) => {
    const { xml } = await build(twoAudioOneMutedTemplate, [{ path: 'jump.mp4', ...clip }])
    const markers = chainProps(xml, 'chain_skydock_0')['kdenlive:markers']
    return {
      xml,
      markers:
        markers === undefined ? [] : (JSON.parse(markers) as { comment: string; pos: number }[])
    }
  }

  it('writes the moments on the clip, counted from the clip’s own start', async () => {
    const { markers } = await marked({ seconds: 455, moments: JUMP })
    expect(markers.map((m) => m.comment)).toEqual(['exit', 'opening', 'canopy', 'ground'])
    expect(markers[0]!.pos).toBe(JUMP.exit * FPS)
  })

  it('puts nothing along the timeline, which a clip moving would leave behind', async () => {
    const { xml } = await marked({ seconds: 455, moments: JUMP })
    const guides = named(sequenceOf(xml), 'kdenlive:sequenceproperties.guides')
    expect(guides).toBeUndefined()
  })

  it('shifts the moments by what was trimmed off the front of the clip', async () => {
    const { markers } = await marked({ seconds: 425, moments: JUMP, cropStart: 30 })
    expect(markers[0]!.pos).toBe((JUMP.exit - 30) * FPS)
    expect(markers.map((m) => m.comment)).toEqual(['exit', 'opening', 'canopy', 'ground'])
  })

  it('says nothing of a moment the copy does not reach', async () => {
    const { markers } = await marked({ seconds: 122, moments: JUMP })
    expect(markers.map((m) => m.comment)).toEqual(['exit', 'opening'])
  })

  it('marks nothing on a clip with no jump in it', async () => {
    expect((await marked({ seconds: 33 })).markers).toEqual([])
  })
})
