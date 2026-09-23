// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inspectTemplate } from '../src/montage'
import { relinkTemplate } from '../src/templateLinks'
import { createTmpDir } from './fixtures'

/* A template made on somebody else's machine names its music and its logos where they sat on that
   machine. Brought in here, each is looked for among the files that came with it and written back
   as the way from the project to that file, so the template says where its files are in its own
   terms — and goes on saying it wherever the folder is copied afterwards. */

let home: string

const wrote = (body: string, root = '/home/someone/club') => {
  const project = path.join(home, 'club.kdenlive')
  fs.writeFileSync(
    project,
    `<?xml version='1.0' encoding='utf-8'?>\n<mlt root="${root}">\n${body}\n</mlt>\n`
  )
  return project
}

const put = (name: string, text = 'x') => {
  const target = path.join(home, name)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, text)
  return target
}

const said = (project: string) => fs.readFileSync(project, 'utf-8')

beforeEach(() => {
  home = createTmpDir('skydock-relink-')
})

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true })
})

describe('a template that names its files where they were on another machine', () => {
  it('points each one at the copy that came with it', () => {
    put('template files/music.mp3')
    const project = wrote(
      '<chain id="c0"><property name="resource">/home/someone/club/template files/music.mp3</property></chain>'
    )

    expect(relinkTemplate(project)).toEqual({ relinked: ['music.mp3'], missing: [] })
    expect(said(project)).toContain('<property name="resource">template files/music.mp3</property>')
  })

  it('finds it by its name even when it came in beside the project rather than in a folder', () => {
    put('logo.png')
    const project = wrote(
      '<chain id="c0"><property name="resource">/elsewhere/deep/branding/logo.png</property></chain>'
    )

    relinkTemplate(project)
    expect(said(project)).toContain('<property name="resource">logo.png</property>')
  })

  it('points the images inside its titles at theirs too, leaving the rest of the title alone', () => {
    put('template files/logo.png')
    const project = wrote(
      '<producer id="p0"><property name="xmldata">&lt;kdenlivetitle&gt;&lt;item type="text"&gt;hello&lt;/item&gt;&lt;content url="/home/someone/club/template files/logo.png"/&gt;&lt;/kdenlivetitle&gt;</property></producer>'
    )

    expect(relinkTemplate(project).relinked).toEqual(['logo.png'])
    const after = said(project)
    expect(after).toContain('content url="template files/logo.png"')
    expect(after).toContain('&lt;item type="text"&gt;hello&lt;/item&gt;')
  })

  it('leaves a file nothing was brought in for exactly as it was, and says it is missing', () => {
    const project = wrote(
      '<chain id="c0"><property name="resource">/home/someone/club/music.mp3</property></chain>'
    )

    expect(relinkTemplate(project)).toEqual({ relinked: [], missing: ['music.mp3'] })
    expect(said(project)).toContain(
      '<property name="resource">/home/someone/club/music.mp3</property>'
    )
  })

  it('leaves what is not a file at all: a colour, the empty clip, a producer naming nothing', () => {
    const project = wrote(
      '<producer id="p0"><property name="resource">0x000000ff</property></producer>\n' +
        '<producer id="p1"><property name="resource">black</property></producer>\n' +
        '<producer id="p2"><property name="resource"/></producer>'
    )

    expect(relinkTemplate(project)).toEqual({ relinked: [], missing: [] })
    expect(said(project)).toContain('0x000000ff')
    expect(said(project)).toContain('black')
  })

  it('forgets the folder the other machine counted from, since every file now says its own way', () => {
    put('music.mp3')
    const project = wrote(
      '<chain id="c0"><property name="resource">/home/someone/club/music.mp3</property></chain>'
    )

    relinkTemplate(project)
    expect(said(project)).toContain('root=""')
    expect(said(project)).not.toContain('/home/someone/club')
  })

  it('changes nothing in one whose files already say their own way', () => {
    put('template files/music.mp3')
    const project = wrote(
      '<chain id="c0"><property name="resource">template files/music.mp3</property></chain>',
      ''
    )
    const before = said(project)

    expect(relinkTemplate(project)).toEqual({ relinked: [], missing: [] })
    expect(said(project)).toBe(before)
  })

  it('leaves a template that reads as whole reading as whole', () => {
    put('template files/music.mp3')
    put('template files/logo.png')
    const project = wrote(
      '<chain id="c0"><property name="resource">/home/someone/club/template files/music.mp3</property></chain>\n' +
        '<producer id="p0"><property name="xmldata">&lt;content url="/home/someone/club/template files/logo.png"/&gt;</property></producer>'
    )

    relinkTemplate(project)
    const read = inspectTemplate(project)
    expect(read.missing).toEqual([])
    expect(read.assets.map((a) => a.name).sort()).toEqual(['logo.png', 'music.mp3'])
  })
})
