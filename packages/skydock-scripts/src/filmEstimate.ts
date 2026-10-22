import { mkdtemp, rm, stat } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { editSources, imageSources } from './filmEdit'
import { clipLength, CRF_RANGE, estimateKey, sampleWindows, sourcesByName } from './filmEditShape'
import type { EditSource, FilmEdit } from './filmEditShape'
import { filmArgs, filmShape, isRendering } from './filmRender'
import { run } from './tools'
import type { ManifestGroup } from './types'
import { ffmpegPath } from './utils'

const measureFilm = async ({
  edit,
  sources,
  width,
  height
}: {
  edit: FilmEdit
  sources: Map<string, EditSource>
  width: number
  height: number
}) => {
  const windows = sampleWindows(edit, sources)
  if (windows.length === 0) return null
  const clips = windows.map((window, i) => {
    const {
      gap: _gap,
      fade: _fade,
      fadeIn: _in,
      fadeOut: _out,
      markers: _marks,
      ...clip
    } = edit.clips.find((one) => one.id === window.clipId)!
    return { ...clip, id: `sample-${i}`, start: window.start, end: window.end, sound: false }
  })
  const seconds = clips.reduce((total, clip) => total + clipLength(clip), 0)
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'skydock-estimate-'))
  try {
    const bytes = async (crf: number) => {
      const out = path.join(scratch, `sample-${crf}.mp4`)
      const args = filmArgs({
        edit: {
          version: 1,
          clips,
          music: [],
          texts: [],
          underSound: edit.underSound,
          output: { ...edit.output, crf }
        },
        sources,
        music: new Map(),
        width,
        height,
        fonts: {},
        textFileOf: () => path.join(scratch, 'none.txt'),
        out
      })
      const ran = await run(await ffmpegPath(), ['-hide_banner', '-loglevel', 'error', ...args])
      if (!ran.ok) throw new Error('The size could not be measured.')
      return (await stat(out)).size
    }
    const [best, smallest] = await Promise.all([bytes(CRF_RANGE.least), bytes(CRF_RANGE.most)])
    return [
      { crf: CRF_RANGE.least, bytesPerSecond: best / seconds },
      { crf: CRF_RANGE.most, bytesPerSecond: smallest / seconds }
    ]
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

declare global {
  var skydockEstimates: Map<string, Promise<Awaited<ReturnType<typeof measureFilm>>>> | undefined
}

const KEPT = 20

const estimateFor = async ({
  outputDir,
  group,
  edit
}: {
  outputDir: string
  group: ManifestGroup
  edit: FilmEdit
}) => {
  if (isRendering(group.id)) return null
  const key = estimateKey(group.id, edit)
  const kept = (globalThis.skydockEstimates ??= new Map())
  const known = kept.get(key)
  if (known) return known
  const pictures = await imageSources(outputDir)
  const sources = sourcesByName(pictures, await editSources(outputDir, group, { waiting: true }))
  const first = edit.clips[0] ? sources.get(edit.clips[0].name) : undefined
  const measuring = measureFilm({ edit, sources, ...(await filmShape(first)) }).catch(() => {
    kept.delete(key)
    return null
  })
  kept.set(key, measuring)
  for (const old of [...kept.keys()].slice(0, Math.max(0, kept.size - KEPT))) kept.delete(old)
  return measuring
}

export { estimateFor, measureFilm }
