import { isoDay } from '@skydock/scripts'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { MONTHS, minFileMtime, pad } from '../components/utils'

/* the place whose jumps are passengers' tandems (RULES, Places) */
const TANDEMS = 'Tandems'

/* which card a jump is shown in — not the same question as whether it is a passenger's tandem,
   which needs a name and is what the server gates montage and upload on */
const inTandemsCard = (group: ManifestGroup) => group.destination === TANDEMS

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

const dayLabel = (day: string) => {
  const [year, month, date] = day.split('-').map(Number)
  if (!year || !month || !date) return day
  return `${date} ${MONTHS[month - 1]} ${year}`
}

/* the passenger's folder on the storage — where its film and photos were sent — which is what
   the storage's list of tandems knows it by */
const folderOnStorage = (group: ManifestGroup) => {
  const sent = group.uploaded?.film ?? group.uploaded?.photos
  return sent ? sent.remotePath.slice(0, sent.remotePath.lastIndexOf('/')) : null
}

export { TANDEMS, dayLabel, dayOf, dayOfFile, folderOnStorage, inTandemsCard }
