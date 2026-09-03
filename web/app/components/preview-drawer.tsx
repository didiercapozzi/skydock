import { useEffect } from 'react'
import type { ManifestFile } from './types'
import { formatSize, formatTime, isVideoFile } from './utils'

const PreviewDrawer = ({
  files,
  index,
  onClose,
  onPrevious,
  onNext
}: {
  files: ManifestFile[]
  index: number
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
}) => {
  const file = files[index]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!file) return null

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
      <div className='flex-1 flex items-center justify-center bg-gray-950 p-4 overflow-hidden'>
        {isVideoFile(file.filename) ? (
          <video
            controls
            src={file.path}
            className='max-h-full max-w-full rounded'
          />
        ) : (
          <img
            src={file.path}
            alt={file.filename}
            className='max-h-full max-w-full rounded object-contain'
          />
        )}
      </div>
      <div className='px-4 py-2 border-t border-gray-100 text-xs text-gray-500 tabular-nums'>
        {formatTime(file.mtime)} · {formatSize(file.size)} · demo placeholder, no media file
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
