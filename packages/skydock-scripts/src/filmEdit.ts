import { readdir, readFile } from 'node:fs/promises'
import * as path from 'node:path'
import { filmEditSchema, MUSIC_EXTENSIONS, UNDER_SOUND } from './filmEditShape'
import type { EditSource, FilmEdit } from './filmEditShape'
import { jsonText } from './lib/json'
import { pathExists, writeJsonAtomic } from './lib/fs'
import { mediaHasSound, mediaSeconds } from './lib/media'
import { MOMENTS } from './moments'
import { editNameOf } from './montageNames'
import { getGroupProcessedDir } from './process'
import { getCutProxyDir } from './proxy'
import type { Manifest, ManifestGroup } from './types'
import { mapWithLimit } from './utils'
import { passengerOf } from './workspace'

const TITLE_SECONDS = 4

const editPathOf = (outputDir: string, group: ManifestGroup) => {
  const { dir, baseName } = getGroupProcessedDir(outputDir, group)
  return path.join(dir, editNameOf(baseName))
}

const getMusicDir = (outputDir: string) => path.join(outputDir, 'music')

const isMusicFile = (name: string) =>
  MUSIC_EXTENSIONS.some((ending) => name.toLowerCase().endsWith(ending))

const SOURCES_PARALLEL = 4

const editSources = async (manifest: Manifest, outputDir: string, group: ManifestGroup) => {
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
    const length = await mediaSeconds(full)
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
      sound: await mediaHasSound(full),
      marks
    }
  })
  return found.filter((one) => one !== null)
}

const musicSources = async (outputDir: string) => {
  const dir = getMusicDir(outputDir)
  const names = (await readdir(dir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && isMusicFile(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
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
    clips: sources.map((source, index) => ({
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
  if (text === null) return null
  const parsed = jsonText.pipe(filmEditSchema).safeParse(text)
  return parsed.success ? parsed.data : null
}

const saveEdit = (editPath: string, edit: FilmEdit) => writeJsonAtomic(editPath, edit)

export {
  editPathOf,
  editSources,
  firstEdit,
  getMusicDir,
  isMusicFile,
  musicSources,
  readEdit,
  saveEdit
}
