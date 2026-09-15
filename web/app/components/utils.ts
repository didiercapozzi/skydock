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

const getGroupBounds = (group: ManifestGroup) => {
  if (group.files.length === 0) return { start: 0, end: 0 }
  let start = Infinity
  let end = -Infinity
  for (const f of group.files) {
    if (f.mtime < start) start = f.mtime
    if (f.mtime > end) end = f.mtime
  }
  return { start, end }
}

const minFileMtime = (files: Array<{ mtime: number }>) => {
  let min = Infinity
  for (const f of files) if (f.mtime < min) min = f.mtime
  return min === Infinity ? 0 : min
}

const getGroupDate = (group: ManifestGroup) => group.day ?? ''

const groupGroupsByDay = (groups: ManifestGroup[]) => {
  const map = new Map<string, { date: string; groups: ManifestGroup[] }>()
  for (const group of groups) {
    const date = group.day || 'Unknown'
    const g = map.get(date)
    if (g) g.groups.push(group)
    else map.set(date, { date, groups: [group] })
  }
  return Array.from(map.values()).sort((a, b) => {
    const da = a.date === 'Unknown' ? '' : a.date
    const db = b.date === 'Unknown' ? '' : b.date
    if (da === db) return 0
    if (da === 'Unknown') return 1
    if (db === 'Unknown') return -1
    const parse = (s: string) => {
      const [d, m, y] = s.split('.').map(Number)
      return new Date(y, (m ?? 1) - 1, d ?? 1).getTime()
    }
    return parse(db) - parse(da)
  })
}

const groupGroupsByDestination = (
  groups: ManifestGroup[],
  destinations: Array<{ name: string }>
) => {
  const map = new Map<string, { name: string; groups: ManifestGroup[] }>()
  for (const dest of destinations) {
    map.set(dest.name, { name: dest.name, groups: [] })
  }
  for (const group of groups) {
    const destName = group.destination
    if (destName) {
      const existing = map.get(destName)
      if (existing) {
        existing.groups.push(group)
      } else {
        map.set(destName, { name: destName, groups: [group] })
      }
    } else {
      let unassigned = map.get('__unassigned__')
      if (!unassigned) {
        unassigned = { name: 'Unassigned', groups: [] }
        map.set('__unassigned__', unassigned)
      }
      unassigned.groups.push(group)
    }
  }
  return Array.from(map.values()).filter((g) => g.groups.length > 0 || g.name !== 'Unassigned')
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
  const rows = Array.from(cardEl.querySelectorAll('[data-file-row],[data-file-grid-item]'))
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
  getGroupBounds,
  getGroupDate,
  groupGroupsByDestination,
  groupGroupsByDay,
  isVideoFile,
  minFileMtime
}
