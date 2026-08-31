import type { ManifestFile } from '../../lib/types'
import { ProxyBadge } from './proxy-badge'

type StagingTrayProps = {
  selectedFiles: { groupId: string; file: ManifestFile }[]
  copyMode: boolean
  setCopyMode: (v: boolean) => void
  onClear: () => void
  onRemove: (groupId: string, filePath: string) => void
  onDragStart: (e: React.DragEvent, filePaths: string[]) => void
}

const StagingTray = ({
  selectedFiles,
  copyMode,
  setCopyMode,
  onClear,
  onRemove,
  onDragStart
}: StagingTrayProps) => {
  const handleTrayDragStart = (e: React.DragEvent) => {
    const paths = selectedFiles.map((s) => s.file.path)
    onDragStart(e, paths)
  }

  return (
    <div className='w-[300px] shrink-0 sticky top-6 h-fit max-h-[80vh] flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm overflow-hidden'>
      <div className='px-3 py-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between'>
        <span className='text-sm font-semibold'>{selectedFiles.length} selected</span>
        <button
          type='button'
          onClick={onClear}
          className='text-xs text-blue-600 hover:underline'>
          Clear
        </button>
      </div>
      <div className='px-3 py-2 flex items-center gap-3 border-b dark:border-gray-700 text-xs'>
        <label className='flex items-center gap-1 cursor-pointer'>
          <input
            type='radio'
            checked={!copyMode}
            onChange={() => setCopyMode(false)}
            className='h-3 w-3'
          />
          Move
        </label>
        <label className='flex items-center gap-1 cursor-pointer'>
          <input
            type='radio'
            checked={copyMode}
            onChange={() => setCopyMode(true)}
            className='h-3 w-3'
          />
          Copy
        </label>
      </div>
      <div
        className='flex-1 overflow-y-auto p-2 space-y-1 min-h-[80px]'
        draggable={selectedFiles.length > 0}
        onDragStart={handleTrayDragStart}>
        {selectedFiles.length === 0 ? (
          <p className='text-xs text-gray-400 italic px-2 py-4 text-center'>
            Select files to stage
          </p>
        ) : (
          selectedFiles.map(({ groupId, file }) => (
            <div
              key={`${groupId}-${file.path}`}
              className='flex items-center gap-2 px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-800'>
              <span className='font-mono truncate flex-1'>{file.filename}</span>
              <ProxyBadge file={file} />
              <button
                type='button'
                onClick={() => onRemove(groupId, file.path)}
                className='text-gray-400 hover:text-red-500'>
                <svg
                  className='w-3 h-3'
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
          ))
        )}
      </div>
      {selectedFiles.length > 0 && (
        <div className='px-3 py-2 text-[11px] text-gray-500 border-t dark:border-gray-700 text-center'>
          Drag this tray to a jump to {copyMode ? 'copy' : 'move'}
        </div>
      )}
    </div>
  )
}

export { StagingTray }
