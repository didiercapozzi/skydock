import { mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { editSources, imageSources, musicSources } from './filmEdit'
import {
  clipLength,
  DEFAULT_FPS,
  DUCK_RAMP,
  fadeInOf,
  fadeInto,
  fadeOutOf,
  filmLength,
  heardSpans,
  layerFadesOf,
  musicFadesOf,
  OUTPUT_CRF,
  OUTPUT_FORMATS,
  POP,
  sourcesByName,
  speedOf,
  TEXT_FADE,
  textFadesOf,
  timelineEnd
} from './filmEditShape'
import type {
  EditClip,
  EditSource,
  EditText,
  FilmEdit,
  ImageSource,
  MusicSource,
  Span,
  TextFont
} from './filmEditShape'
import { isWholeFrame, ROTATE_FILTER } from './frameCrop'
import { inJob } from './live'
import { filmNameOf } from './montageNames'
import { getGroupProcessedDir, recodeVideo } from './process'
import { videoShape } from './proxy'
import { lastComplaint, run, runWatched, stoppable } from './tools'
import type { ManifestGroup } from './types'
import { ffmpegPath, hasCommand } from './utils'
import { passengerOf } from './workspace'

const SHORT_SIDE = 1080
const LONG_SIDE = 1920

const FONT_PATTERNS: Record<TextFont, string> = {
  clean: 'sans-serif',
  bold: 'sans-serif:bold',
  elegant: 'serif:italic',
  hand: 'cursive'
}

const SEEK_MARGIN = 0.1

const HD_COLOURS = 'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709'

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

const duckOf = (spans: Span[], underSound: number) =>
  spans
    .map((span) => {
      const ramp = span.ramp ?? DUCK_RAMP
      return `(1-${n(1 - (span.under ?? underSound))}*clip((t-${n(span.from)}+${n(ramp)})/${n(ramp)},0,1)*clip((${n(span.to)}+${n(ramp)}-t)/${n(ramp)},0,1))`
    })
    .reduce<string | null>((all, one) => (all === null ? one : `min(${all},${one})`), null)

const musicLevel = (volume: number, duck: string | null) =>
  duck === null ? n(volume) : `${n(volume)}*${duck}`

const ENCODERS = {
  h264: ['libx264', 'medium'],
  h265: ['libx265', 'medium'],
  av1: ['libsvtav1', '8']
} as const

const videoArgs = ({ format = 'h264', crf }: NonNullable<FilmEdit['output']>) => [
  '-c:v',
  ENCODERS[format][0],
  '-crf',
  String(crf ?? OUTPUT_CRF[format]),
  '-preset',
  ENCODERS[format][1],
  ...(format === 'h265' ? ['-tag:v', 'hvc1', '-x265-params', 'log-level=error'] : [])
]

const framed = (clip: EditClip) => {
  const turn = ROTATE_FILTER[clip.rotation ?? 0]
  const crop = clip.frame && !isWholeFrame({ ...clip.frame, fill: undefined })
  const even = (side: string, share: number) => `trunc(${side}*${n(share)}/2)*2`
  return [
    turn,
    crop && clip.frame
      ? `crop=${even('iw', clip.frame.width)}:${even('ih', clip.frame.height)}:${even('iw', clip.frame.x)}:${even('ih', clip.frame.y)}`
      : null
  ].filter((part) => part !== null)
}

const filmArgs = ({
  edit,
  sources,
  images = new Map(),
  music,
  width,
  height,
  fonts,
  textFileOf,
  out
}: {
  edit: FilmEdit
  sources: Map<string, EditSource>
  images?: Map<string, ImageSource>
  music: Map<string, MusicSource>
  width: number
  height: number
  fonts: Partial<Record<TextFont, string | null>>
  textFileOf: (id: string) => string
  out: string
}) => {
  const inputs: string[] = []
  const graph: string[] = []
  const fps = edit.output?.fps ?? DEFAULT_FPS
  const stereo = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'
  const parts: Array<{ label: string; length: number; fade: number }> = []
  const black = (name: string, length: number) => {
    graph.push(
      `color=c=black:s=${width}x${height}:r=${fps}:d=${n(length)},setsar=1,format=yuv420p[v${name}]`,
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
    const seeks = !source.still
    const offset = source.origin?.offset ?? 0
    const boardFilter = source.origin?.separate ? null : (source.origin?.filter ?? null)
    const held = clip.end - clip.start
    inputs.push(
      ...(source.still
        ? ['-loop', '1', '-framerate', String(fps), '-t', n(clip.end)]
        : [
            ...(clip.start + offset > 0 ? ['-ss', n(clip.start + offset)] : []),
            '-t',
            n(held + SEEK_MARGIN)
          ]),
      '-i',
      source.path
    )
    const from = seeks ? 0 : clip.start
    const to = seeks ? held : clip.end
    if (clip.gap) black(`g${index}`, clip.gap)
    parts.push({ label: `[v${index}][a${index}]`, length, fade: fadeInto(edit.clips, index) })
    const fadeIn = fadeInOf(edit.clips, index)
    const fadeOut = fadeOutOf(edit.clips, index)
    const dim = (filter: string) => [
      ...(fadeIn > 0 ? [`${filter}=t=in:st=0:d=${n(fadeIn)}`] : []),
      ...(fadeOut > 0 ? [`${filter}=t=out:st=${n(length - fadeOut)}:d=${n(fadeOut)}`] : [])
    ]
    graph.push(
      `[${index}:v]trim=start=${n(from)}:end=${n(to)},setpts=(PTS-STARTPTS)/${n(speed)},fps=${fps},${[...(boardFilter ? [boardFilter] : []), ...framed(clip), ''].join(',')}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p${['', ...dim('fade')].join(',')}[v${index}]`
    )
    graph.push(
      clip.sound && source.sound
        ? `[${index}:a]atrim=start=${n(from)}:end=${n(to)},asetpts=PTS-STARTPTS,${speed === 1 ? '' : `${tempo},`}${stereo},apad=whole_dur=${n(length)},atrim=end=${n(length)}${['', ...dim('afade')].join(',')}[a${index}]`
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
  const layers = edit.layers ?? []
  const layerBase = edit.clips.length + edit.music.length
  let beneath = 'joined'
  let picture = layerBase
  layers.forEach((layer, index) => {
    const until = layer.at + layer.seconds
    const { fadeIn, fadeOut } = layerFadesOf(layer)
    const fades = [
      ...(fadeIn > 0 ? [`fade=t=in:st=${n(layer.at)}:d=${n(fadeIn)}:alpha=1`] : []),
      ...(fadeOut > 0 ? [`fade=t=out:st=${n(until - fadeOut)}:d=${n(fadeOut)}:alpha=1`] : [])
    ]
    const shown = `setpts=PTS-STARTPTS+${n(layer.at)}/TB${fades.map((one) => `,${one}`).join('')}`
    const file = layer.name === undefined ? null : images.get(layer.name)
    if (layer.name !== undefined && !file)
      throw new Error(`The image ${layer.name} is not in the images folder any more.`)
    graph.push(
      layer.colour !== undefined
        ? `color=c=0x${layer.colour.slice(1)}:s=${width}x${height}:r=${fps}:d=${n(layer.seconds)},format=rgba,${shown}[layer${index}]`
        : `[${picture++}:v]scale=${Math.max(2, Math.round(width * layer.width))}:-2,format=rgba,${shown}[layer${index}]`
    )
    graph.push(
      `[${beneath}][layer${index}]overlay=x=${layer.colour !== undefined ? '0' : `W*${n(layer.x)}-w/2`}:y=${layer.colour !== undefined ? '0' : `H*${n(layer.y)}-h/2`}:eof_action=pass:enable=${quoted(`between(t,${n(layer.at)},${n(until)})`)}[over${index}]`
    )
    beneath = `over${index}`
  })
  graph.push(
    edit.texts.length === 0
      ? `[${beneath}]${HD_COLOURS}[film]`
      : `[${beneath}]${edit.texts
          .map((text) =>
            textFilter(text, textFileOf(text.id), fonts[text.font] ?? null, Math.min(width, height))
          )
          .join(',')},${HD_COLOURS}[film]`
  )
  const duck = duckOf(
    heardSpans(edit, (clip) => sources.get(clip.name)?.sound === true),
    edit.underSound
  )
  edit.music.forEach((piece, index) => {
    const source = music.get(piece.name)
    if (!source) throw new Error(`The music ${piece.name} is not in the music folder any more.`)
    const length = piece.end - piece.start
    const { fadeIn, fadeOut } = musicFadesOf(piece, edit.music)
    const delay = Math.round(piece.at * 1000)
    inputs.push('-i', source.path)
    graph.push(
      `[${edit.clips.length + index}:a]atrim=start=${n(piece.start)}:end=${n(piece.end)},asetpts=PTS-STARTPTS,${stereo},${[...(fadeIn > 0 ? [`afade=t=in:d=${n(fadeIn)}`] : []), ...(fadeOut > 0 ? [`afade=t=out:st=${n(length - fadeOut)}:d=${n(fadeOut)}`] : [])].map((one) => `${one},`).join('')}adelay=${delay}:all=1,volume=${quoted(musicLevel(piece.volume, duck))}:eval=frame[m${index}]`
    )
  })
  layers.forEach((layer) => {
    const file = layer.name === undefined ? null : images.get(layer.name)
    if (file)
      inputs.push('-loop', '1', '-framerate', String(fps), '-t', n(layer.seconds), '-i', file.path)
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
    ...videoArgs(edit.output ?? {}),
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
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

const filmShape = async (first: EditSource | undefined) => {
  const shape = first && !first.origin ? await videoShape(first.path) : null
  const upright = first?.origin
    ? first.origin.upright
    : shape
      ? shape.turned
        ? shape.width > shape.height
        : shape.height > shape.width
      : false
  return upright
    ? { width: SHORT_SIDE, height: LONG_SIDE }
    : { width: LONG_SIDE, height: SHORT_SIDE }
}

declare global {
  var skydockFormats: Promise<Array<(typeof OUTPUT_FORMATS)[number]>> | undefined
  var skydockFilters: Promise<string> | undefined
  var skydockRendering: Map<string, AbortController> | undefined
}

const availableFormats = () =>
  (globalThis.skydockFormats ??= (async () => {
    const ran = await run(await ffmpegPath(), ['-hide_banner', '-encoders'])
    return OUTPUT_FORMATS.filter(
      (format) => format === 'h264' || (ran.ok && ran.stdout.includes(` ${ENCODERS[format][0]} `))
    )
  })())

const availableFilters = () =>
  (globalThis.skydockFilters ??= (async () => {
    const ran = await run(await ffmpegPath(), ['-hide_banner', '-filters'])
    return ran.ok ? ran.stdout : ''
  })())

const drawtextRefusal = (filters: string, edit: FilmEdit) =>
  edit.texts.length === 0 || filters === '' || filters.includes(' drawtext ')
    ? null
    : "This computer's ffmpeg cannot draw the texts (it has no drawtext filter): take the texts off the film, or use an ffmpeg that has it."

const formatRefusal = async (edit: FilmEdit) => {
  const format = edit.output?.format ?? 'h264'
  return (await availableFormats()).includes(format)
    ? drawtextRefusal(await availableFilters(), edit)
    : `This computer's ffmpeg cannot make ${format.toUpperCase()}: choose H.264.`
}

const renderingNow = () => {
  if (!(globalThis.skydockRendering instanceof Map)) globalThis.skydockRendering = new Map()
  return globalThis.skydockRendering
}

const isRendering = (groupId: string) => renderingNow().has(groupId)

const cancelRendering = (groupId?: string) => {
  const going = [...renderingNow()].flatMap(([id, stop]) =>
    groupId === undefined || id === groupId ? [stop] : []
  )
  for (const stop of going) stop.abort()
  return going.length > 0
}

/* A clip whose frame cannot be done inside the film's own filters is made apart first, as the board has it. */
const separately = async (sources: EditSource[], edit: FilmEdit, folder: string) => {
  const used = new Set(edit.clips.map((clip) => clip.name))
  return await Promise.all(
    sources.map(async (source) => {
      const { origin } = source
      if (!origin?.separate || !origin.filter || !used.has(source.name)) return source
      const made = path.join(folder, `${path.parse(source.name).name}.mp4`)
      const done = await recodeVideo(
        source.path,
        made,
        origin.filter,
        origin.offset,
        origin.offset + source.seconds
      )
      if (!done.ok) throw new Error(`${source.name} could not be framed: ${done.reason}`)
      const { origin: _, ...plain } = source
      return { ...plain, path: made }
    })
  )
}

const renderFilm = async ({
  outputDir,
  group,
  edit
}: {
  outputDir: string
  group: ManifestGroup
  edit: FilmEdit
}) => {
  if (isRendering(group.id)) throw new Error('This film is already being rendered.')
  if (edit.clips.length === 0) throw new Error('The film has no clips.')
  const { dir, baseName } = getGroupProcessedDir(outputDir, group)
  const filmPath = path.join(dir, filmNameOf(baseName))
  const partPath = path.join(dir, `.${baseName}.rendering`)
  const name = filmNameOf(baseName)
  const stop = new AbortController()
  renderingNow().set(group.id, stop)
  let scratch: string | undefined
  try {
    if (!(await hasCommand('ffmpeg'))) throw new Error('ffmpeg is not installed.')
    const refused = await formatRefusal(edit)
    if (refused) throw new Error(refused)
    const folder = await mkdtemp(path.join(os.tmpdir(), 'skydock-render-'))
    scratch = folder
    await mkdir(dir, { recursive: true })
    return await inJob(
      {
        type: 'render',
        label: passengerOf(group).trim() || group.label,
        total: 1,
        scope: { groupIds: [group.id], destinations: [] }
      },
      async (rendering) => {
        rendering.rows([{ key: 'film', name, size: 0 }])
        rendering.row({ key: 'film', at: 'now', part: 0 })
        const pictures = await imageSources(outputDir)
        const sources = sourcesByName(
          pictures,
          await separately(await editSources(outputDir, group, { waiting: true }), edit, folder)
        )
        const music = new Map((await musicSources(outputDir)).map((one) => [one.name, one]))
        const images = new Map(pictures.map((one) => [one.name, one]))
        const used = [...new Set(edit.texts.map((text) => text.font))]
        const fonts = Object.fromEntries(
          await Promise.all(used.map(async (font) => [font, await fontFile(font)] as const))
        )
        await Promise.all(
          edit.texts.map((text) => writeFile(path.join(folder, `${text.id}.txt`), text.text))
        )
        const args = filmArgs({
          edit,
          sources,
          images,
          music,
          ...(await filmShape(sources.get(edit.clips[0]!.name))),
          fonts,
          textFileOf: (id) => path.join(folder, `${id}.txt`),
          out: partPath
        })
        const ran = await stoppable().run(stop.signal, async () =>
          runWatched(
            await ffmpegPath(),
            args,
            (percent) => rendering.row({ key: 'film', at: 'now', part: percent / 100 }),
            timelineEnd(edit)
          )
        )
        if (stop.signal.aborted) throw new Error('Render cancelled — the film is as it was before.')
        if (!ran.ok) throw new Error(lastComplaint(ran.stderr))
        await rename(partPath, filmPath)
        rendering.row({ key: 'film', at: 'done', size: (await stat(filmPath)).size })
        rendering.step()
        return { filmPath }
      }
    )
  } finally {
    renderingNow().delete(group.id)
    if (scratch) await rm(scratch, { recursive: true, force: true })
    await rm(partPath, { force: true })
  }
}

export {
  availableFormats,
  cancelRendering,
  formatRefusal,
  drawtextRefusal,
  duckOf,
  filmArgs,
  filmShape,
  isRendering,
  musicLevel,
  renderFilm,
  renderingNow
}
