import { folderOfUpload, isoDay, startOfFiles } from '@skydock/scripts/client'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { dayWritten, pad, weekday } from '../components/utils'

const dayOfMtime = (mtime: number) => {
  const d = new Date(mtime * 1000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const dayOf = (group: ManifestGroup) => isoDay(group.day) || dayOfMtime(startOfFiles(group.files))

const dayOfFile = (file: ManifestFile) => dayOfMtime(file.mtime)

const dayLabel = (day: string, withWeekday = false) => {
  const [year, month, date] = day.split('-').map(Number)
  if (!year || !month || !date) return day
  const at = new Date(year, month - 1, date)
  return withWeekday ? `${weekday(at, 'long')} ${dayWritten(at)}` : dayWritten(at)
}

const folderOnStorage = (group: ManifestGroup) =>
  group.uploaded ? folderOfUpload(group.uploaded) : null

export { dayLabel, dayOf, dayOfFile, folderOnStorage }
