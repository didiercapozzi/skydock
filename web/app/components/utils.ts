import { getOutputDir, isVideoFile as isVideoFileFromScripts } from '@skydock/scripts'
import type { ManifestFile, ManifestGroup } from './types'

const isVideoFile = (filename: string) => isVideoFileFromScripts(filename)

/* Whole megabytes, and gigabytes once there would be four digits of them: the column is narrow and
   a tenth of a megabyte has never told anyone anything. */
const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  const mb = Math.round(bytes / (1024 * 1024))
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

/* a day written out, built without Intl so the server and the client agree on it */
const dateLabel = (epoch: number) => {
  const d = new Date(epoch * 1000)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/* just enough date to tell two days apart, for where a full one would not fit */
const shortDate = (epoch: number) => {
  const d = new Date(epoch * 1000)
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`
}

/* the calendar day an instant falls on, for asking whether two of them are the same day */
const calendarDay = (epoch: number) => {
  const d = new Date(epoch * 1000)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/* minutes and seconds, for a length rather than a time of day */
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`

const formatTime = (epoch: number) =>
  new Date(epoch * 1000).toLocaleTimeString('de-CH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

const toTimeInputValue = (epoch: number, includeSeconds = false) => {
  const date = new Date(epoch * 1000)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  if (!includeSeconds) return `${hours}:${minutes}`
  return `${hours}:${minutes}:${String(date.getSeconds()).padStart(2, '0')}`
}

const toDateInputValue = (epoch: number) => {
  const d = new Date(epoch * 1000)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

const minFileMtime = (files: Array<{ mtime: number }>) => {
  let min = Infinity
  for (const f of files) if (f.mtime < min) min = f.mtime
  return min === Infinity ? 0 : min
}

const getGroupDate = (group: ManifestGroup) => group.day ?? ''

/* the media routes serve everything under the output folder, addressed by its path inside it */
const relativeToOutput = (filePath: string) => {
  const outputDir = getOutputDir()
  return filePath.startsWith(outputDir) ? filePath.slice(outputDir.length) : filePath
}

const getFileUrl = (filePath: string) => `/api/file${relativeToOutput(filePath)}`

/* What to play, which is not always what the file is. A clip has a small all-intra copy beside it
   once one has been made, and the crop bar scrubs against that instead of dragging a 4K file
   through the browser a frame at a time. Same duration and same frame rate, so a crop set here
   means the same instant in the clip itself. Until the proxy exists, the clip plays as it always
   did. */
const getPlaybackUrl = (file: ManifestFile) => getFileUrl(file.proxy ?? file.path)

const getThumbUrl = (filePath: string, seekSeconds: number, width = 80) =>
  `/api/thumb${relativeToOutput(filePath)}?seek=${seekSeconds.toFixed(1)}&width=${width}`

export {
  MONTHS,
  calendarDay,
  clock,
  dateLabel,
  shortDate,
  formatSize,
  formatTime,
  getFileUrl,
  getGroupDate,
  getPlaybackUrl,
  getThumbUrl,
  isVideoFile,
  minFileMtime,
  toDateInputValue,
  toTimeInputValue
}
