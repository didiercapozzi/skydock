import { useRef, useState } from 'react'
import type { VideoRef } from '../components/preview-drawer'
import type { ManifestFile, ManifestGroup, PreviewState } from '../components/types'

type VideoState = {
  crop: { cropStart: number | null; cropEnd: number | null }
  zoom: number
  currentTime: number
  duration: number
}

type CropRange = { cropStart: number | null; cropEnd: number | null }

/* `LOOSE` stands where a jump id would go, for a file that belongs to no jump: its crop has no
   group reference to live on, so it is saved on the registry entry instead. */
const LOOSE = 'loose'

const usePreview = (
  groups: ManifestGroup[],
  onGroupsChange: (next: ManifestGroup[]) => void,
  onFileCrop: (file: ManifestFile, range: CropRange) => void
) => {
  const [preview, setPreview] = useState<PreviewState>(null)
  const videoRefRef = useRef<VideoRef | null>(null)
  const [videoState, setVideoStateRaw] = useState<VideoState>({
    crop: { cropStart: null, cropEnd: null },
    zoom: 1,
    currentTime: 0,
    duration: 0
  })

  const setVideoState = (next: Partial<VideoState>) => {
    setVideoStateRaw((prev) => ({ ...prev, ...next, crop: next.crop ? next.crop : prev.crop }))
  }

  const handlePreview = (file: ManifestFile, groupId: string) => {
    const files = groups.find((g) => g.id === groupId)?.files ?? [file]
    const found = files.findIndex((f) => f.path === file.path)
    setVideoStateRaw({
      crop: { cropStart: file.cropStart ?? null, cropEnd: file.cropEnd ?? null },
      zoom: 1,
      currentTime: 0,
      duration: 0
    })
    setPreview({ files, index: found === -1 ? 0 : found, groupId })
  }

  const handleVideoSeek = (time: number) => {
    setVideoStateRaw((prev) => ({ ...prev, currentTime: time }))
    videoRefRef.current?.seek(time)
  }

  const closePreview = () => {
    videoRefRef.current = null
    setPreview(null)
  }

  /* Applying a crop is the end of the job: it is saved and the drawer gets out of the way, so the
     card behind it — where the ✂ and the status have just changed — is what you see next.
     `Reset crop` comes through here too, with an empty range; that is a clearing rather than a
     commit, so it leaves the drawer open to set a new one. */
  const committed = (range: CropRange) => range.cropStart !== null || range.cropEnd !== null

  const handleVideoApply = (range: CropRange) => {
    if (!preview) return
    const file = preview.files[preview.index]
    if (!file) return
    if (preview.groupId === LOOSE) onFileCrop(file, range)
    else
      onGroupsChange(
        groups.map((g) =>
          g.id !== preview.groupId
            ? g
            : {
                ...g,
                files: g.files.map((f) =>
                  f.path === file.path
                    ? { ...f, cropStart: range.cropStart, cropEnd: range.cropEnd }
                    : f
                )
              }
        )
      )
    setVideoStateRaw((prev) => ({ ...prev, crop: range }))
    if (committed(range)) closePreview()
  }

  const handleVideoRef = (ref: VideoRef) => {
    videoRefRef.current = ref
  }

  return {
    preview,
    videoState,
    handlePreview,
    handleVideoSeek,
    handleVideoApply,
    handleVideoRef,
    setVideoState,
    closePreview,
    setPreview
  }
}

export { LOOSE, usePreview }
