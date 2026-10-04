import * as fs from 'node:fs'
import * as path from 'node:path'
import { getGroupProcessedDir, isFlatGroup } from './process'
import { getCutProxyDir } from './proxy'
import { cameraTimes } from './scan'
import { keepProject } from './projectHistory'
import { isNamedMontage } from './montageArtifacts'
import type { Manifest, ManifestGroup } from './types'
import { idsOf } from './lib/words'

const sharingFolder = (manifest: Manifest, outputDir: string, group: ManifestGroup) => {
  const dir = getGroupProcessedDir(outputDir, group).dir
  return manifest.groups.filter(
    (g) => isNamedMontage(g) && !isFlatGroup(g) && getGroupProcessedDir(outputDir, g).dir === dir
  )
}

const removable = (outputDir: string, dir: string) => {
  const root = path.resolve(outputDir, 'processed')
  const target = path.resolve(dir)
  return target.startsWith(`${root}${path.sep}`) && target !== root
}

const takeBack = (manifest: Manifest, outputDir: string, groupId: string, forget: boolean) => {
  const group = manifest.groups.find((g) => g.id === groupId)
  if (!group) throw new Error('Montage not found.')
  if (!isNamedMontage(group)) throw new Error('Only a named montage can be reset or deleted.')
  const jumps = sharingFolder(manifest, outputDir, group)
  if (jumps.some((j) => j.freed))
    throw new Error('This montage lives only on the storage now — there is nothing here to reset.')
  const { dir, baseName } = getGroupProcessedDir(outputDir, group)
  if (!removable(outputDir, dir)) throw new Error(`Refusing to delete ${dir}.`)

  keepProject(outputDir, dir, baseName)
  fs.rmSync(dir, { recursive: true, force: true })
  for (const jump of jumps)
    fs.rmSync(getCutProxyDir(outputDir, jump.id), { recursive: true, force: true })

  const ids = new Set(jumps.flatMap((j) => idsOf(j.files)))
  const times = forget
    ? cameraTimes(manifest.files.filter((f) => f.id && ids.has(f.id)).map((f) => f.path))
    : new Map<string, number>()
  const undo = <T extends { path: string; mtime: number }>(file: T): T =>
    forget
      ? {
          ...file,
          mtime: times.get(file.path) ?? file.mtime,
          cropStart: undefined,
          cropEnd: undefined,
          frame: undefined,
          rotation: undefined
        }
      : file

  manifest.files = manifest.files.map((file) => {
    if (!file.id || !ids.has(file.id)) return file
    const { processed: _processed, uploaded: _uploaded, ...rest } = undo(file)
    return rest
  })
  const taken = new Set(jumps.map((j) => j.id))
  if (forget) {
    manifest.files = manifest.files.filter((f) => !(f.copyOf && f.id && ids.has(f.id)))
    manifest.groups = manifest.groups.filter((g) => !taken.has(g.id))
    return { groupIds: [...taken] }
  }
  manifest.groups = manifest.groups.map((g) => {
    if (!taken.has(g.id)) return g
    const {
      processed: _processed,
      publish: _publish,
      uploaded: _delivered,
      montage: _montage,
      ...rest
    } = g
    return rest
  })
  return { groupIds: [...taken] }
}

const resetMontage = (manifest: Manifest, outputDir: string, groupId: string) =>
  takeBack(manifest, outputDir, groupId, false)

const deleteMontage = (manifest: Manifest, outputDir: string, groupId: string) =>
  takeBack(manifest, outputDir, groupId, true)

export { deleteMontage, resetMontage }
