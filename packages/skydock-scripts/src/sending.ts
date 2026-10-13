import { readdir } from 'node:fs/promises'
import * as path from 'node:path'
import { filmNameOf } from './montageNames'
import { montageArtifacts } from './montageArtifacts'
import { itemsFrom, stemOf } from './sendNames'
import type { PartFile } from './sendNames'
import type { ManifestGroup, SendPart, SendPlan } from './types'
import { pathExists } from './lib/fs'
import { isVideoFile, mapWithLimit, sizeOf } from './utils'

const partFiles = async (group: ManifestGroup, outputDir: string, film: string | null) => {
  const artifacts = await montageArtifacts(outputDir, group)
  const photosDir = path.join(artifacts.dir, 'photos')
  const project = path.join(artifacts.dir, `${artifacts.baseName}.kdenlive`)
  const renderedFilm =
    film ??
    (artifacts.film
      ? path.join(artifacts.dir, filmNameOf(artifacts.baseName))
      : artifacts.strayFilms.length === 1
        ? path.join(artifacts.dir, artifacts.strayFilms[0]!)
        : null)
  const one = async (file: string, name = path.basename(file)) => ({
    file,
    name,
    size: await sizeOf(file)
  })
  const videoFiles = group.files.filter((f) => isVideoFile(f.path))
  const videoThere = await mapWithLimit(videoFiles, 16, (f) => pathExists(f.path))
  const photoNames = (await pathExists(photosDir)) ? (await readdir(photosDir)).sort() : []
  return {
    videos: await mapWithLimit(
      videoFiles.filter((_, index) => videoThere[index]),
      16,
      (f) => one(f.path, f.filename)
    ),
    photos: await mapWithLimit(photoNames, 16, (name) => one(path.join(photosDir, name))),
    film: renderedFilm ? [await one(renderedFilm)] : [],
    project: (await pathExists(project)) ? [await one(project)] : []
  } satisfies Record<SendPart, PartFile[]>
}

const sendItems = async (
  group: ManifestGroup,
  outputDir: string,
  zips: SendPlan['zips'],
  film: string | null = null
) => itemsFrom(await partFiles(group, outputDir, film), stemOf(group), zips)

export {
  DEFAULT_PLAN,
  itemsFrom,
  PARTS,
  planOf,
  projectFolderOf,
  slugOf,
  stemOf,
  zipNameOf
} from './sendNames'
export { sendItems }
export type { PartFile, SendItem } from './sendNames'
