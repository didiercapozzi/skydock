import { getOutputDir, isVideoFile as isVideoFileFromScripts } from '@skydock/scripts'
import type { ManifestJump } from './types'

const isVideoFile = (filename: string): boolean => isVideoFileFromScripts(filename)

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

const getJumpBounds = (jump: ManifestJump) => {
  if (jump.files.length === 0) return { start: 0, end: 0 }
  const times = jump.files.map((f) => f.mtime)
  return { start: Math.min(...times), end: Math.max(...times) }
}

const getJumpDate = (jump: ManifestJump) => {
  if (jump.files.length === 0) return jump.day ?? ''
  const min = Math.min(...jump.files.map((f) => f.mtime))
  return new Date(min * 1000).toLocaleDateString('de-CH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

const groupJumpsByDay = (jumps: ManifestJump[]) => {
  const map = new Map<string, { date: string; jumps: ManifestJump[] }>()
  for (const jump of jumps) {
    const date = getJumpDate(jump) || jump.day || 'Unknown'
    const g = map.get(date)
    if (g) g.jumps.push(jump)
    else map.set(date, { date, jumps: [jump] })
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.jumps[0] ? getJumpBounds(a.jumps[0]).start : 0
    const tb = b.jumps[0] ? getJumpBounds(b.jumps[0]).start : 0
    return tb - ta
  })
}

const getFileUrl = (filePath: string) => {
  const outputDir = getOutputDir()
  const relative = filePath.startsWith(outputDir) ? filePath.slice(outputDir.length) : filePath
  return `/api/file${relative}`
}

const getThumbUrl = (filePath: string, seekSeconds: number, width = 80) => {
  const outputDir = getOutputDir()
  const relative = filePath.startsWith(outputDir) ? filePath.slice(outputDir.length) : filePath
  return `/api/thumb${relative}?seek=${seekSeconds.toFixed(1)}&width=${width}`
}

const getDropIndex = (cardEl: HTMLElement, clientY: number) => {
  const rows = Array.from(cardEl.querySelectorAll('[data-file-row]'))
  for (let i = 0; i < rows.length; i++) {
    const rect = rows[i].getBoundingClientRect()
    if (clientY < rect.top + rect.height / 2) return i
  }
  return rows.length
}

export {
  formatSize,
  formatTime,
  getFileUrl,
  getThumbUrl,
  getDropIndex,
  getJumpBounds,
  getJumpDate,
  groupJumpsByDay,
  isVideoFile
}
