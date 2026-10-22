import * as path from 'node:path'
import { handedOver } from './boardChange'
import { filmNameOf } from './montageNames'
import { montageArtifacts } from './montageArtifacts'
import { itemsFrom, stemOf } from './sendNames'
import type { PartFile } from './sendNames'
import type { ManifestFile, ManifestGroup, SendPart, SendPlan } from './types'
import { pathExists } from './lib/fs'
import { isVideoFile, mapWithLimit, sizeOf } from './utils'

const one = async (file: string, name = path.basename(file)) => ({
  file,
  name,
  size: await sizeOf(file)
})

const presentOf = async (files: { path: string; filename: string }[]) => {
  const there = await mapWithLimit(files, 16, (f) => pathExists(f.path))
  return mapWithLimit(
    files.filter((_, index) => there[index]),
    16,
    (f) => one(f.path, f.filename)
  )
}

const partFiles = async (group: ManifestGroup, outputDir: string, film: string | null) => {
  const artifacts = await montageArtifacts(outputDir, group)
  const renderedFilm =
    film ??
    (artifacts.film
      ? path.join(artifacts.dir, filmNameOf(artifacts.baseName))
      : artifacts.strayFilms.length === 1
        ? path.join(artifacts.dir, artifacts.strayFilms[0]!)
        : null)
  return {
    videos: await presentOf(group.files.filter((f) => isVideoFile(f.path)).map(handedOver)),
    photos: await presentOf(group.files.filter((f) => !isVideoFile(f.path)).map(handedOver)),
    film: renderedFilm ? [await one(renderedFilm)] : [],
    project: await mapWithLimit(artifacts.projectFiles, 2, (file) => one(file))
  } satisfies Record<SendPart, PartFile[]>
}

const sendItems = async (
  group: ManifestGroup,
  outputDir: string,
  zips: SendPlan['zips'],
  film: string | null = null
) => itemsFrom(await partFiles(group, outputDir, film), stemOf(group), zips)

const sendFiles = async (files: ManifestFile[], stem: string, zips: SendPlan['zips']) =>
  itemsFrom(
    {
      videos: await presentOf(files.filter((f) => isVideoFile(f.path))),
      photos: await presentOf(files.filter((f) => !isVideoFile(f.path))),
      film: [],
      project: []
    },
    stem,
    zips
  )

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
export { sendFiles, sendItems }
export type { PartFile, SendItem } from './sendNames'
