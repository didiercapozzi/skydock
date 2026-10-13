import { z } from 'zod'
import { getExtension, VIDEO_EXTENSIONS_SET } from './constants'
import type { ManifestFile } from './types'

const isVideoFile = (filePath: string) => VIDEO_EXTENSIONS_SET.has(getExtension(filePath))

const getOutputDir = () =>
  (typeof process !== 'undefined' && process.env?.SKYDOCK_OUTPUT_DIR) || '/workspace/output'

const sortFilesByMtime = (files: ManifestFile[]) => [...files].sort((a, b) => a.mtime - b.mtime)

const daySchema = z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/, 'Invalid day, expected DD.MM.YYYY')

const parseDayEpoch = (day?: string) => {
  const parsed = daySchema.safeParse(day)
  if (!parsed.success) return null
  const [d, m, y] = parsed.data.split('.').map(Number)
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000)
}

const isoDay = (stored: string) => {
  const parts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(stored.trim())
  return parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : ''
}

const formatDay = (epoch: number) => {
  const day = new Date(epoch * 1000).toLocaleDateString('de-CH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  daySchema.parse(day)
  return day
}

export { formatDay, getOutputDir, isoDay, isVideoFile, parseDayEpoch, sortFilesByMtime }
