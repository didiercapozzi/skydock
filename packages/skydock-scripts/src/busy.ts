import { processingNow } from './process'
import { uploadingNow } from './uploading'

const busyWith = ({
  groupIds = [],
  destination
}: {
  groupIds?: string[]
  destination?: string
}) => {
  const processing = processingNow()
  if (
    processing &&
    ((processing.groupIds.length === 0 && processing.destinations.length === 0) ||
      groupIds.some((id) => processing.groupIds.includes(id)) ||
      (destination !== undefined && processing.destinations.includes(destination)))
  )
    return 'processing' as const
  const everything = groupIds.length === 0 && destination === undefined
  const upload = uploadingNow()
  if (
    upload &&
    (everything ||
      groupIds.some((id) => upload.groupIds.includes(id)) ||
      (destination !== undefined && upload.key === `dest:${destination}`))
  )
    return 'uploading' as const
  return null
}

export { busyWith }
