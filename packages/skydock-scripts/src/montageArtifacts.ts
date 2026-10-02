import * as fs from 'node:fs'
import * as path from 'node:path'
import { toHostPath } from './hostPath'
import { getGroupProcessedDir } from './process'
import type { Manifest, ManifestGroup } from './types'
import { mediaSeconds } from './lib/media'
import { hasCompletePassenger, isMontage } from './workspace'

/* A montage is one jump delivered to one person: a passenger's name is what gives it a folder of its
   own with the videos and photos kept apart, and that shape is what montage and upload need. */
const isNamedMontage = (group: ManifestGroup) =>
  isMontage(group) && hasCompletePassenger(group.passenger)

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
   a test of the first minute. Asked of ffprobe once per film as it is on disk, and never while an
   answer waits: the board looks at every montage each time it answers, so a film not measured yet
   is measured behind the answer, and the next one says its length. A film does not change length
   without changing size. */
const durations = new Map<string, number | null>()
const measuring = new Set<string>()

const filmSeconds = (target: string, size: number, mtime: number) => {
  const key = `${target}\0${size}\0${mtime}`
  const known = durations.get(key)
  if (known !== undefined) return known
  if (!measuring.has(key)) {
    measuring.add(key)
    void mediaSeconds(target).then((exact) => {
      durations.set(key, exact === null ? null : Math.round(exact))
      measuring.delete(key)
    })
  }
  return null
}

/* What a montage's folder actually holds. Nothing tells SkyDock when the editor finishes, so the
   disk is the only thing that can say whether a film has been rendered. */
const montageArtifacts = (outputDir: string, group: ManifestGroup) => {
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

/* how long a folder's film runs, asked behind the look when it has not been yet */
const secondsOf = (found: ReturnType<typeof montageArtifacts>) =>
  found.film
    ? filmSeconds(
        path.join(found.dir, filmNameOf(found.baseName)),
        found.film.size,
        found.film.mtime
      )
    : null

/* Once there is an edit, the montage is frozen. The project points at the copies by path, with its
   cuts as times inside each clip, and lives in the folder the passenger's name makes: a trim shifts
   every cut, a re-timed or removed clip goes missing, a new name moves the folder — and the editor
   says nothing about any of it. So nothing about the montage changes here any more; changes happen in
   the editor. The lock is the project's existence and nothing else, so deleting the project lifts it. */
const EDIT_LOCKED = 'This montage has an edit — change it in kdenlive.'

const hasEdit = (outputDir: string, group: ManifestGroup) =>
  isNamedMontage(group) && montageArtifacts(outputDir, group).project

/* a freed montage is closed too: nothing of it is left here to change */
const frozenMontages = (manifest: Manifest, outputDir: string) =>
  new Set(manifest.groups.filter((g) => g.freed || hasEdit(outputDir, g)).map((g) => g.id))

/* everything about a jump that decides what its copies are and where they go — bookkeeping such as
   whether it was processed or uploaded is not part of it */
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
      f.frame ?? null,
      f.rotation ?? 0
    ])
  })

const sameEditedGroup = (a: ManifestGroup, b: ManifestGroup) => editedShape(a) === editedShape(b)

/* What the board shows on each montage row, one readdir per montage. The project's path is given as
   the machine running the editor knows it — the same translation the project itself is written
   with — so what the row shows is what has to be opened. */
const statMontageArtifacts = (manifest: Manifest, outputDir: string) => {
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
    if (!isNamedMontage(group)) continue
    const found = montageArtifacts(outputDir, group)
    artifacts[group.id] = {
      project: found.project,
      projectPath: toHostPath(path.join(found.dir, `${found.baseName}.kdenlive`), outputDir),
      film: found.film
        ? {
            ...found.film,
            seconds: secondsOf(found),
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
  frozenMontages,
  hasEdit,
  isNamedMontage,
  sameEditedGroup,
  statMontageArtifacts,
  montageArtifacts,
  secondsOf
}
