import type { ManifestFile } from './types'

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
