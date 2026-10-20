import { readdir, readFile } from 'node:fs/promises'
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
import { getGroupProcessedDir } from './process'
import { getCutProxyDir, videoShape } from './proxy'
import type { Manifest, ManifestGroup } from './types'
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

const editSources = async (
  manifest: Manifest,
  outputDir: string,
  group: ManifestGroup
): Promise<EditSource[]> => {
  const { dir } = getGroupProcessedDir(outputDir, group)
  const videos = path.join(dir, 'videos')
  const names = (await readdir(videos, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
  const copies = new Map(
    group.files.flatMap((f) => (f.processed ? [[path.basename(f.processed.path), f]] : []))
  )
  const found = await mapWithLimit(names, SOURCES_PARALLEL, async (name) => {
    const full = path.join(videos, name)
    const proxy = path.join(getCutProxyDir(outputDir, group.id), `${path.parse(name).name}.mp4`)
    const [length, sound] = await Promise.all([mediaSeconds(full), mediaHasSound(full)])
    if (length === null || length <= 0) return null
    const measured = copies.get(name)
    const source = measured && manifest.files.find((f) => f.id === measured.id)
    const moments = measured?.moments ?? source?.moments ?? null
    const cropStart = measured?.cropStart ?? 0
    const marks = moments
      ? MOMENTS.flatMap(({ which }) => {
          const second = moments[which]
          const at = second === undefined ? -1 : second - cropStart
          return at >= 0 && at <= length ? [{ which, at }] : []
        })
      : []
    return {
      name,
      path: full,
      play: (await pathExists(proxy)) ? proxy : full,
      seconds: length,
      sound,
      marks
    }
  })
  const photos = path.join(dir, 'photos')
  const stills = (await visibleFiles(photos, STILL_EXTENSIONS)).map((name) => ({
    name,
    path: path.join(photos, name),
    play: path.join(photos, name),
    seconds: STILL_MAX,
    sound: false,
    marks: [],
    still: true
  }))
  return [...found.filter((one) => one !== null), ...stills]
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

const saveEdit = (editPath: string, edit: FilmEdit) => writeJsonAtomic(editPath, edit)

export {
  editPathOf,
  editSources,
  firstEdit,
  getImagesDir,
  getMusicDir,
  imageSources,
  isImageFile,
  isMusicFile,
  musicSources,
  readOrSetAside,
  saveEdit
}
