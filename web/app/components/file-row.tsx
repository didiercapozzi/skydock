import type { ManifestFile } from './types'
import { formatSize, formatTime, isVideoFile } from './utils'
import { PhotoIcon, VideoIcon } from './icons'

const FileRow = ({
  file,
  groupId,
  selected,
  isPreviewed,
  isInMultipleJumps,
  hasSelection,
  uploadPercent,
  uploadState,
  onSelect,
  onPreview,
  onDragStart,
  onDragEnd
}: {
  file: ManifestFile
  groupId: string
  selected: boolean
  isPreviewed: boolean
  isInMultipleJumps: boolean
  hasSelection: boolean
  uploadPercent?: number | null
  uploadState?: 'uploading' | 'done' | 'error' | null
  onSelect: (groupId: string, path: string, ctrl: boolean, shift: boolean) => void
  onPreview: (file: ManifestFile, groupId: string) => void
  onDragStart?: (e: React.DragEvent, groupId: string, paths: string[]) => void
  onDragEnd?: () => void
}) => (
  <div
    data-file-row='true'
    draggable
    onDragStart={(e) => onDragStart?.(e, groupId, [file.path])}
    onDragEnd={() => onDragEnd?.()}
    onClick={(e) => {
      if (hasSelection) onSelect(groupId, file.path, e.ctrlKey || e.metaKey, e.shiftKey)
      else onPreview(file, groupId)
    }}
    className={`relative flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer select-none transition-all duration-150 overflow-hidden ${
      isPreviewed
        ? 'bg-purple-50 ring-1 ring-purple-400 shadow-sm'
        : selected
          ? 'bg-blue-50 ring-1 ring-blue-400 shadow-sm'
          : isInMultipleJumps
            ? 'bg-purple-50 hover:bg-purple-100 border border-purple-200'
            : 'hover:bg-gray-50 border border-transparent hover:border-gray-200'
    }`}>
    <input
      type='checkbox'
      checked={selected}
      onChange={() => {}}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(groupId, file.path, e.ctrlKey || e.metaKey, e.shiftKey)
      }}
      className='h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
    />
    <div
      className={`p-1 rounded ${isVideoFile(file.filename) ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
      {isVideoFile(file.filename) ? (
        <VideoIcon className='w-3.5 h-3.5' />
      ) : (
        <PhotoIcon className='w-3.5 h-3.5' />
      )}
    </div>
    <span className='font-mono truncate flex-1 text-xs text-gray-700'>{file.filename}</span>
    {uploadPercent != null && (
      <span
        data-upload-file-progress='true'
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium tabular-nums ${uploadState === 'error' ? 'bg-red-100 text-red-700 border border-red-200' : uploadPercent >= 100 ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
        {uploadState === 'error' ? 'error' : `${uploadPercent}%`}
      </span>
    )}
    {isVideoFile(file.filename) && (file.cropStart != null || file.cropEnd != null) && (
      <span
        data-cropped-badge='true'
        title={
          file.cropStart != null || file.cropEnd != null
            ? `Cropped ${file.cropStart != null ? `${file.cropStart.toFixed(1)}s` : '0.0s'} → ${file.cropEnd != null ? `${file.cropEnd.toFixed(1)}s` : 'end'}`
            : undefined
        }
        className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200'>
        ✂️ Cropped
      </span>
    )}
    <span className='text-gray-400 text-xs tabular-nums font-medium'>{formatTime(file.mtime)}</span>
    <span className='text-gray-400 text-xs tabular-nums'>{formatSize(file.size)}</span>
    {uploadPercent != null && uploadPercent < 100 && uploadState !== 'error' && (
      <div className='absolute inset-x-0 bottom-0 h-0.5 bg-blue-100'>
        <div
          className='h-full bg-blue-600 transition-all duration-200'
          style={{ width: `${uploadPercent}%` }}
        />
      </div>
    )}
    {uploadPercent != null && uploadPercent >= 100 && uploadState !== 'error' && (
      <div className='absolute inset-x-0 bottom-0 h-0.5 bg-green-500' />
    )}
  </div>
)

export { FileRow }
