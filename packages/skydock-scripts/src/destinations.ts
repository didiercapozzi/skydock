import type { Manifest } from './types'

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

const hasDestination = (manifest: Manifest, name: string) =>
  (manifest.destinations ?? []).some((destination) => destination.name === name) ||
  manifest.groups.some((group) => group.destination === name) ||
  manifest.files.some((file) => file.destination === name)

const keepBackupAsPlace = (manifest: Manifest, backupFolder: string) => {
  const places = manifest.destinations ?? []
  if (places.some((place) => place.path === backupFolder)) return false
  let name = 'Backup'
  for (let n = 2; places.some((place) => place.name === name); n++) name = `Backup ${n}`
  manifest.destinations = [...places, { name, path: backupFolder }]
  return true
}

export { hasDestination, keepBackupAsPlace, removeDestination }
