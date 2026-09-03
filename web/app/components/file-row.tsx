import type { ManifestFile } from './types'
import { formatSize, formatTime, isVideoFile } from './utils'
import { PhotoIcon, VideoIcon } from './icons'

const FileRow = ({
  file,
  groupId,
  selected,
  isInMultipleJumps,
  onSelect,
  onPreview,
  onDragStart,
  onDragEnd
}: {
  file: ManifestFile
  groupId: string
  selected: boolean
  isInMultipleJumps: boolean
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
    onClick={() => onPreview(file, groupId)}
    className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer select-none transition-all duration-150 ${
      selected
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
    <span className='text-gray-400 text-xs tabular-nums font-medium'>{formatTime(file.mtime)}</span>
    <span className='text-gray-400 text-xs tabular-nums'>{formatSize(file.size)}</span>
  </div>
)

export { FileRow }
