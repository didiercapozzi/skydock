import { folderOfUpload, isoDay } from '@skydock/scripts'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { dayWritten, minFileMtime, pad, weekday } from '../components/utils'

/* local calendar day, built without Intl so the server and the client agree */
const dayOfMtime = (mtime: number) => {
  const d = new Date(mtime * 1000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/* A jump is filed under the day it started, which the jump carries. It is not worked out from the
   files here: a file dragged in from another day joins the jump, and a jump that swallowed one
   would otherwise jump to that file's day and take everything in it along (RULES, Jumps). Only a
   jump with no day recorded falls back to its earliest file. */
const dayOf = (group: ManifestGroup) => isoDay(group.day) || dayOfMtime(minFileMtime(group.files))

const dayOfFile = (file: ManifestFile) => dayOfMtime(file.mtime)

/* a day written out, and with its day of the week where it heads a run of files */
const dayLabel = (day: string, withWeekday = false) => {
  const [year, month, date] = day.split('-').map(Number)
  if (!year || !month || !date) return day
  const at = new Date(year, month - 1, date)
  return withWeekday ? `${weekday(at, 'long')} ${dayWritten(at)}` : dayWritten(at)
}

/* a montage's folder on the storage — the one its film went to — which is what the storage's list of
   montages knows it by */
const folderOnStorage = (group: ManifestGroup) =>
  group.uploaded ? folderOfUpload(group.uploaded) : null

export { dayLabel, dayOf, dayOfFile, folderOnStorage }
