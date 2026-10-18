import { readdir } from 'node:fs/promises'
import * as path from 'node:path'
import { outputKeyOf } from './fileStatus'
import { toHostPath } from './hostPath'
import { getGroupProcessedDir } from './process'
import type { Manifest, ManifestGroup } from './types'
import { mtimeSeconds, statOrNull } from './lib/fs'
import { mediaSeconds } from './lib/media'
import { EDIT_LOCKED, editNameOf, filmNameOf } from './montageNames'
import { mapWithLimit } from './utils'
import { hasCompletePassenger, isMontage } from './workspace'

const isNamedMontage = (group: ManifestGroup) =>
  isMontage(group) && hasCompletePassenger(group.passenger)

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

const montageArtifacts = async (outputDir: string, group: ManifestGroup) => {
  const { dir, baseName } = getGroupProcessedDir(outputDir, group)
  const entries: string[] = await readdir(dir).catch(() => [])
  const stat = await statOrNull(path.join(dir, filmNameOf(baseName)))
  return {
    dir,
    baseName,
    project: entries.some((e) => e.endsWith('.kdenlive') || e === editNameOf(baseName)),
    edit: entries.includes(editNameOf(baseName)),
    film: stat ? { size: stat.size, mtime: mtimeSeconds(stat) } : null,
    strayFilms: entries.filter((e) => e.endsWith('.mp4') && e !== filmNameOf(baseName))
  }
}

const secondsOf = (found: Awaited<ReturnType<typeof montageArtifacts>>) =>
  found.film
    ? filmSeconds(
        path.join(found.dir, filmNameOf(found.baseName)),
        found.film.size,
        found.film.mtime
      )
    : null

const hasEdit = async (outputDir: string, group: ManifestGroup) =>
  isNamedMontage(group) && (await montageArtifacts(outputDir, group)).project

const FROZEN_PARALLEL = 16

const frozenMontages = async (manifest: Manifest, outputDir: string) => {
  const frozen = await mapWithLimit(
    manifest.groups,
    FROZEN_PARALLEL,
    async (g) => g.freed || (await hasEdit(outputDir, g))
  )
  return new Set(manifest.groups.filter((_, i) => frozen[i]).map((g) => g.id))
}

const editedShape = (group: ManifestGroup) =>
  JSON.stringify({
    label: group.label,
    day: group.day ?? null,
    destination: group.destination ?? null,
    passenger: group.passenger
      ? [group.passenger.firstname.trim(), group.passenger.lastname.trim()]
      : null,
    files: group.files.map((f) => [
      outputKeyOf(f),
      f.mtime,
      f.cropStart ?? null,
      f.cropEnd ?? null,
      f.frame ?? null,
      f.rotation ?? 0
    ])
  })

const sameEditedGroup = (a: ManifestGroup, b: ManifestGroup) => editedShape(a) === editedShape(b)

const factOf = (found: Awaited<ReturnType<typeof montageArtifacts>>, outputDir: string) => ({
  project: found.project,
  edit: found.edit,
  projectPath: toHostPath(path.join(found.dir, `${found.baseName}.kdenlive`), outputDir),
  film: found.film
    ? {
        ...found.film,
        seconds: secondsOf(found),
        path: path.join(found.dir, filmNameOf(found.baseName))
      }
    : null,
  baseName: found.baseName
})

const statMontageArtifacts = async (manifest: Manifest, outputDir: string) => {
  const named = manifest.groups.filter(isNamedMontage)
  const founds = await mapWithLimit(named, FROZEN_PARALLEL, (g) => montageArtifacts(outputDir, g))
  return Object.fromEntries(named.map((g, i) => [g.id, factOf(founds[i]!, outputDir)]))
}

export {
  EDIT_LOCKED,
  factOf,
  filmNameOf,
  frozenMontages,
  hasEdit,
  isNamedMontage,
  sameEditedGroup,
  statMontageArtifacts,
  montageArtifacts,
  secondsOf
}
