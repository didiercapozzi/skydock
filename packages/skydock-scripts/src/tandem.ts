import * as fs from 'node:fs'
import * as path from 'node:path'
import { toHostPath } from './hostPath'
import { getGroupProcessedDir } from './process'
import type { Manifest, ManifestGroup } from './types'
import { hasCompletePassenger } from './workspace'

/* A tandem is one jump delivered to one person: a passenger's name is what gives it a folder of its
   own with the videos and photos kept apart, and that shape is what montage and delivery need. */
const isTandem = (group: ManifestGroup) => hasCompletePassenger(group.passenger)

const filmNameOf = (baseName: string) => `${baseName}.mp4`

const photosNameOf = (baseName: string) => `${baseName}.photos.zip`

const rushesNameOf = (baseName: string) => `${baseName}.rushes.zip`

const statOrNull = (target: string) => {
  try {
    const stat = fs.statSync(target)
    return { size: stat.size, mtime: Math.floor(stat.mtimeMs / 1000) }
  } catch {
    return null
  }
}

/* What a tandem's folder actually holds. Nothing tells SkyDock when the editor finishes, so the
   disk is the only thing that can say whether a film has been rendered. */
const tandemArtifacts = (outputDir: string, group: ManifestGroup) => {
  const { dir, baseName } = getGroupProcessedDir(outputDir, group)
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  return {
    dir,
    baseName,
    project: entries.some((e) => e.endsWith('.kdenlive')),
    film: statOrNull(path.join(dir, filmNameOf(baseName))),
    photosZip: entries.includes(photosNameOf(baseName)),
    rushesZip: entries.includes(rushesNameOf(baseName)),
    /* an mp4 beside the expected one, which is what a different name in the render dialog leaves */
    strayFilms: entries.filter((e) => e.endsWith('.mp4') && e !== filmNameOf(baseName))
  }
}

/* What the board shows on each tandem row, one readdir per tandem. The project's path is given as
   the machine running the editor knows it — the same translation the project itself is written
   with — so what the row shows is what has to be opened. */
const statTandemArtifacts = (manifest: Manifest, outputDir: string) => {
  const artifacts: Record<
    string,
    {
      project: boolean
      projectPath: string
      film: { size: number; mtime: number } | null
      baseName: string
    }
  > = {}
  for (const group of manifest.groups) {
    if (!isTandem(group)) continue
    const found = tandemArtifacts(outputDir, group)
    artifacts[group.id] = {
      project: found.project,
      projectPath: toHostPath(path.join(found.dir, `${found.baseName}.kdenlive`), outputDir),
      film: found.film,
      baseName: found.baseName
    }
  }
  return artifacts
}

export { filmNameOf, isTandem, photosNameOf, rushesNameOf, statTandemArtifacts, tandemArtifacts }
