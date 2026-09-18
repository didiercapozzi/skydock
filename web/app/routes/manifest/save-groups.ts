import { hasEdit, passengerOf, sameEditedGroup, saveManifest } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* The board's own picture of the jumps, the places and each file's crop, saved as sent — bar what a
   frozen tandem forbids — and answered with what was saved, so the board redraws from the server
   rather than trusting its own optimistic copy (RULES, The board). */
const saveGroups: Intent = ({
  data,
  manifest,
  manifestPath,
  outputDir,
  frozen,
  frozenFiles,
  refuse,
  refuseFrozen
}) => {
  if (!data.groups) return refuse('Save needs groups.')
  /* a frozen tandem has to arrive exactly as it is, and none of its files may be edited on the side */
  for (const id of frozen) {
    const before = manifest.groups.find((g) => g.id === id)
    const incoming = data.groups.find((g) => g.id === id)
    if (!before || !incoming || !sameEditedGroup(before, incoming)) return refuseFrozen()
  }
  /* nor may another jump be given that passenger's name: it would join the folder the edit is in */
  for (const incoming of data.groups) {
    if (frozen.has(incoming.id) || !hasEdit(outputDir, incoming)) continue
    const before = manifest.groups.find((g) => g.id === incoming.id)
    if (!before || !sameEditedGroup(before, incoming)) return refuseFrozen()
  }
  if (data.fileUpdates?.some((u) => u.id && frozenFiles.has(u.id))) return refuseFrozen()

  /* Renaming a passenger, a label or a place changes where the files are written, so the copies
     already on disk belong to a folder that is no longer this group's — the source is untouched,
     which is exactly what the stamp compares, so it has to be said explicitly. */
  for (const incoming of data.groups) {
    const before = manifest.groups.find((g) => g.id === incoming.id)
    if (!before) continue
    const movedOutput =
      before.label !== incoming.label ||
      before.destination !== incoming.destination ||
      passengerOf(before) !== passengerOf(incoming)
    if (!movedOutput) continue
    const ids = new Set(incoming.files.flatMap((f) => (f.id ? [f.id] : [])))
    for (const file of manifest.files) {
      if (!file.id || !ids.has(file.id)) continue
      delete file.processed
      delete file.uploaded
    }
  }
  manifest.groups = data.groups
  if (data.destinations) manifest.destinations = data.destinations

  /* named fields only — never a spread of whatever the client sent */
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
  saveManifest(manifestPath, manifest)
  return boardAnswer(manifest)
}

export { saveGroups }
