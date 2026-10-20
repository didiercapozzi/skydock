import {
  folderLock,
  getGroupProcessedDir,
  passengerOf,
  sameEditedGroup,
  saveManifest,
  UPLOADED_LOCKED,
  idsOf
} from '@skydock/scripts'
import type { ManifestGroup } from '@skydock/scripts'
import {
  renameEditedMontage,
  sharingFolder
} from '../../../../packages/skydock-scripts/src/renameMontage'
import { boardAnswer } from '../../helpers/manifest'
import { placeNameProblem } from '../../helpers/places'
import type { Intent } from './change'

/* The board's own picture of the jumps, the places and each file's crop, saved as sent — bar what a
   frozen montage forbids — and answered with what was saved, so the board redraws from the server
   rather than trusting its own optimistic copy (RULES, The board). A montage edited in SkyDock takes
   any change but one to its folder, and a new name renames it whole rather than leaving its edit
   behind (RULES, An edit holds the montage). */
const saveGroups: Intent = async ({
  data,
  manifest,
  manifestPath,
  outputDir,
  locks,
  frozen,
  frozenFiles,
  refuse,
  refuseFrozen
}) => {
  if (!data.groups) return refuse('Save needs groups.')
  for (const place of data.destinations ?? []) {
    if (manifest.destinations?.some((d) => d.name === place.name)) continue
    const problem = placeNameProblem(place.name)
    if (problem) return refuse(problem)
  }
  for (const id of frozen) {
    const before = manifest.groups.find((g) => g.id === id)
    const incoming = data.groups.find((g) => g.id === id)
    if (!before || !incoming || !sameEditedGroup(before, incoming)) return refuseFrozen(id)
  }
  const renames: { before: ManifestGroup; after: ManifestGroup }[] = []
  for (const incoming of data.groups) {
    const before = manifest.groups.find((g) => g.id === incoming.id)
    if (locks.get(incoming.id) === 'edit' && before) {
      const from = getGroupProcessedDir(outputDir, before)
      const to = getGroupProcessedDir(outputDir, incoming)
      if (from.dir !== to.dir || from.baseName !== to.baseName)
        renames.push({ before, after: incoming })
      continue
    }
    if (locks.has(incoming.id) || (await folderLock(outputDir, incoming)) !== 'kdenlive') continue
    if (!before || !sameEditedGroup(before, incoming)) return refuseFrozen()
  }
  const held = data.fileUpdates?.find((u) => u.id && frozenFiles.has(u.id))
  if (held?.id) return refuseFrozen(frozenFiles.get(held.id))
  for (const update of data.fileUpdates ?? []) {
    const current = manifest.files.find((f) =>
      update.id ? f.id === update.id : f.path === update.path
    )
    if (!current || !(current.uploaded || current.freed)) continue
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
    const changed =
      !same(update.cropStart, current.cropStart) ||
      !same(update.cropEnd, current.cropEnd) ||
      !same(update.frame, current.frame) ||
      !same(update.rotation ?? 0, current.rotation ?? 0) ||
      !same(update.destination, current.destination)
    if (changed) return refuse(UPLOADED_LOCKED)
  }

  const renamed = new Set<string>()
  for (const { before, after } of renames) {
    const sharing = sharingFolder(manifest, outputDir, before)
    const files = [
      ...manifest.files,
      ...data.groups.filter((g) => sharing.some((s) => s.id === g.id)).flatMap((g) => g.files)
    ]
    const refused = await renameEditedMontage({ outputDir, before, after, sharing, files })
    if (refused) return refuse(refused)
    for (const one of sharing) renamed.add(one.id)
    for (const group of data.groups)
      if (group.id !== after.id && sharing.some((s) => s.id === group.id))
        group.passenger = after.passenger
  }

  for (const incoming of data.groups) {
    const before = manifest.groups.find((g) => g.id === incoming.id)
    if (!before || renamed.has(incoming.id)) continue
    const movedOutput =
      before.label !== incoming.label ||
      before.destination !== incoming.destination ||
      passengerOf(before) !== passengerOf(incoming)
    if (!movedOutput) continue
    const ids = new Set(idsOf(incoming.files))
    for (const file of manifest.files) {
      if (!file.id || !ids.has(file.id)) continue
      delete file.processed
      delete file.uploaded
    }
  }
  manifest.groups = data.groups.map((incoming) => {
    const before = manifest.groups.find((g) => g.id === incoming.id)
    if (!before) return incoming
    const { uploaded: _u, freed: _f, publish: _p, montage: _m, ...decided } = incoming
    const changed =
      !sameEditedGroup(before, incoming) ||
      before.label !== incoming.label ||
      before.day !== incoming.day
    return {
      ...decided,
      ...(before.uploaded ? { uploaded: before.uploaded } : {}),
      ...(before.freed ? { freed: before.freed } : {}),
      ...(before.publish && !changed ? { publish: before.publish } : {}),
      ...(before.montage ? { montage: before.montage } : {})
    }
  })
  if (data.destinations) manifest.destinations = data.destinations

  for (const update of data.fileUpdates ?? []) {
    const idx = manifest.files.findIndex((f) =>
      update.id ? f.id === update.id : f.path === update.path
    )
    if (idx !== -1)
      manifest.files[idx] = {
        ...manifest.files[idx],
        destination: update.destination,
        cropStart: update.cropStart,
        cropEnd: update.cropEnd,
        frame: update.frame,
        rotation: update.rotation
      }
  }
  await saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { saveGroups }
