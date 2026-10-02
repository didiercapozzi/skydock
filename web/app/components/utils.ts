import { i18n } from '@lingui/core'
import { getOutputDir, isVideoFile, startOfFiles } from '@skydock/scripts'
import type { ProxyFact } from '@skydock/scripts'
import type { ManifestFile, ManifestGroup } from './types'

/* Whole megabytes, and gigabytes once there would be four digits of them: the column is narrow and
   a tenth of a megabyte has never told anyone anything. */
const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  const mb = Math.round(bytes / (1024 * 1024))
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`
}

/* Dates are written by the machine's own Intl, in the language the app speaks, the way that
   language writes them where the club is: 1 August 2026, 1 août 2026, 1. August 2026. The server and
   the window run on the same machine, so both write a day the same way. */
const DATE_LOCALE: Record<string, string> = { en: 'en-GB', fr: 'fr-CH', de: 'de-CH' }

/* one writer per language and way of writing, made once: making one is slow, and a list writes a
   date on every row */
const writers = new Map<string, Intl.DateTimeFormat>()

const written = (date: Date, options: Intl.DateTimeFormatOptions) => {
  const locale = DATE_LOCALE[i18n.locale] ?? 'en-GB'
  const key = `${locale}|${JSON.stringify(options)}`
  let writer = writers.get(key)
  if (!writer) {
    writer = new Intl.DateTimeFormat(locale, options)
    writers.set(key, writer)
  }
  return writer.format(date)
}

/* a day written out */
const dayWritten = (date: Date) => written(date, { day: 'numeric', month: 'long', year: 'numeric' })

/* a day written short with its year: 1 Oct 2026 */
const dayShort = (epoch: number) =>
  written(new Date(epoch * 1000), { day: 'numeric', month: 'short', year: 'numeric' })

const dateLabel = (epoch: number) => dayWritten(new Date(epoch * 1000))

/* just enough date to tell two days apart, for where a full one would not fit */
const shortDate = (epoch: number) =>
  written(new Date(epoch * 1000), { day: 'numeric', month: 'short' })

/* the day of the week, whole or short, for where a date is read by the week it fell in */
const weekday = (date: Date, style: 'long' | 'short') => written(date, { weekday: style })

const pad = (n: number) => String(n).padStart(2, '0')

/* hours and minutes, for when something happened */
const hhmm = (epoch: number) => {
  const d = new Date(epoch * 1000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* the day, the short way the club writes it */
const localeDate = (epoch: number) => new Date(epoch * 1000).toLocaleDateString('de-CH')

/* English only: every sentence that counts says so with Lingui's plural instead (RULES, Languages) */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/* gigabytes with a decimal, or whole megabytes: the sizes a film and an archive come in */
const formatFilmSize = (bytes: number) =>
  bytes > 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`

/* minutes and seconds, for a length rather than a time of day */
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`

/* hours and minutes: seconds are only ever asked for where a time is set */
const TIME_WRITER = new Intl.DateTimeFormat('de-CH', {
  hour: '2-digit',
  minute: '2-digit'
})

const formatTime = (epoch: number) => TIME_WRITER.format(new Date(epoch * 1000))

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

/* when a run of files started — which a copy brought in from another jump has no say in */
const minFileMtime = startOfFiles

const getGroupDate = (group: ManifestGroup) => group.day ?? ''

/* Where the machine keeps the work, as the board is told when it loads. It cannot be worked out
   here: the installed app keeps it wherever it was asked to, which the browser has no way of
   knowing, and every media address is a path inside it. */
let outputRoot: string | null = null

const setOutputRoot = (dir: string) => {
  outputRoot = dir
}

/* the media routes serve everything under the output folder, addressed by its path inside it */
const relativeToOutput = (filePath: string) => {
  const outputDir = outputRoot ?? getOutputDir()
  return filePath.startsWith(outputDir) ? filePath.slice(outputDir.length) : filePath
}

const getFileUrl = (filePath: string) => `/api/file${relativeToOutput(filePath)}`

/* What to play, which is not always what the file is. A clip has a small all-intra copy beside it
   once one has been made, and the crop bar scrubs against that instead of dragging a 4K file
   through the browser a frame at a time. Same duration and same frame rate, so a crop set here
   means the same instant in the clip itself. Until the proxy exists, the clip itself plays.

   The server's look at the disk decides, and the record on the file is only the fallback: a build
   still in progress has copies on disk that nothing has written down yet, and playing the original
   because of that is exactly the lag a proxy exists to remove. */
const getPlaybackUrl = (file: ManifestFile, fact?: ProxyFact) =>
  getFileUrl(fact?.play ?? file.proxy ?? file.path)

const getThumbUrl = (filePath: string, seekSeconds: number, width = 80) =>
  `/api/thumb${relativeToOutput(filePath)}?seek=${seekSeconds.toFixed(1)}&width=${width}`

/* The picture a list draws, cut from the small copy when there is one. It is the same frame either
   way — a proxy is the same clip at the same length — but cutting it out of a 4K original means
   seeking a 4K original, which takes three times as long as the copy does. A jump of sixteen clips
   is sixteen of those, six at a time, and that is the half second between opening a jump and seeing
   it. What has no small copy yet, and every still, is cut from the file itself as before. */
const getPictureUrl = (file: ManifestFile, fact: ProxyFact | undefined, width: number) =>
  getThumbUrl(fact?.play ?? file.proxy ?? file.path, 0.5, width)

/* the graph is read off the original, which is where the camera's own measurements are */
const getTrackUrl = (filePath: string) => `/api/track${relativeToOutput(filePath)}`

export {
  dayShort,
  setOutputRoot,
  dayWritten,
  formatFilmSize,
  hhmm,
  localeDate,
  pad,
  plural,
  clock,
  dateLabel,
  shortDate,
  formatSize,
  formatTime,
  getFileUrl,
  getGroupDate,
  getPictureUrl,
  getPlaybackUrl,
  getThumbUrl,
  getTrackUrl,
  isVideoFile,
  minFileMtime,
  toDateInputValue,
  toTimeInputValue,
  weekday
}
