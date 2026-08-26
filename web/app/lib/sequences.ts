import type { Manifest, ManifestFile } from './types'

export type Sequence = {
  id: string
  camera: string
  files: ManifestFile[]
  date: string
  startTime: number
  endTime: number
}

export const formatSequenceDate = (epoch: number): string => {
  const d = new Date(epoch * 1000)
  const day = d.getDate()
  const month = d.getMonth() + 1
  const year = d.getFullYear()
  return `${day} ${month} ${year}`
}

export const formatDateForInput = (dateStr: string): string => {
  const parts = dateStr.split(' ')
  const day = parts[0].padStart(2, '0')
  const month = parts[1].padStart(2, '0')
  const year = parts[2]
  return `${year}-${month}-${day}`
}

export const formatSequenceTime = (epoch: number): string => {
  return new Date(epoch * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export const formatClockOffset = (seconds: number): string => {
  const sign = seconds < 0 ? '-' : '+'
  const abs = Math.abs(seconds)
  const days = Math.floor(abs / 86400)
  const hours = Math.floor((abs % 86400) / 3600)
  const minutes = Math.floor((abs % 3600) / 60)
  const secs = abs % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${sign}${days}d ${pad(hours)}:${pad(minutes)}:${pad(secs)}`
}

export const getSequences = (manifest: Manifest, cameraId: string): Sequence[] => {
  const allFiles: ManifestFile[] = (manifest.files ?? []).filter((f) => f.camera === cameraId)

  allFiles.sort((a, b) => a.mtime - b.mtime)

  const sequences: Sequence[] = []
  let current: ManifestFile[] = []
  let lastTime = 0

  for (const file of allFiles) {
    if (current.length > 0 && file.mtime - lastTime > 900) {
      const startTime = current[0].mtime
      const endTime = current[current.length - 1].mtime
      sequences.push({
        id: `seq_${cameraId}_${sequences.length}`,
        camera: cameraId,
        files: current,
        date: formatSequenceDate(startTime),
        startTime,
        endTime
      })
      current = []
    }
    current.push(file)
    lastTime = file.mtime
  }

  if (current.length > 0) {
    const startTime = current[0].mtime
    const endTime = current[current.length - 1].mtime
    sequences.push({
      id: `seq_${cameraId}_${sequences.length}`,
      camera: cameraId,
      files: current,
      date: formatSequenceDate(startTime),
      startTime,
      endTime
    })
  }

  return sequences
}

export const getCameraIds = (manifest: Manifest): string[] => {
  const ids = new Set<string>()
  for (const file of manifest.files ?? []) {
    ids.add(file.camera)
  }
  return Array.from(ids).sort()
}
