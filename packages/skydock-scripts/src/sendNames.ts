import type { ArchiveEntry } from './archive'
import { startOfFiles } from './clustering'
import { parseDayEpoch } from './plain'
import { sendPlanSchema } from './types'
import type { ManifestGroup, SendPart, SendPlan } from './types'
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

const stemOf = (group: ManifestGroup) => {
  const start = startOfFiles(group.files)
  const day = parseDayEpoch(group.day) ?? start
  return `${toFileStem(passengerName(group.passenger), 'montage')}_${formatGroupDay(day)}_${formatCaptureTime(start)}`
}

type PartFile = ArchiveEntry & { size: number }

const partEntries = (part: SendPart, files: PartFile[], stem: string): PartFile[] =>
  part === 'videos' || part === 'photos'
    ? files.map((f) => ({ ...f, name: `${part}/${f.name}` }))
    : files.map((f) => ({ ...f, name: `${stem}.${part === 'film' ? 'mp4' : 'kdenlive'}` }))

const zipNameOf = (stem: string, ending: string) => `${stem}${ending ? `.${ending}` : ''}.zip`

const projectFolderOf = (group: ManifestGroup, plan: SendPlan) =>
  plan.folder ?? (slugOf(passengerName(group.passenger)) || 'montage')

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
    const name = part === 'videos' || part === 'photos' ? `${part}/` : entries[0]!.name
    return itemOf(part, name, false, [part], entries)
  })
  return [...zipped, ...loose]
}

const planOf = (value: unknown) => sendPlanSchema.safeParse(value).data ?? DEFAULT_PLAN

export { DEFAULT_PLAN, itemsFrom, PARTS, planOf, projectFolderOf, slugOf, stemOf, zipNameOf }
export type { PartFile, SendItem }
