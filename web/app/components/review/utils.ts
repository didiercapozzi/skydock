import { formatSequenceDate } from '../../lib/sequences'
import type { ManifestJump } from '../../lib/types'
import type { JumpDayGroup } from './types'

const VIDEO_EXTS = new Set(['mp4', 'mov', 'avi', 'mkv', 'mts', 'm4v', '3gp'])
const isVideoFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return VIDEO_EXTS.has(ext)
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatTime = (epoch: number) =>
  new Date(epoch * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

const getJumpDate = (jump: ManifestJump) => {
  if (jump.files.length === 0) return ''
  const min = Math.min(...jump.files.map((f) => f.mtime))
  return formatSequenceDate(min)
}

const getJumpBounds = (jump: ManifestJump) => {
  if (jump.files.length === 0) return { start: 0, end: 0 }
  const times = jump.files.map((f) => f.mtime)
  return { start: Math.min(...times), end: Math.max(...times) }
}

const groupJumpsByDay = (jumps: ManifestJump[]): JumpDayGroup[] => {
  const map = new Map<string, JumpDayGroup>()
  for (const jump of jumps) {
    const date = getJumpDate(jump) || 'Unknown'
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

export { formatSize, formatTime, getJumpBounds, getJumpDate, groupJumpsByDay, isVideoFile }
