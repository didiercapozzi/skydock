import type { Manifest, ManifestFile } from './types'

export type Sequence = {
  id: string
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

export const formatSequenceTime = (epoch: number): string => {
  return new Date(epoch * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export const getSequences = (manifest: Manifest, camera: 'PHOTO' | 'VIDEO'): Sequence[] => {
  const allFiles: ManifestFile[] = (manifest.files ?? []).filter((f) => f.camera === camera)

  allFiles.sort((a, b) => a.mtime - b.mtime)

  const sequences: Sequence[] = []
  let current: ManifestFile[] = []
  let lastTime = 0

  for (const file of allFiles) {
    if (current.length > 0 && file.mtime - lastTime > 900) {
      const startTime = current[0].mtime
      const endTime = current[current.length - 1].mtime
      sequences.push({
        id: `seq_${camera}_${sequences.length}`,
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
      id: `seq_${camera}_${sequences.length}`,
      files: current,
      date: formatSequenceDate(startTime),
      startTime,
      endTime
    })
  }

  return sequences
}
