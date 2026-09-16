import { getOutputDir, isVideoFile as isVideoFileFromScripts } from '@skydock/scripts'
import type { ManifestGroup } from './types'

const isVideoFile = (filename: string) => isVideoFileFromScripts(filename)

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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

const getThumbUrl = (filePath: string, seekSeconds: number, width = 80) =>
  `/api/thumb${relativeToOutput(filePath)}?seek=${seekSeconds.toFixed(1)}&width=${width}`

export {
  formatSize,
  formatTime,
  getFileUrl,
  getGroupDate,
  getThumbUrl,
  isVideoFile,
  minFileMtime,
  toDateInputValue,
  toTimeInputValue
}
