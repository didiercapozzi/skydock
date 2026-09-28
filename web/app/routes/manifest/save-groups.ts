import {
  hasEdit,
  passengerOf,
  placeNameProblem,
  sameEditedGroup,
  saveManifest,
  UPLOADED_LOCKED,
  idsOf
} from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* The board's own picture of the jumps, the places and each file's crop, saved as sent — bar what a
   frozen montage forbids — and answered with what was saved, so the board redraws from the server
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
  /* a dropzone is a folder: a new one must have a name a folder can have, and not the montages' own */
  for (const place of data.destinations ?? []) {
    if (manifest.destinations?.some((d) => d.name === place.name)) continue
    const problem = placeNameProblem(place.name)
    if (problem) return refuse(problem)
  }
  /* a frozen montage has to arrive exactly as it is, and none of its files may be edited on the side */
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
  /* uploaded is the end of editing: the crop, the frame, the turn and the place of a file that has
     gone up are closed here, whatever the page sends (RULES, File status) */
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
    const ids = new Set(idsOf(incoming.files))
    for (const file of manifest.files) {
      if (!file.id || !ids.has(file.id)) continue
      delete file.processed
      delete file.uploaded
    }
  }
  /* What only the server does is only the server's to say: whether a jump went up, was freed, has a
     link or an editing project. A page that was open while that happened sends what it last saw, and
     must not undo it — so those are kept as the server has them, whatever the page sends. */
  manifest.groups = data.groups.map((incoming) => {
    const before = manifest.groups.find((g) => g.id === incoming.id)
    if (!before) return incoming
    const { uploaded: _u, freed: _f, publish: _p, montage: _m, paid: _pd, ...decided } = incoming
    /* a jump changed since its link was made is not what the link shows any more */
    const changed =
      !sameEditedGroup(before, incoming) ||
      before.label !== incoming.label ||
      before.day !== incoming.day
    return {
      ...decided,
      ...(before.uploaded ? { uploaded: before.uploaded } : {}),
      ...(before.freed ? { freed: before.freed } : {}),
      ...(before.publish && !changed ? { publish: before.publish } : {}),
      ...(before.montage ? { montage: before.montage } : {}),
      ...(before.paid ? { paid: before.paid } : {})
    }
  })
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
