import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { toHostPath } from './hostPath'
import { getGroupProcessedDir } from './process'
import type { Manifest, ManifestGroup } from './types'
import { hasCommand } from './utils'
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

/* How long the film runs, which is what says at a glance that the render is the whole jump and not
   a test of the first minute. Asked of ffprobe once per film as it is on disk: the board looks at
   every tandem each time it answers, and a film does not change length without changing size. */
const durations = new Map<string, number | null>()

const filmSeconds = (target: string, size: number, mtime: number) => {
  const key = `${target}\0${size}\0${mtime}`
  const known = durations.get(key)
  if (known !== undefined) return known
  let seconds: number | null = null
  if (hasCommand('ffprobe')) {
    try {
      const out = childProcess.execSync(
        `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${target.replace(/(["$`\\])/g, '\\$1')}"`,
        { encoding: 'utf-8' }
      )
      const parsed = Number.parseFloat(out.trim())
      seconds = Number.isFinite(parsed) ? Math.round(parsed) : null
    } catch {
      seconds = null
    }
  }
  durations.set(key, seconds)
  return seconds
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

/* Once there is an edit, the tandem is frozen. The project points at the copies by path, with its
   cuts as times inside each clip, and lives in the folder the passenger's name makes: a trim shifts
   every cut, a re-timed or removed clip goes missing, a new name moves the folder — and the editor
   says nothing about any of it. So nothing about the tandem changes here any more; changes happen in
   the editor. The lock is the project's existence and nothing else, so deleting the project lifts it. */
const EDIT_LOCKED = 'This tandem has an edit — change it in kdenlive.'

const hasEdit = (outputDir: string, group: ManifestGroup) =>
  isTandem(group) && tandemArtifacts(outputDir, group).project

/* a freed tandem is closed too: nothing of it is left here to change */
const frozenTandems = (manifest: Manifest, outputDir: string) =>
  new Set(manifest.groups.filter((g) => g.freed || hasEdit(outputDir, g)).map((g) => g.id))

/* everything about a jump that decides what its copies are and where they go — bookkeeping such as
   whether it was processed or delivered is not part of it */
const editedShape = (group: ManifestGroup) =>
  JSON.stringify({
    label: group.label,
    day: group.day ?? null,
    destination: group.destination ?? null,
    passenger: group.passenger
      ? [group.passenger.firstname.trim(), group.passenger.lastname.trim()]
      : null,
    files: group.files.map((f) => [
      f.id ?? f.path,
      f.mtime,
      f.cropStart ?? null,
      f.cropEnd ?? null,
      f.frame ?? null
    ])
  })

const sameEditedGroup = (a: ManifestGroup, b: ManifestGroup) => editedShape(a) === editedShape(b)

/* What the board shows on each tandem row, one readdir per tandem. The project's path is given as
   the machine running the editor knows it — the same translation the project itself is written
   with — so what the row shows is what has to be opened. */
const statTandemArtifacts = (manifest: Manifest, outputDir: string) => {
  const artifacts: Record<
    string,
    {
      project: boolean
      projectPath: string
      /* `path` is where the film is on this machine, for playing it in the browser */
      film: { size: number; mtime: number; seconds: number | null; path: string } | null
      baseName: string
    }
  > = {}
  for (const group of manifest.groups) {
    if (!isTandem(group)) continue
    const found = tandemArtifacts(outputDir, group)
    artifacts[group.id] = {
      project: found.project,
      projectPath: toHostPath(path.join(found.dir, `${found.baseName}.kdenlive`), outputDir),
      film: found.film
        ? {
            ...found.film,
            seconds: filmSeconds(
              path.join(found.dir, filmNameOf(found.baseName)),
              found.film.size,
              found.film.mtime
            ),
            path: path.join(found.dir, filmNameOf(found.baseName))
          }
        : null,
      baseName: found.baseName
    }
  }
  return artifacts
}

export {
  EDIT_LOCKED,
  filmNameOf,
  frozenTandems,
  hasEdit,
  isTandem,
  photosNameOf,
  rushesNameOf,
  sameEditedGroup,
  statTandemArtifacts,
  tandemArtifacts
}
