import * as fs from 'node:fs'
import * as path from 'node:path'
import { getGroupProcessedDir, isFlatGroup } from './process'
import { getCutProxyDir } from './proxy'
import { cameraTimes } from './scan'
import { keepProject } from './projectHistory'
import { isTandem } from './tandem'
import type { Manifest, ManifestGroup } from './types'

/* Two ways back from a tandem, both for the whole passenger — one passenger is one folder, so a
   jump cannot be taken back on its own without taking its folder from the others.

   Reset puts it back to before processing: everything made from it on this machine goes — the
   copies, the cut proxies, the project, the film, the archives — and everything decided about it
   stays: the name, the crops, the frames, the turns, the corrected times. It is how an edit is started over.

   Delete undoes the tandem altogether, at whatever step it has reached: the same folder goes, and
   so does everything decided about it — the jumps themselves included. Its files go back to be
   sorted loose, with no name, no crop and no frame, each on the time its camera gave it.

   Neither touches the originals, and neither deletes anything from the storage: SkyDock never does
   (RULES, Network storage). What was uploaded stays up there; only the record of it goes. */

/* every jump that writes into the same folder as this one */
const sharingFolder = (manifest: Manifest, outputDir: string, group: ManifestGroup) => {
  const dir = getGroupProcessedDir(outputDir, group).dir
  return manifest.groups.filter(
    (g) => isTandem(g) && !isFlatGroup(g) && getGroupProcessedDir(outputDir, g).dir === dir
  )
}

/* Only ever a passenger's own folder under processed/ — never the processed folder itself, never a
   dropzone's, which holds every day ever shot there, and never anything outside the output folder. */
const removable = (outputDir: string, dir: string) => {
  const root = path.resolve(outputDir, 'processed')
  const target = path.resolve(dir)
  return target.startsWith(`${root}${path.sep}`) && target !== root
}

const takeBack = (manifest: Manifest, outputDir: string, groupId: string, forget: boolean) => {
  const group = manifest.groups.find((g) => g.id === groupId)
  if (!group) throw new Error('Tandem not found.')
  if (!isTandem(group)) throw new Error('Only a named tandem can be reset or deleted.')
  const jumps = sharingFolder(manifest, outputDir, group)
  /* its originals are gone from here, so there is nothing to start again from */
  if (jumps.some((j) => j.freed))
    throw new Error('This tandem lives only on the storage now — there is nothing here to reset.')
  const { dir, baseName } = getGroupProcessedDir(outputDir, group)
  if (!removable(outputDir, dir)) throw new Error(`Refusing to delete ${dir}.`)

  /* Everything made on this machine goes, the project with it — so the project is copied aside
     first. Taking a tandem back is deliberate and this does not stand in its way; it only means the
     hours in the editor are still there afterwards, for whoever asks. */
  keepProject(outputDir, dir, baseName)
  fs.rmSync(dir, { recursive: true, force: true })
  for (const jump of jumps)
    fs.rmSync(getCutProxyDir(outputDir, jump.id), { recursive: true, force: true })

  const ids = new Set(jumps.flatMap((j) => j.files.flatMap((f) => (f.id ? [f.id] : []))))
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
  /* deleted, the jumps go too: what comes back is loose files, as off the camera — and a copy,
     which only exists for the jump that held it, goes with its jump */
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

const resetTandem = (manifest: Manifest, outputDir: string, groupId: string) =>
  takeBack(manifest, outputDir, groupId, false)

const deleteTandem = (manifest: Manifest, outputDir: string, groupId: string) =>
  takeBack(manifest, outputDir, groupId, true)

export { deleteTandem, resetTandem }
