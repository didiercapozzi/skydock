import { isVideoFile } from '@skydock/scripts'
import type { FrameCrop, Rotation } from '@skydock/scripts'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { VideoRef } from '../components/preview-drawer'
import type { ManifestFile, ManifestGroup } from '../components/types'
import { placeHref } from '../helpers/places'
import type { Place } from '../helpers/places'
import { openFile } from '../helpers/previewWindow'
import type { BoardView } from '../helpers/view'

type CropRange = { cropStart: number | null; cropEnd: number | null }

type Draft = {
  id: string
  crop: CropRange
  zoom: number
  currentTime: number
  duration: number
  frame: FrameCrop | null
  rotation: Rotation
}

const LOOSE = 'loose'

const idOf = (file: ManifestFile) => file.id ?? file.path

const asItStands = (file: ManifestFile): Draft => ({
  id: idOf(file),
  crop: { cropStart: file.cropStart ?? null, cropEnd: file.cropEnd ?? null },
  zoom: 1,
  currentTime: file.cropStart ?? 0,
  duration: 0,
  frame: file.frame ?? null,
  rotation: file.rotation ?? 0
})

const shownIn = (groups: ManifestGroup[], loose: ManifestFile[], fileId: string | undefined) => {
  if (!fileId) return null
  const inJump = groups.flatMap((group) =>
    group.files.filter((file) => idOf(file) === fileId).map((file) => ({ group, file }))
  )[0]
  if (inJump)
    return {
      files: inJump.group.files,
      index: inJump.group.files.findIndex((file) => idOf(file) === fileId),
      groupId: inJump.group.id
    }
  const lone = loose.find((file) => idOf(file) === fileId)
  return lone ? { files: [lone], index: 0, groupId: LOOSE } : null
}

const usePreview = ({
  groups,
  loose,
  place,
  fileId,
  view,
  saving = false,
  onGroupsChange,
  onFileCrop
}: {
  groups: ManifestGroup[]
  loose: ManifestFile[]
  place: Place
  fileId: string | undefined
  view: BoardView
  saving?: boolean
  onGroupsChange: (next: ManifestGroup[]) => void
  onFileCrop: (
    file: ManifestFile,
    range: CropRange,
    frame?: FrameCrop | null,
    rotation?: Rotation
  ) => void
}) => {
  const goTo = useNavigate()
  const [drafted, setDrafted] = useState<Draft | null>(null)
  const [closing, setClosing] = useState(false)
  const videoRefRef = useRef<VideoRef | null>(null)

  const preview = shownIn(groups, loose, fileId)
  const file = preview?.files[preview.index]
  const draft = file && drafted?.id === idOf(file) ? drafted : file ? asItStands(file) : null
  const edit = (next: Partial<Draft>) => draft && setDrafted({ ...draft, ...next })

  const windowed = view.window === 'preview'
  const openPreview = (file: ManifestFile) => openFile(goTo, place, idOf(file), view)

  const stepPreview = (by: number) => {
    if (!preview) return
    const next = preview.files[Math.min(Math.max(preview.index + by, 0), preview.files.length - 1)]
    if (next && idOf(next) !== fileId) openPreview(next)
  }

  const handleVideoSeek = (time: number) => {
    edit({ currentTime: time })
    videoRefRef.current?.seek(time)
  }

  const handleVideoTime = (time: number) => {
    if (draft && draft.currentTime !== time) edit({ currentTime: time })
  }

  const closePreview = () => {
    videoRefRef.current = null
    if (windowed) window.close()
    else goTo(placeHref(place, view))
  }

  const committed = (range: CropRange) =>
    range.cropStart !== null ||
    range.cropEnd !== null ||
    draft?.frame != null ||
    Boolean(draft?.rotation)

  const handleVideoApply = (range: CropRange) => {
    if (!preview || !file || !draft) return
    const { frame, rotation } = draft
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
    edit({ crop: range })
    if (!committed(range)) return
    if (windowed) setClosing(true)
    else closePreview()
  }

  const handleFrameApplyToJump = () => {
    if (!preview || preview.groupId === LOOSE || !file) return
    const frame = draft?.frame ?? null
    onGroupsChange(
      groups.map((g) =>
        g.id !== preview.groupId
          ? g
          : { ...g, files: g.files.map((f) => (isVideoFile(f.path) ? { ...f, frame } : f)) }
      )
    )
  }

  const handleRotationApplyToJump = () => {
    if (!preview || preview.groupId === LOOSE || !file) return
    const rotation = draft?.rotation ?? 0
    const sameKind = (f: ManifestFile) => isVideoFile(f.path) === isVideoFile(file.path)
    onGroupsChange(
      groups.map((g) =>
        g.id !== preview.groupId
          ? g
          : { ...g, files: g.files.map((f) => (sameKind(f) ? { ...f, rotation } : f)) }
      )
    )
  }

  const sawSaving = useRef(false)
  useEffect(() => {
    if (!closing) return
    if (saving) {
      sawSaving.current = true
      return
    }
    if (sawSaving.current) {
      closePreview()
      return
    }
    const later = setTimeout(closePreview, 1500)
    return () => clearTimeout(later)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing, saving])

  const handleVideoRef = (ref: VideoRef) => {
    videoRefRef.current = ref
  }

  return {
    preview,
    windowed,
    videoState: {
      crop: draft?.crop ?? { cropStart: null, cropEnd: null },
      zoom: draft?.zoom ?? 1,
      currentTime: draft?.currentTime ?? 0,
      duration: draft?.duration ?? 0
    },
    openPreview,
    stepPreview,
    handleVideoSeek,
    handleVideoTime,
    handleVideoApply,
    frame: draft?.frame ?? null,
    rotation: draft?.rotation ?? 0,
    handleRotate: (rotation: Rotation) => edit({ rotation }),
    handleFrameChange: (frame: FrameCrop | null) => edit({ frame }),
    handleFrameApplyToJump,
    handleRotationApplyToJump,
    handleVideoRef,
    setVideoState: edit,
    closePreview
  }
}

export { LOOSE, usePreview }
