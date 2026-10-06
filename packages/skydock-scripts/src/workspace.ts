import { dayOfFiles } from './clustering'
import { isMontage } from './filed'
import type { ManifestGroup, ManifestPassenger } from './types'

/* Where montages are worked on, on this machine: each in a folder of its own inside this one. */
const MONTAGES_FOLDER = 'Montages'

/* A montage is named by one name — "Luc Favre", "Boogie 2026" — and any name is a whole one: it is
   the folder and the file names. */
const hasCompletePassenger = (passenger: ManifestPassenger | null | undefined) =>
  passengerName(passenger) !== ''

/* The one name as the record keeps it. The record has two parts, as it always had, so nothing
   already on the disk or in the storage's list needs reading another way: the name is cut at its
   first space and joined again by `passengerName`, which gives it back exactly. */
const passengerFrom = (name: string): ManifestPassenger => {
  const [firstname = '', ...rest] = name.trim().split(/\s+/)
  return { firstname, lastname: rest.join(' ') }
}

const formatGroupDay = (mtime: number) => {
  const d = new Date(mtime * 1000)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}${month}${day}`
}

const formatCaptureTime = (mtime: number) => {
  const d = new Date(mtime * 1000)
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  return `${hours}${minutes}${seconds}`
}

const buildGroupBaseName = (
  passenger: ManifestPassenger | null | undefined,
  label: string,
  minMtime: number
) => {
  const raw =
    hasCompletePassenger(passenger) && passenger
      ? `${passenger.firstname.trim()}_${passenger.lastname.trim()}`
      : label
  return `${toFileStem(raw, 'group')}_${formatGroupDay(minMtime)}`
}

const buildPassengerFolder = (passenger: ManifestPassenger | null | undefined, label: string) =>
  hasCompletePassenger(passenger) && passenger
    ? `${passenger.firstname.trim()} ${passenger.lastname.trim()}`.replace(/[/\\]+/g, ' ').trim()
    : label.replace(/[/\\]+/g, ' ').trim()

const toFileStem = (raw: string, fallback: string) =>
  raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback

const mergeGroups = (groups: ManifestGroup[], leftId: string, rightId: string) => {
  if (leftId === rightId) return groups
  const left = groups.find((g) => g.id === leftId)
  const right = groups.find((g) => g.id === rightId)
  if (!left || !right) return groups
  const seen = new Set(left.files.map((f) => f.path))
  const additions = right.files.filter((f) => !seen.has(f.path))
  const files = [...left.files, ...additions].sort((a, b) => a.mtime - b.mtime)
  return groups
    .filter((g) => g.id !== rightId)
    .map((g) =>
      g.id === leftId
        ? {
            ...g,
            files,
            /* one jump now, starting when the earlier of the two started */
            day: dayOfFiles(files),
            processed: false,
            passenger: left.passenger ?? right.passenger ?? undefined,
            publish: undefined
          }
        : g
    )
}

const makeFileName = (baseName: string, mtime: number, ext: string, usedNames: Set<string>) => {
  const timeStr = formatCaptureTime(mtime)
  const candidate = `${baseName}_${timeStr}.${ext}`
  if (!usedNames.has(candidate)) {
    usedNames.add(candidate)
    return candidate
  }
  let counter = 1
  while (usedNames.has(`${baseName}_${timeStr}_${counter}.${ext}`)) counter++
  const name = `${baseName}_${timeStr}_${counter}.${ext}`
  usedNames.add(name)
  return name
}

const buildFsTime = (groupMtime: number, captureMtime: number) => {
  const groupDate = new Date(groupMtime * 1000)
  const origTime = new Date(captureMtime * 1000)
  return new Date(
    groupDate.getFullYear(),
    groupDate.getMonth(),
    groupDate.getDate(),
    origTime.getHours(),
    origTime.getMinutes(),
    origTime.getSeconds()
  )
}

/* Every place is connected to a folder of its own: that path IS the answer, and a place without one
   has nowhere to upload into, reported as "no folder chosen" rather than guessed at. */
const resolveDestinationPath = (
  destinationName: string | undefined,
  destinations: { name: string; path?: string }[]
) => destinations.find((d) => d.name === destinationName)?.path ?? null

/* the passenger's name as one string, trimmed; empty for a jump with nobody in it */
const passengerName = (passenger: ManifestPassenger | null | undefined) =>
  passenger ? `${passenger.firstname} ${passenger.lastname}`.trim() : ''

const passengerOf = (group: { passenger?: ManifestPassenger | null }) =>
  passengerName(group.passenger)

/* A name typed for a montage, as the record will keep it: one that is already a montage's, however
   it is capitalised, is that montage — its jumps share one folder — and keeps the spelling it has. */
const montageCalled = (groups: ManifestGroup[], name: string) => {
  const typed = passengerName(passengerFrom(name)).toLowerCase()
  return (
    groups.find((g) => isMontage(g) && passengerOf(g).toLowerCase() === typed)?.passenger ??
    passengerFrom(name)
  )
}

export {
  buildPassengerFolder,
  buildFsTime,
  buildGroupBaseName,
  formatCaptureTime,
  formatGroupDay,
  hasCompletePassenger,
  makeFileName,
  mergeGroups,
  montageCalled,
  passengerFrom,
  passengerName,
  passengerOf,
  isMontage,
  MONTAGES_FOLDER,
  resolveDestinationPath,
  toFileStem
}
