import { dayOfFiles } from './clustering'
import { isMontage } from './filed'
import type { ManifestGroup, ManifestPassenger } from './types'

const MONTAGES_FOLDER = 'Montages'

const hasCompletePassenger = (passenger: ManifestPassenger | null | undefined) =>
  passengerName(passenger) !== ''

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

const resolveDestinationPath = (
  destinationName: string | undefined,
  destinations: { name: string; path?: string }[]
) => destinations.find((d) => d.name === destinationName)?.path ?? null

const passengerName = (passenger: ManifestPassenger | null | undefined) =>
  passenger ? `${passenger.firstname} ${passenger.lastname}`.trim() : ''

const passengerOf = (group: { passenger?: ManifestPassenger | null }) =>
  passengerName(group.passenger)

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
