import type { Manifest } from './types'

/* Where a jump is filed, taken off the board.

   Nothing is deleted and nothing moves on the disk. Every jump filed there stops being filed and is
   in Fresh files again, whole, to be filed somewhere else; every loose file filed there is loose in
   Fresh files again. The copies already made for that place belong to a folder named after a place
   that is gone, so they are forgotten and can be made again — the same as when a place is renamed.

   The folder on the storage is left alone, and so is any link handed out of it. What SkyDock knows
   of it is the place's own, and goes with the place; what is up there is not this machine's to
   throw away (RULES, Principles). */
const removeDestination = (manifest: Manifest, name: string) => {
  const jumps = manifest.groups.filter((group) => group.destination === name)
  for (const group of jumps) {
    group.destination = undefined
    group.processed = undefined
  }
  const loose = manifest.files.filter((file) => file.destination === name).length
  for (const file of [...manifest.files, ...manifest.groups.flatMap((group) => group.files)]) {
    if (file.destination !== name) continue
    delete file.destination
    delete file.processed
  }
  manifest.destinations = (manifest.destinations ?? []).filter(
    (destination) => destination.name !== name
  )
  return { jumps: jumps.length, loose }
}

/* A place is on the board when it is one of the places, or when something is still filed under its
   name — a name a jump carries but no place does is a place all the same, and can be taken off. */
const hasDestination = (manifest: Manifest, name: string) =>
  (manifest.destinations ?? []).some((destination) => destination.name === name) ||
  manifest.groups.some((group) => group.destination === name) ||
  manifest.files.some((file) => file.destination === name)

/* The backup folder a board was given before a montage's backups went into destinations. It is kept
   by becoming one — "Backup", or "Backup 2" when that name is some other folder's — so it is there to
   drop a backup into, where it always went. Nothing is added when a destination is that folder
   already. Says whether it added one. */
const keepBackupAsPlace = (manifest: Manifest, backupFolder: string) => {
  const places = manifest.destinations ?? []
  if (places.some((place) => place.path === backupFolder)) return false
  let name = 'Backup'
  for (let n = 2; places.some((place) => place.name === name); n++) name = `Backup ${n}`
  manifest.destinations = [...places, { name, path: backupFolder }]
  return true
}

export { hasDestination, keepBackupAsPlace, removeDestination }
