import { mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { editSources, musicSources } from './filmEdit'
import {
  clipLength,
  DUCK_RAMP,
  fadeInOf,
  fadeInto,
  fadeOutOf,
  filmLength,
  heardSpans,
  musicFadesOf,
  OUTPUT_CRF,
  OUTPUT_SIZES,
  POP,
  speedOf,
  TEXT_FADE,
  textFadesOf,
  timelineEnd
} from './filmEditShape'
import type { EditSource, EditText, FilmEdit, MusicSource, Span, TextFont } from './filmEditShape'
import { inJob } from './live'
import { filmNameOf } from './montageNames'
import { getGroupProcessedDir } from './process'
import { videoShape } from './proxy'
import { lastComplaint, run, runWatched } from './tools'
import type { Manifest, ManifestGroup } from './types'
import { ffmpegPath, hasCommand } from './utils'
import { passengerOf } from './workspace'

const FPS = 30

const FONT_PATTERNS: Record<TextFont, string> = {
  clean: 'sans-serif',
  bold: 'sans-serif:bold',
  elegant: 'serif:italic',
  hand: 'cursive'
}

const n = (value: number) => String(Math.round(value * 1000) / 1000)

const quoted = (value: string) => `'${value.replaceAll('\\', '/').replaceAll("'", '')}'`

const shown = (at: number, until: number) =>
  `if(lt(t,${n(at)}),0,if(lt(t,${n(at + TEXT_FADE)}),(t-${n(at)})/${n(TEXT_FADE)},if(lt(t,${n(until - TEXT_FADE)}),1,if(lt(t,${n(until)}),(${n(until)}-t)/${n(TEXT_FADE)},0))))`

const easing = (at: number) => `pow(max(0,1-(t-${n(at)})/${n(TEXT_FADE)}),2)`

const fadedBy = (at: number, until: number, fadeIn: number, fadeOut: number) =>
  `${fadeIn > 0 ? `*clip((t-${n(at)})/${n(fadeIn)},0,1)` : ''}${fadeOut > 0 ? `*clip((${n(until)}-t)/${n(fadeOut)},0,1)` : ''}`

const textFilter = (text: EditText, file: string, font: string | null, short: number) => {
  const until = text.at + text.seconds
  const { fadeIn, fadeOut } = textFadesOf(text)
  const size =
    text.effect === 'pop'
      ? `h*${n(text.size)}*min(1,0.6+0.4*max(0,t-${n(text.at)})/${n(POP)})`
      : `h*${n(text.size)}`
  const x =
    text.effect === 'lower-third'
      ? `w*${n(text.x)}-tw/2-w*0.05*${easing(text.at)}`
      : `w*${n(text.x)}-tw/2`
  const y =
    text.effect === 'rise' ? `h*${n(text.y)}-th/2+h*0.04*${easing(text.at)}` : `h*${n(text.y)}-th/2`
  return [
    'drawtext=expansion=none',
    `textfile=${quoted(file)}`,
    ...(font ? [`fontfile=${quoted(font)}`] : []),
    `fontcolor=0x${text.colour.slice(1)}`,
    `fontsize=${quoted(size)}`,
    `x=${quoted(x)}`,
    `y=${quoted(y)}`,
    `alpha=${quoted(`${shown(text.at, until)}${fadedBy(text.at, until, fadeIn, fadeOut)}`)}`,
    'shadowcolor=black@0.45',
    'shadowx=2',
    'shadowy=2',
    ...(text.effect === 'lower-third'
      ? ['box=1', 'boxcolor=black@0.45', `boxborderw=${Math.round(short * 0.02)}`]
      : []),
    `enable=${quoted(`between(t,${n(text.at)},${n(until)})`)}`
  ].join(':')
}

const duckOf = (spans: Span[]) =>
  spans
    .map(
      ({ from, to }) =>
        `clip((t-${n(from)}+${n(DUCK_RAMP)})/${n(DUCK_RAMP)},0,1)*clip((${n(to)}+${n(DUCK_RAMP)}-t)/${n(DUCK_RAMP)},0,1)`
    )
    .reduce<string | null>((all, one) => (all === null ? one : `max(${all},${one})`), null)

const musicLevel = (volume: number, underSound: number, duck: string | null) =>
  duck === null ? n(volume) : `${n(volume)}*(1-${n(1 - underSound)}*${duck})`

const filmArgs = ({
  edit,
  sources,
  music,
  width,
  height,
  fonts,
  textFileOf,
  out
}: {
  edit: FilmEdit
  sources: Map<string, EditSource>
  music: Map<string, MusicSource>
  width: number
  height: number
  fonts: Partial<Record<TextFont, string | null>>
  textFileOf: (id: string) => string
  out: string
}) => {
  const inputs: string[] = []
  const graph: string[] = []
  const stereo = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'
  const parts: Array<{ label: string; length: number; fade: number }> = []
  const black = (name: string, length: number) => {
    graph.push(
      `color=c=black:s=${width}x${height}:r=${FPS}:d=${n(length)},setsar=1,format=yuv420p[v${name}]`,
      `anullsrc=r=48000:cl=stereo,atrim=end=${n(length)},${stereo}[a${name}]`
    )
    parts.push({ label: `[v${name}][a${name}]`, length, fade: 0 })
  }
  edit.clips.forEach((clip, index) => {
    const source = sources.get(clip.name)
    if (!source) throw new Error(`${clip.name} is not in the montage any more.`)
    const length = clipLength(clip)
    const speed = speedOf(clip)
    const tempo = speed < 0.5 ? `atempo=0.5,atempo=${n(speed / 0.5)}` : `atempo=${n(speed)}`
    inputs.push(
      ...(source.still ? ['-loop', '1', '-framerate', String(FPS), '-t', n(clip.end)] : []),
      '-i',
      source.path
    )
    if (clip.gap) black(`g${index}`, clip.gap)
    parts.push({ label: `[v${index}][a${index}]`, length, fade: fadeInto(edit.clips, index) })
    const fadeIn = fadeInOf(edit.clips, index)
    const fadeOut = fadeOutOf(edit.clips, index)
    const dim = (filter: string) => [
      ...(fadeIn > 0 ? [`${filter}=t=in:st=0:d=${n(fadeIn)}`] : []),
      ...(fadeOut > 0 ? [`${filter}=t=out:st=${n(length - fadeOut)}:d=${n(fadeOut)}`] : [])
    ]
    graph.push(
      `[${index}:v]trim=start=${n(clip.start)}:end=${n(clip.end)},setpts=(PTS-STARTPTS)/${n(speed)},fps=${FPS},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p${['', ...dim('fade')].join(',')}[v${index}]`
    )
    graph.push(
      clip.sound && source.sound
        ? `[${index}:a]atrim=start=${n(clip.start)}:end=${n(clip.end)},asetpts=PTS-STARTPTS,${speed === 1 ? '' : `${tempo},`}${stereo},apad=whole_dur=${n(length)},atrim=end=${n(length)}${['', ...dim('afade')].join(',')}[a${index}]`
        : `anullsrc=r=48000:cl=stereo,atrim=end=${n(length)},${stereo}[a${index}]`
    )
  })
  const tail = timelineEnd(edit) - filmLength(edit)
  if (tail > 0.001) black('t', tail)
  const runs = parts.reduce<Array<{ parts: typeof parts; fade: number }>>((all, part) => {
    if (part.fade > 0 || all.length === 0) all.push({ parts: [part], fade: part.fade })
    else all.at(-1)!.parts.push(part)
    return all
  }, [])
  runs.forEach((run, i) =>
    graph.push(
      `${run.parts.map((part) => part.label).join('')}concat=n=${run.parts.length}:v=1:a=1[rv${i}][ra${i}]`
    )
  )
  let length = runs[0]!.parts.reduce((total, part) => total + part.length, 0)
  let video = 'rv0'
  let heard = 'ra0'
  runs.slice(1).forEach((run, k) => {
    const i = k + 1
    graph.push(
      `[${video}][rv${i}]xfade=transition=fade:duration=${n(run.fade)}:offset=${n(length - run.fade)}[xv${i}]`,
      `[${heard}][ra${i}]acrossfade=d=${n(run.fade)}:c1=tri:c2=tri[xa${i}]`
    )
    video = `xv${i}`
    heard = `xa${i}`
    length += run.parts.reduce((total, part) => total + part.length, 0) - run.fade
  })
  graph.push(`[${video}]null[joined]`, `[${heard}]anull[camera]`)
  graph.push(
    edit.texts.length === 0
      ? '[joined]null[film]'
      : `[joined]${edit.texts
          .map((text) =>
            textFilter(text, textFileOf(text.id), fonts[text.font] ?? null, Math.min(width, height))
          )
          .join(',')}[film]`
  )
  const duck = duckOf(heardSpans(edit, (clip) => sources.get(clip.name)?.sound === true))
  edit.music.forEach((piece, index) => {
    const source = music.get(piece.name)
    if (!source) throw new Error(`The music ${piece.name} is not in the music folder any more.`)
    const length = piece.end - piece.start
    const { fadeIn, fadeOut } = musicFadesOf(piece)
    const delay = Math.round(piece.at * 1000)
    inputs.push('-i', source.path)
    graph.push(
      `[${edit.clips.length + index}:a]atrim=start=${n(piece.start)}:end=${n(piece.end)},asetpts=PTS-STARTPTS,${stereo},${[...(fadeIn > 0 ? [`afade=t=in:d=${n(fadeIn)}`] : []), ...(fadeOut > 0 ? [`afade=t=out:st=${n(length - fadeOut)}:d=${n(fadeOut)}`] : [])].map((one) => `${one},`).join('')}adelay=${delay}:all=1,volume=${quoted(musicLevel(piece.volume, edit.underSound, duck))}:eval=frame[m${index}]`
    )
  })
  graph.push(
    edit.music.length === 0
      ? '[camera]anull[sound]'
      : `[camera]${edit.music.map((_, index) => `[m${index}]`).join('')}amix=inputs=${edit.music.length + 1}:duration=first:normalize=0[sound]`
  )
  return [
    '-y',
    ...inputs,
    '-filter_complex',
    graph.join(';'),
    '-map',
    '[film]',
    '-map',
    '[sound]',
    '-c:v',
    'libx264',
    '-crf',
    String(OUTPUT_CRF[edit.output?.quality ?? 'normal']),
    '-preset',
    'medium',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(FPS),
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-t',
    n(timelineEnd(edit)),
    '-f',
    'mp4',
    out
  ]
}

const fontFile = async (font: TextFont) => {
  if (!(await hasCommand('fc-match'))) return null
  const ran = await run('fc-match', ['-f', '%{file}', FONT_PATTERNS[font]])
  return ran.ok && ran.stdout.trim() !== '' ? ran.stdout.trim() : null
}

const filmShape = async (first: EditSource | undefined, size: 'full' | 'small' = 'full') => {
  const shape = first ? await videoShape(first.path) : null
  const upright = shape
    ? shape.turned
      ? shape.width > shape.height
      : shape.height > shape.width
    : false
  const short = OUTPUT_SIZES[size]
  const long = Math.round((short * 16) / 9)
  return upright ? { width: short, height: long } : { width: long, height: short }
}

declare global {
  var skydockRendering: Set<string> | undefined
}

const renderingNow = () => (globalThis.skydockRendering ??= new Set())

const isRendering = (groupId: string) => renderingNow().has(groupId)

const renderFilm = async ({
  manifest,
  outputDir,
  group,
  edit
}: {
  manifest: Manifest
  outputDir: string
  group: ManifestGroup
  edit: FilmEdit
}) => {
  if (isRendering(group.id)) throw new Error('This film is already being rendered.')
  if (edit.clips.length === 0) throw new Error('The film has no clips.')
  if (!(await hasCommand('ffmpeg'))) throw new Error('ffmpeg is not installed.')
  const { dir, baseName } = getGroupProcessedDir(outputDir, group)
  const filmPath = path.join(dir, filmNameOf(baseName))
  const partPath = path.join(dir, `.${baseName}.rendering`)
  const name = filmNameOf(baseName)
  renderingNow().add(group.id)
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'skydock-render-'))
  try {
    return await inJob(
      { type: 'render', label: passengerOf(group).trim() || group.label, total: 1 },
      async (rendering) => {
        rendering.rows([{ key: 'film', name, size: 0 }])
        rendering.row({ key: 'film', at: 'now', part: 0 })
        const sources = new Map(
          (await editSources(manifest, outputDir, group)).map((one) => [one.name, one])
        )
        const music = new Map((await musicSources(outputDir)).map((one) => [one.name, one]))
        const used = [...new Set(edit.texts.map((text) => text.font))]
        const fonts = Object.fromEntries(
          await Promise.all(used.map(async (font) => [font, await fontFile(font)] as const))
        )
        await Promise.all(
          edit.texts.map((text) => writeFile(path.join(scratch, `${text.id}.txt`), text.text))
        )
        const args = filmArgs({
          edit,
          sources,
          music,
          ...(await filmShape(sources.get(edit.clips[0]!.name), edit.output?.size)),
          fonts,
          textFileOf: (id) => path.join(scratch, `${id}.txt`),
          out: partPath
        })
        const ran = await runWatched(
          await ffmpegPath(),
          args,
          (percent) => rendering.row({ key: 'film', at: 'now', part: percent / 100 }),
          timelineEnd(edit)
        )
        if (!ran.ok) throw new Error(lastComplaint(ran.stderr))
        await rename(partPath, filmPath)
        rendering.row({ key: 'film', at: 'done', size: (await stat(filmPath)).size })
        rendering.step()
        return { filmPath }
      }
    )
  } finally {
    renderingNow().delete(group.id)
    await rm(scratch, { recursive: true, force: true })
    await rm(partPath, { force: true })
  }
}

export { duckOf, filmArgs, filmShape, isRendering, musicLevel, renderFilm }
