import type { Dispatch, SetStateAction } from 'react'
import { useRef, useState } from 'react'
import type { VideoRef } from '../components/preview-drawer'
import type { ManifestFile, ManifestGroup, PreviewState } from '../components/types'

type VideoState = {
  crop: { cropStart: number | null; cropEnd: number | null }
  zoom: number
  currentTime: number
  duration: number
}

type UsePreviewReturn = {
  preview: PreviewState
  videoState: VideoState
  handlePreview: (file: ManifestFile, groupId: string) => void
  handleVideoSeek: (time: number) => void
  handleVideoApply: (range: { cropStart: number | null; cropEnd: number | null }) => void
  handleVideoRef: (ref: VideoRef) => void
  setVideoState: (next: Partial<VideoState>) => void
  closePreview: () => void
  setPreview: Dispatch<SetStateAction<PreviewState>>
}

const usePreview = (
  groups: ManifestGroup[],
  unassignedFiles: ManifestFile[],
  onGroupsChange: (next: ManifestGroup[]) => void
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
    const files =
      groupId === 'unassigned'
        ? unassignedFiles
        : (groups.find((g) => g.id === groupId)?.files ?? [file])
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

  const handleVideoApply = (range: { cropStart: number | null; cropEnd: number | null }) => {
    if (!preview) return
    const file = preview.files[preview.index]
    if (!file) return
    const targetId = preview.groupId
    if (targetId === 'unassigned') return
    const next = groups.map((g) =>
      g.id !== targetId
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
    onGroupsChange(next as never)
    setVideoStateRaw((prev) => ({ ...prev, crop: range }))
  }

  const handleVideoRef = (ref: VideoRef) => {
    videoRefRef.current = ref
  }

  const closePreview = () => {
    videoRefRef.current = null
    setPreview(null)
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

export { usePreview }
export type { UsePreviewReturn, VideoState }
