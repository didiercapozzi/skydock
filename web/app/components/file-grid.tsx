import type { ManifestFile } from './types'
import { getFileUrl, getThumbUrl, isVideoFile } from './utils'

const FileGrid = ({
  files,
  groupId,
  selection,
  previewedPath,
  onSelect,
  onPreview,
  onDragStart,
  onDragEnd
}: {
  files: readonly ManifestFile[]
  groupId: string
  selection: Record<string, boolean>
  previewedPath: string | null
  onSelect: (groupId: string, path: string, ctrl: boolean, shift: boolean) => void
  onPreview: (file: ManifestFile, groupId: string) => void
  onDragStart?: (e: React.DragEvent, groupId: string, paths: string[]) => void
  onDragEnd?: () => void
}) => (
  <div className='grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2'>
    {files.map((file) => {
      const selected = !!selection?.[file.path]
      const isPreviewed = previewedPath === file.path
      const isCropped =
        isVideoFile(file.filename) && (file.cropStart != null || file.cropEnd != null)
      const thumbSrc = isVideoFile(file.filename)
        ? getThumbUrl(file.path, 0.5, 160)
        : getFileUrl(file.path)
      return (
        <div
          key={file.path}
          data-file-grid-item='true'
          draggable
          onDragStart={(e) => onDragStart?.(e, groupId, [file.path])}
          onDragEnd={() => onDragEnd?.()}
          onClick={() => onPreview(file, groupId)}
          className={`group relative aspect-square overflow-hidden rounded-lg border cursor-pointer select-none ${isPreviewed ? 'ring-2 ring-purple-400' : selected ? 'ring-2 ring-blue-400' : 'border-gray-200 hover:border-gray-300'} ${selected ? 'bg-blue-50' : 'bg-gray-50'}`}>
          <img
            src={thumbSrc}
            alt={file.filename}
            loading='lazy'
            decoding='async'
            className='h-full w-full object-cover'
          />
          <div className='absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-1'>
            <p className='truncate text-xs font-mono text-white'>{file.filename}</p>
          </div>
          <input
            type='checkbox'
            checked={selected}
            onChange={() => {}}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(groupId, file.path, e.ctrlKey || e.metaKey, e.shiftKey)
            }}
            className='absolute left-1.5 top-1.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
          />
          {isCropped && (
            <span
              data-cropped-badge='true'
              title={`Cropped ${file.cropStart != null ? `${file.cropStart.toFixed(1)}s` : '0.0s'} → ${file.cropEnd != null ? `${file.cropEnd.toFixed(1)}s` : 'end'}`}
              className='absolute right-1 top-1 rounded bg-amber-100 px-1 py-0.5 text-xs font-medium text-amber-700 border border-amber-200'>
              ✂️
            </span>
          )}
          {isVideoFile(file.filename) && (
            <span className='absolute right-1 bottom-6 rounded bg-black/70 px-1 text-xs text-white'>
              ▶
            </span>
          )}
        </div>
      )
    })}
  </div>
)

export { FileGrid }
