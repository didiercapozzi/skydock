import { useEffect, useRef, useState } from 'react'
import { formatSize, formatTime, isVideoFile } from './utils'
import { MediaPreview } from './media-preview'
import { VideoCropper } from './video-cropper'
import type { PreviewState } from './types'

type PreviewDrawerProps = {
  preview: PreviewState
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

const PreviewDrawer = ({ preview, onClose, onPrev, onNext }: PreviewDrawerProps) => {
  const file = preview.files[preview.index]
  const src = `/api/file?path=${encodeURIComponent(file.path)}`
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [durations, setDurations] = useState<Record<string, number>>({})
  const videoDuration = durations[file.path] ?? 0
  const isVideo = isVideoFile(file.filename)

  const setVideoDurationForFile = (d: number) => {
    setDurations((prev) => ({ ...prev, [file.path]: d }))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  return (
    <div className='fixed inset-0 z-50 flex justify-end'>
      <div
        className='absolute inset-0 bg-black/30'
        onClick={onClose}
      />
      <div className='relative w-full max-w-[520px] h-full bg-white dark:bg-gray-900 shadow-xl flex flex-col'>
        <div className='flex items-center justify-between px-4 py-3 border-b dark:border-gray-700'>
          <div className='min-w-0'>
            <div className='text-sm font-medium truncate'>{preview.label}</div>
            <div className='text-xs text-gray-500 truncate'>
              {file.filename} • {preview.index + 1} / {preview.files.length} •{' '}
              {formatTime(file.mtime)}
            </div>
          </div>
          <div className='flex items-center gap-2 shrink-0'>
            <a
              href={src}
              target='_blank'
              rel='noreferrer'
              className='text-xs px-2 py-1 rounded border hover:bg-gray-50 dark:hover:bg-gray-800'>
              Open
            </a>
            <button
              type='button'
              onClick={onClose}
              className='w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800'>
              <svg
                className='w-4 h-4'
                fill='none'
                viewBox='0 0 24 24'
                strokeWidth='1.5'
                stroke='currentColor'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M6 18 18 6M6 6l12 12'
                />
              </svg>
            </button>
          </div>
        </div>
        <div className='flex-1 flex flex-col items-center justify-center p-4 gap-3 overflow-auto'>
          <div className='w-full flex items-center justify-center'>
            <MediaPreview
              key={file.path}
              file={file}
              videoRef={isVideo ? videoRef : undefined}
              onDurationLoaded={isVideo ? setVideoDurationForFile : undefined}
            />
          </div>
          {isVideo && videoDuration > 0 && (
            <VideoCropper
              key={file.path}
              videoRef={videoRef}
              duration={videoDuration}
              filePath={file.path}
              filmstripDir={file.filmstripDir ?? undefined}
              keyframes={file.keyframes ?? undefined}
              initialCropStart={file.cropStart ?? undefined}
              initialCropEnd={file.cropEnd ?? undefined}
              onApplied={onClose}
            />
          )}
          <div className='text-xs text-gray-500'>{formatSize(file.size)}</div>
        </div>
        <div className='flex items-center justify-between px-4 py-3 border-t dark:border-gray-700'>
          <button
            type='button'
            onClick={onPrev}
            disabled={preview.files.length <= 1}
            className='px-3 py-1.5 text-sm rounded border disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800'>
            ← Prev
          </button>
          <span className='text-xs text-gray-500'>
            {preview.index + 1} / {preview.files.length}
          </span>
          <button
            type='button'
            onClick={onNext}
            disabled={preview.files.length <= 1}
            className='px-3 py-1.5 text-sm rounded border disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800'>
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}

export { PreviewDrawer }
