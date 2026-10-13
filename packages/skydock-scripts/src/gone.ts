import { parentOf } from './paths'
import type { ManifestGroup } from './types'

const uploadedFiles = (record: ManifestGroup['uploaded']) =>
  record
    ? [
        ...new Map(
          [
            record.film,
            record.photos,
            record.rushes,
            ...(record.originals ?? []),
            ...(record.photoFiles ?? [])
          ]
            .filter((f) => f !== undefined)
            .map((f) => [f.remotePath, f])
        ).values()
      ]
    : []

const goneFromStorage = (
  record: ManifestGroup['uploaded'],
  remote: { dirs: string[]; sizes: Record<string, number | null> } | null
) =>
  remote
    ? uploadedFiles(record).filter((f) => {
        if (!remote.dirs.includes(parentOf(f.remotePath))) return false
        const size = remote.sizes[f.remotePath]
        return size === undefined || (size !== null && size !== f.size)
      })
    : []

const goneSent = (
  record: ManifestGroup['uploaded'],
  remote: { dirs: string[]; sizes: Record<string, number | null> } | null
) =>
  remote
    ? (record?.sent ?? []).flatMap((item) =>
        item.to
          .filter((dir) => {
            const at = `${dir}/${item.name}`
            return item.name.endsWith('/')
              ? remote.dirs.includes(at.slice(0, -1)) &&
                  !Object.keys(remote.sizes).some((key) => key.startsWith(at))
              : remote.dirs.includes(dir) && remote.sizes[at] === undefined
          })
          .map((dir) => `${dir}/${item.name}`)
      )
    : []

export { goneFromStorage, goneSent, uploadedFiles }
