import { processingNow } from './process'
import { uploadingNow } from './uploading'

/* Whether what is asked about is being written right now — processed, or uploaded — and which. Two
   of those at once on the same jumps would have one rewrite the copies the other is reading, so
   whatever would touch them waits (RULES, Uploading a montage). Asking about everything — no jump
   and no destination named — touches everything, and so does processing everything. */
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
