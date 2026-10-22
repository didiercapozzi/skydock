import { mkdir, readdir, readFile } from 'node:fs/promises'
import * as path from 'node:path'
import {
  filmEditSchema,
  IMAGE_EXTENSIONS,
  MUSIC_EXTENSIONS,
  STILL_EXTENSIONS,
  STILL_MAX,
  UNDER_SOUND
} from './filmEditShape'
import type { EditSource, FilmEdit } from './filmEditShape'
import { jsonText } from './lib/json'
import { pathExists, writeJsonAtomic } from './lib/fs'
import { mediaHasSound, mediaSeconds } from './lib/media'
import { MOMENTS } from './moments'
import { editNameOf } from './montageNames'
import { isWholeFrame, pictureFilter, turnedSize } from './frameCrop'
import { montageClips } from './montageClips'
import { getGroupProcessedDir, shownShape } from './process'
import { videoShape } from './proxy'
import type { ManifestFile, ManifestGroup } from './types'
import { mapWithLimit } from './utils'
import { setEditAside } from './projectHistory'
import { passengerOf } from './workspace'

const TITLE_SECONDS = 4

const editPathOf = (outputDir: string, group: ManifestGroup) => {
  const { dir, baseName } = getGroupProcessedDir(outputDir, group)
  return path.join(dir, editNameOf(baseName))
}

const getMusicDir = (outputDir: string) => path.join(outputDir, 'music')

const getImagesDir = (outputDir: string) => path.join(outputDir, 'images')

const hasEnding = (name: string, endings: readonly string[]) =>
  endings.some((ending) => name.toLowerCase().endsWith(ending))

const isImageFile = (name: string) => hasEnding(name, IMAGE_EXTENSIONS)

const isMusicFile = (name: string) => hasEnding(name, MUSIC_EXTENSIONS)

const visibleFiles = async (dir: string, endings: readonly string[]) =>
  (await readdir(dir, { withFileTypes: true }).catch(() => []))
    .filter(
      (entry) => entry.isFile() && !entry.name.startsWith('.') && hasEnding(entry.name, endings)
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

const SOURCES_PARALLEL = 4

/* The clips of a montage as the film is edited, from the clips themselves: what the board did to a clip
   — its trim, its frame, its turn — is on the clip's small copy for playing and done again by the render.
   A clip changed on the board whose small copy is not made yet cannot be played as it is in the montage:
   it waits, and is listed apart. */
const montageSources = async (outputDir: string, group: ManifestGroup) => {
  const clips = montageClips(group, outputDir)
  const found = await mapWithLimit(clips, SOURCES_PARALLEL, async (clip) => {
    const { file } = clip
    if (!(await pathExists(file.path))) return null
    const made = clip.cut ? await pathExists(clip.cut) : true
    if (!clip.video) {
      if (!hasEnding(file.filename, STILL_EXTENSIONS)) return null
      const picture = clip.cut ?? file.path
      const source: EditSource = {
        name: clip.name,
        path: picture,
        play: picture,
        seconds: STILL_MAX,
        sound: false,
        marks: [],
        still: true,
        key: clip.key,
        small: true
      }
      return { source, made, filename: file.filename }
    }
    const length = await mediaSeconds(file.path)
    if (length === null || length <= 0) return null
    const from = file.cropStart ?? 0
    const seconds = (file.cropEnd ?? length) - from
    if (seconds <= 0) return null
    const moments = file.moments ?? null
    const marks = moments
      ? MOMENTS.flatMap(({ which }) => {
          const second = moments[which]
          const at = second === undefined ? -1 : second - from
          return at >= 0 && at <= seconds ? [{ which, at }] : []
        })
      : []
    const proxied = Boolean(file.proxy) && (await pathExists(file.proxy!))
    const source: EditSource = {
      name: clip.name,
      path: file.path,
      play: clip.cut ?? (proxied ? file.proxy! : file.path),
      seconds,
      sound: await mediaHasSound(file.path),
      marks,
      key: clip.key,
      small: clip.cut ? made : proxied,
      ...(clip.changed ? { origin: await originOf(file, from) } : {})
    }
    return { source, made, filename: file.filename }
  })
  const there = found.filter((one) => one !== null)
  return {
    sources: there.filter((one) => one.made).map((one) => one.source),
    waiting: there
      .filter((one) => !one.made)
      .map((one) => ({ source: one.source, filename: one.filename }))
  }
}

const originOf = async (file: ManifestFile, offset: number) => {
  const shape = await shownShape(file.path)
  const filter = shape
    ? pictureFilter({ frame: file.frame, rotation: file.rotation, ...shape })
    : null
  const turned = shape ? turnedSize(shape.width, shape.height, file.rotation) : null
  const cut = file.frame && !isWholeFrame({ ...file.frame, fill: undefined })
  const width = turned ? turned.width * (cut && file.frame ? file.frame.width : 1) : 0
  const height = turned ? turned.height * (cut && file.frame ? file.frame.height : 1) : 0
  return {
    offset,
    filter,
    upright: file.frame?.fill === 'blur' ? false : height > width,
    ...(filter?.includes(';') ? { separate: true } : {})
  }
}

/* the clips the film can use now; the render also takes those that are still waiting for their small copy */
const editSources = async (
  outputDir: string,
  group: ManifestGroup,
  options?: { waiting?: boolean }
): Promise<EditSource[]> => {
  const { sources, waiting } = await montageSources(outputDir, group)
  return [...sources, ...(options?.waiting ? waiting.map((one) => one.source) : [])].sort((a, b) =>
    a.name.localeCompare(b.name)
  )
}

const imageSources = async (outputDir: string) => {
  const dir = getImagesDir(outputDir)
  const names = await visibleFiles(dir, IMAGE_EXTENSIONS)
  const found = await mapWithLimit(names, SOURCES_PARALLEL, async (name) => {
    const full = path.join(dir, name)
    const shape = await videoShape(full)
    return shape?.width && shape.height
      ? { name, path: full, width: shape.width, height: shape.height }
      : null
  })
  return found.filter((one) => one !== null)
}

const musicSources = async (outputDir: string) => {
  const dir = getMusicDir(outputDir)
  const names = await visibleFiles(dir, MUSIC_EXTENSIONS)
  const found = await mapWithLimit(names, SOURCES_PARALLEL, async (name) => {
    const full = path.join(dir, name)
    const length = await mediaSeconds(full)
    return length === null || length <= 0 ? null : { name, path: full, seconds: length }
  })
  return found.filter((one) => one !== null)
}

const firstEdit = (group: ManifestGroup, sources: EditSource[]) => {
  const title = passengerOf(group).trim()
  return {
    version: 1 as const,
    clips: sources
      .filter((source) => !source.still)
      .map((source, index) => ({
        id: `clip-${index + 1}`,
        name: source.name,
        start: 0,
        end: source.seconds,
        sound: false
      })),
    music: [],
    texts: title
      ? [
          {
            id: 'text-1',
            text: title,
            at: 0,
            seconds: TITLE_SECONDS,
            effect: 'fade' as const,
            font: 'bold' as const,
            x: 0.5,
            y: 0.5,
            size: 0.09,
            colour: '#ffffff'
          }
        ]
      : [],
    underSound: UNDER_SOUND
  }
}

const readEdit = async (editPath: string) => {
  const text = await readFile(editPath, 'utf-8').catch(() => null)
  if (text === null) return { edit: null, unreadable: null }
  const parsed = jsonText.pipe(filmEditSchema).safeParse(text)
  if (parsed.success) return { edit: parsed.data, unreadable: null }
  const issue = parsed.error.issues[0]
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
  return { edit: null, unreadable: issue ? `${where}${issue.message}` : 'it is not an edit' }
}

const readOrSetAside = async (outputDir: string, editPath: string) => {
  const read = await readEdit(editPath)
  if (read.unreadable === null) return { edit: read.edit, setAside: null }
  return {
    edit: null,
    setAside: { as: await setEditAside(outputDir, editPath), reason: read.unreadable }
  }
}

/* the montage's folder is made with its first edit: nothing else is put in it before */
const saveEdit = async (editPath: string, edit: FilmEdit) => {
  await mkdir(path.dirname(editPath), { recursive: true })
  await writeJsonAtomic(editPath, edit)
}

export {
  editPathOf,
  editSources,
  firstEdit,
  getImagesDir,
  getMusicDir,
  imageSources,
  isImageFile,
  isMusicFile,
  montageSources,
  musicSources,
  readOrSetAside,
  saveEdit
}
