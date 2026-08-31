import type { ManifestFile } from './types'

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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export const formatSequenceDate = (epoch: number): string => {
  const d = new Date(epoch * 1000)
  const day = d.getDate()
  const month = d.getMonth() + 1
  const year = d.getFullYear()
  return `${day} ${month} ${year}`
}

export const formatDayHeader = (epoch: number): string => {
  const d = new Date(epoch * 1000)
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}`
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
