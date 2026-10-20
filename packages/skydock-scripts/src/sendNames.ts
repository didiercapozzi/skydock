import type { ArchiveEntry } from './archive'
import { startOfFiles } from './clustering'
import { parseDayEpoch } from './plain'
import { sendPlanSchema } from './types'
import type { ManifestFile, ManifestGroup, SendPart, SendPlan } from './types'
import { formatCaptureTime, formatGroupDay, passengerName, toFileStem } from './workspace'

const PARTS = ['videos', 'photos', 'film', 'project'] as const satisfies readonly SendPart[]

const DEFAULT_PLAN: SendPlan = {
  zips: [{ ending: 'full', parts: ['videos', 'photos', 'project'] }],
  placed: {}
}

const slugOf = (text: string, typing = false) => {
  const slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-/, '')
  return typing ? slug : slug.replace(/-$/, '')
}

const stemFor = (name: string, files: ManifestFile[], day?: string) => {
  const start = startOfFiles(files)
  return `${toFileStem(name, 'montage')}_${formatGroupDay(parseDayEpoch(day) ?? start)}_${formatCaptureTime(start)}`
}

const stemOf = (group: ManifestGroup) =>
  stemFor(passengerName(group.passenger), group.files, group.day)

type PartFile = ArchiveEntry & { size: number }

const endingOf = (part: SendPart) => (part === 'film' ? '.mp4' : '.edit.json')

const partEntries = (part: SendPart, files: PartFile[], stem: string): PartFile[] =>
  part === 'videos' || part === 'photos'
    ? files.map((f) => ({ ...f, name: `${part}/${f.name}` }))
    : files.map((f) => ({ ...f, name: `${stem}${endingOf(part)}` }))

const partFileNames = (part: SendPart, files: PartFile[], stem: string) =>
  partEntries(part, files, stem).map((entry) => entry.name)

const zipNameOf = (stem: string, ending: string) => `${stem}${ending ? `.${ending}` : ''}.zip`

const folderFor = (name: string, plan: SendPlan, fallback = 'montage') =>
  plan.folder ?? (slugOf(name) || fallback)

const projectFolderOf = (group: ManifestGroup, plan: SendPlan) =>
  folderFor(passengerName(group.passenger), plan)

type SendItem = {
  key: string
  name: string
  zip: boolean
  holds: SendPart[]
  entries: PartFile[]
  count: number
  size: number
}

const itemOf = (
  key: string,
  name: string,
  zip: boolean,
  holds: SendPart[],
  entries: PartFile[]
) => ({
  key,
  name,
  zip,
  holds,
  entries,
  count: entries.length,
  size: entries.reduce((sum, entry) => sum + entry.size, 0)
})

const itemsFrom = (
  files: Record<SendPart, PartFile[]>,
  stem: string,
  zips: SendPlan['zips']
): SendItem[] => {
  const present = PARTS.filter((part) => files[part].length > 0)
  const zipped = zips.flatMap((zip) => {
    const holds = present.filter((part) => zip.parts.includes(part))
    return holds.length === 0
      ? []
      : [
          itemOf(
            `zip:${zip.ending}`,
            zipNameOf(stem, zip.ending),
            true,
            holds,
            holds.flatMap((part) => partEntries(part, files[part], stem))
          )
        ]
  })
  const loose = present.map((part) => {
    const entries = partEntries(part, files[part], stem)
    const name =
      part === 'videos' || part === 'photos'
        ? `${part}/`
        : entries.map((entry) => entry.name).join(' + ')
    return itemOf(part, name, false, [part], entries)
  })
  return [...zipped, ...loose]
}

const planOf = (value: unknown) => sendPlanSchema.safeParse(value).data ?? DEFAULT_PLAN

export {
  DEFAULT_PLAN,
  folderFor,
  itemsFrom,
  PARTS,
  partFileNames,
  planOf,
  projectFolderOf,
  slugOf,
  stemFor,
  stemOf,
  zipNameOf
}
export type { PartFile, SendItem }
