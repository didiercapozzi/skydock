import { isVideoFile } from '@skydock/scripts'
import type { FrameCrop, Rotation } from '@skydock/scripts'
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
  /* a lone file's crop has no group reference to live on, so it is saved on the registry entry —
     the frame goes the same way */
  onFileCrop: (
    file: ManifestFile,
    range: CropRange,
    frame?: FrameCrop | null,
    rotation?: Rotation
  ) => void
) => {
  const [preview, setPreview] = useState<PreviewState>(null)
  /* the rectangle on screen, held here rather than read back off the snapshot the drawer was
     opened with — that snapshot never learns about a rectangle set after it was taken */
  const [frame, setFrame] = useState<FrameCrop | null>(null)
  /* how far the picture is turned, a draft like the rectangle until it is saved */
  const [rotation, setRotation] = useState<Rotation>(0)
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
    setFrame(file.frame ?? null)
    setRotation(file.rotation ?? 0)
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
  const committed = (range: CropRange) =>
    range.cropStart !== null || range.cropEnd !== null || frame !== null || rotation !== 0

  const handleVideoApply = (range: CropRange) => {
    if (!preview) return
    const file = preview.files[preview.index]
    if (!file) return
    if (preview.groupId === LOOSE) onFileCrop(file, range, frame, rotation)
    else
      onGroupsChange(
        groups.map((g) =>
          g.id !== preview.groupId
            ? g
            : {
                ...g,
                files: g.files.map((f) =>
                  f.path === file.path
                    ? { ...f, cropStart: range.cropStart, cropEnd: range.cropEnd, frame, rotation }
                    : f
                )
              }
        )
      )
    setVideoStateRaw((prev) => ({ ...prev, crop: range }))
    if (committed(range)) closePreview()
  }

  /* The rectangle is a draft until Save, like the trim: both halves of a crop are committed by the
     same press. `null` clears it back to the whole frame. */
  const handleFrameChange = (next: FrameCrop | null) => {
    setFrame(next)
  }

  /* A mount is mounted badly for the whole jump, so one rectangle usually wants to be all of them.
     Only the clips get it — a photo has no frame crop — and it replaces whatever each had. */
  const handleFrameApplyToJump = () => {
    if (!preview || preview.groupId === LOOSE) return
    if (!preview.files[preview.index]) return
    onGroupsChange(
      groups.map((g) =>
        g.id !== preview.groupId
          ? g
          : { ...g, files: g.files.map((f) => (isVideoFile(f.path) ? { ...f, frame } : f)) }
      )
    )
  }

  /* A camera on its side is on its side for the whole jump, so one turn usually wants to be all of
     them — but only the files of the same kind as this one, since a jump's clips and its photos can
     come off different cameras. It replaces whatever each had, and touches nothing else. */
  const handleRotationApplyToJump = () => {
    if (!preview || preview.groupId === LOOSE) return
    const current = preview.files[preview.index]
    if (!current) return
    const sameKind = (f: ManifestFile) => isVideoFile(f.path) === isVideoFile(current.path)
    onGroupsChange(
      groups.map((g) =>
        g.id !== preview.groupId
          ? g
          : { ...g, files: g.files.map((f) => (sameKind(f) ? { ...f, rotation } : f)) }
      )
    )
  }

  const handleRotate = (next: Rotation) => {
    setRotation(next)
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
    frame,
    rotation,
    handleRotate,
    handleFrameChange,
    handleFrameApplyToJump,
    handleRotationApplyToJump,
    handleVideoRef,
    setVideoState,
    closePreview,
    setPreview
  }
}

export { LOOSE, usePreview }
