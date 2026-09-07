import { useEffect, useRef } from 'react'
import type { ManifestFile } from './types'
import { VideoCropper } from './video-cropper'
import { formatSize, formatTime, getFileUrl, isVideoFile } from './utils'

type VideoRef = {
  seek: (time: number) => void
  getBuffered: () => Array<{ start: number; end: number }>
}

const PreviewDrawer = ({
  files,
  index,
  onClose,
  onPrevious,
  onNext,
  cropStart,
  cropEnd,
  zoom,
  currentTime,
  duration,
  onSeek,
  onCropChange,
  onApply,
  onZoomChange,
  onDurationChange,
  onVideoRef
}: {
  files: ManifestFile[]
  index: number
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
  cropStart: number | null
  cropEnd: number | null
  zoom: number
  currentTime: number
  duration: number
  onSeek: (time: number) => void
  onCropChange: (range: { cropStart: number | null; cropEnd: number | null }) => void
  onApply: (range: { cropStart: number | null; cropEnd: number | null }) => void
  onZoomChange: (zoom: number) => void
  onDurationChange: (duration: number) => void
  onVideoRef: (ref: VideoRef) => void
}) => {
  const file = files[index]
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (videoRef.current) {
      onVideoRef({
        seek: (time: number) => {
          if (videoRef.current) videoRef.current.currentTime = time
        },
        getBuffered: () => {
          if (!videoRef.current) return []
          const v = videoRef.current
          const ranges: Array<{ start: number; end: number }> = []
          for (let i = 0; i < v.buffered.length; i++) {
            ranges.push({ start: v.buffered.start(i), end: v.buffered.end(i) })
          }
          return ranges
        }
      })
    }
  }, [file?.path, onVideoRef])

  if (!file) return null

  const fileUrl = getFileUrl(file.path)

  return (
    <div
      data-preview-drawer='true'
      className='fixed top-0 right-0 bottom-0 w-[420px] max-w-[90vw] bg-white border-l border-gray-200 shadow-2xl z-40 flex flex-col'>
      <div className='flex items-center justify-between px-4 py-3 border-b border-gray-100'>
        <span className='font-mono truncate text-xs text-gray-700'>{file.filename}</span>
        <button
          type='button'
          aria-label='Close preview'
          onClick={onClose}
          className='px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors'>
          Close
        </button>
      </div>
      <div className='flex-1 flex flex-col bg-gray-950 overflow-hidden'>
        <div className='flex-1 flex items-center justify-center p-4 overflow-hidden'>
          {isVideoFile(file.filename) ? (
            <video
              ref={videoRef}
              controls
              src={fileUrl}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget
                if (v.duration && Number.isFinite(v.duration)) onDurationChange(v.duration)
              }}
              className='max-h-full max-w-full rounded'
            />
          ) : (
            <img
              src={fileUrl}
              alt={file.filename}
              className='max-h-full max-w-full rounded object-contain'
            />
          )}
        </div>
        {isVideoFile(file.filename) && (
          <div className='px-3 pb-3'>
            <VideoCropper
              duration={duration}
              currentTime={currentTime}
              bufferedRanges={[]}
              cropStart={cropStart}
              cropEnd={cropEnd}
              zoom={zoom}
              onSeek={onSeek}
              onCropChange={onCropChange}
              onApply={onApply}
              onZoomChange={onZoomChange}
            />
          </div>
        )}
      </div>
      <div className='px-4 py-2 border-t border-gray-100 text-xs text-gray-500 tabular-nums'>
        {formatTime(file.mtime)} · {formatSize(file.size)}
      </div>
      <div className='flex items-center justify-between px-4 py-3 border-t border-gray-100'>
        <button
          type='button'
          aria-label='Previous file'
          disabled={index === 0}
          onClick={onPrevious}
          className='px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed'>
          Previous
        </button>
        <span className='text-xs text-gray-500 tabular-nums'>
          {index + 1} / {files.length}
        </span>
        <button
          type='button'
          aria-label='Next file'
          disabled={index === files.length - 1}
          onClick={onNext}
          className='px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed'>
          Next
        </button>
      </div>
    </div>
  )
}

export { PreviewDrawer }
export type { VideoRef }
