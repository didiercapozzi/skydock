import { readdir } from 'node:fs/promises'
import * as path from 'node:path'
import { outputKeyOf } from './fileStatus'
import { getGroupProcessedDir } from './process'
import type { Manifest, ManifestGroup } from './types'
import { mtimeSeconds, statOrNull } from './lib/fs'
import { mediaSeconds } from './lib/media'
import { editNameOf, filmNameOf, FREED_LOCKED } from './montageNames'
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
  const edit = entries.includes(editNameOf(baseName))
  return {
    dir,
    baseName,
    edit,
    projectFiles: edit ? [path.join(dir, editNameOf(baseName))] : [],
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

type MontageLock = 'freed' | 'edit'

const folderLock = async (outputDir: string, group: ManifestGroup) => {
  if (!isNamedMontage(group)) return null
  const found = await montageArtifacts(outputDir, group)
  return found.edit ? 'edit' : null
}

const FROZEN_PARALLEL = 16

const montageLocks = async (manifest: Manifest, outputDir: string) => {
  const locks = await mapWithLimit(manifest.groups, FROZEN_PARALLEL, async (g) =>
    g.freed ? ('freed' as const) : await folderLock(outputDir, g)
  )
  return new Map(
    manifest.groups.flatMap((g, i) => {
      const lock = locks[i]
      return lock ? [[g.id, lock] as const] : []
    })
  )
}

const frozenMontages = async (manifest: Manifest, outputDir: string) =>
  new Set(
    [...(await montageLocks(manifest, outputDir))].flatMap(([id, lock]) =>
      lock === 'freed' ? [id] : []
    )
  )

const lockedSaid = () => FREED_LOCKED

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

const factOf = (found: Awaited<ReturnType<typeof montageArtifacts>>) => ({
  edit: found.edit,
  projectFiles: found.projectFiles,
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
  return Object.fromEntries(named.map((g, i) => [g.id, factOf(founds[i]!)]))
}

export {
  factOf,
  filmNameOf,
  folderLock,
  FREED_LOCKED,
  frozenMontages,
  isNamedMontage,
  lockedSaid,
  montageLocks,
  sameEditedGroup,
  statMontageArtifacts,
  montageArtifacts,
  secondsOf
}
export type { MontageLock }
