import { i18n } from '@lingui/core'
import { getOutputDir, isVideoFile } from '@skydock/scripts/client'
import type { ProxyFact } from '@skydock/scripts'
import type { ManifestFile, ManifestGroup } from './types'

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  const mb = Math.round(bytes / (1024 * 1024))
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`
}

const DATE_LOCALE: Record<string, string> = { en: 'en-GB', fr: 'fr-CH', de: 'de-CH' }

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

const dayWritten = (date: Date) => written(date, { day: 'numeric', month: 'long', year: 'numeric' })

const dayShort = (epoch: number) =>
  written(new Date(epoch * 1000), { day: 'numeric', month: 'short', year: 'numeric' })

const dateLabel = (epoch: number) => dayWritten(new Date(epoch * 1000))

const shortDate = (epoch: number) =>
  written(new Date(epoch * 1000), { day: 'numeric', month: 'short' })

const weekday = (date: Date, style: 'long' | 'short') => written(date, { weekday: style })

const pad = (n: number) => String(n).padStart(2, '0')

const hhmm = (epoch: number) => {
  const d = new Date(epoch * 1000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const localeDate = (epoch: number) => new Date(epoch * 1000).toLocaleDateString('de-CH')

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const formatFilmSize = (bytes: number) =>
  bytes > 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`

const toDateInputValue = (epoch: number) => {
  const d = new Date(epoch * 1000)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

const getGroupDate = (group: ManifestGroup) => group.day ?? ''

let outputRoot: string | null = null

const setOutputRoot = (dir: string) => {
  outputRoot = dir
}

const relativeToOutput = (filePath: string) => {
  const outputDir = outputRoot ?? getOutputDir()
  return filePath.startsWith(outputDir) ? filePath.slice(outputDir.length) : filePath
}

const getFileUrl = (filePath: string) => `/api/file${relativeToOutput(filePath)}`

const getPlaybackUrl = (file: ManifestFile, fact?: ProxyFact) =>
  getFileUrl(fact?.play ?? file.proxy ?? file.path)

const getThumbUrl = (filePath: string, seekSeconds: number, width = 80) =>
  `/api/thumb${relativeToOutput(filePath)}?seek=${seekSeconds.toFixed(1)}&width=${width}`

const getPictureUrl = (file: ManifestFile, fact: ProxyFact | undefined, width: number) =>
  getThumbUrl(fact?.play ?? file.proxy ?? file.path, 0.5, width)

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
  getFileUrl,
  getGroupDate,
  getPictureUrl,
  getPlaybackUrl,
  getThumbUrl,
  getTrackUrl,
  isVideoFile,
  toDateInputValue,
  weekday
}
