import * as fs from 'node:fs'
import * as path from 'node:path'
import { toHostPath } from './hostPath'
import { getGroupProcessedDir } from './process'
import type { Manifest, ManifestGroup } from './types'
import { mediaSeconds } from './lib/media'
import { hasCompletePassenger, isMontage } from './workspace'

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
    strayFilms: entries.filter((e) => e.endsWith('.mp4') && e !== filmNameOf(baseName))
  }
}

const secondsOf = (found: ReturnType<typeof montageArtifacts>) =>
  found.film
    ? filmSeconds(
        path.join(found.dir, filmNameOf(found.baseName)),
        found.film.size,
        found.film.mtime
      )
    : null

const EDIT_LOCKED = 'This montage has an edit — change it in kdenlive.'

const hasEdit = (outputDir: string, group: ManifestGroup) =>
  isNamedMontage(group) && montageArtifacts(outputDir, group).project

const frozenMontages = (manifest: Manifest, outputDir: string) =>
  new Set(manifest.groups.filter((g) => g.freed || hasEdit(outputDir, g)).map((g) => g.id))

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

const statMontageArtifacts = (manifest: Manifest, outputDir: string) => {
  const artifacts: Record<
    string,
    {
      project: boolean
      projectPath: string
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
