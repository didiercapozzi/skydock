import { useState } from 'react'
import type { ManifestFile } from '../../lib/types'
import { ProxyBadge } from './proxy-badge'
import { formatSize, formatTime } from './utils'

type FileRowProps = {
  file: ManifestFile
  groupId: string
  selected: boolean
  isSelectMode?: boolean
  isInMultipleJumps?: boolean
  dropPosition?: 'above' | 'below' | null
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDragStart: (e: React.DragEvent, filePath: string, groupId: string) => void
  onRowDragOver?: (e: React.DragEvent, filePath: string) => void
  onRowDragLeave?: () => void
  onPreview?: () => void
  onDelete?: () => void
  onRename?: (newFilename: string) => void
}

const FileRow = ({
  file,
  groupId,
  selected,
  isSelectMode,
  isInMultipleJumps,
  dropPosition,
  onSelect,
  onDragStart,
  onRowDragOver,
  onRowDragLeave,
  onPreview,
  onDelete,
  onRename
}: FileRowProps) => {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(file.filename)

  const handleRowClick = (e: React.MouseEvent) => {
    if (isSelectMode || e.ctrlKey || e.metaKey || e.shiftKey) {
      onSelect(groupId, file.path, e.ctrlKey || e.metaKey, e.shiftKey)
    } else if (onPreview) {
      onPreview()
    }
  }

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(groupId, file.path, true, false)
  }

  const handleDragStart = (e: React.DragEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('input[type="checkbox"]') || target.closest('button')) {
      e.preventDefault()
      return
    }
    onDragStart(e, file.path, groupId)
  }

  const handleRenameSave = () => {
    if (nameValue.trim() && nameValue !== file.filename) {
      onRename?.(nameValue.trim())
    } else {
      setNameValue(file.filename)
    }
    setEditingName(false)
  }

  const dropBorder =
    dropPosition === 'above'
      ? 'border-t-2 border-blue-500'
      : dropPosition === 'below'
        ? 'border-b-2 border-blue-500'
        : ''

  return (
    <div
      data-file-row='true'
      className={`relative flex items-center gap-2 px-3 py-1.5 text-sm rounded cursor-pointer select-none transition-colors ${dropBorder} ${
        selected
          ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-300 dark:ring-blue-700'
          : isInMultipleJumps
            ? 'bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
      draggable
      onDragStart={handleDragStart}
      onDragOver={(e) => {
        if (!onRowDragOver) return
        e.preventDefault()
        e.stopPropagation()
        onRowDragOver(e, file.path)
      }}
      onDragLeave={() => onRowDragLeave?.()}
      onClick={handleRowClick}>
      <input
        type='checkbox'
        checked={selected}
        onChange={() => {}}
        onClick={handleCheckboxClick}
        className='h-4 w-4 rounded border-gray-300 text-blue-600'
      />
      {editingName ? (
        <input
          type='text'
          value={nameValue}
          size={Math.max(nameValue.length, 4)}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={handleRenameSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSave()
            if (e.key === 'Escape') {
              setNameValue(file.filename)
              setEditingName(false)
            }
          }}
          autoFocus
          className='font-mono text-xs bg-white border rounded px-1 py-0.5 min-w-[40px] max-w-[200px]'
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className='font-mono truncate flex-1 text-xs text-gray-700 dark:text-gray-300 hover:underline decoration-dotted cursor-text'
          onClick={(e) => {
            e.stopPropagation()
            if (onDelete) setEditingName(true)
          }}>
          {file.filename}
        </span>
      )}
      {((file.cropStart != null && file.cropStart > 0) || file.cropEnd != null) && (
        <span
          className='shrink-0 w-1.5 h-1.5 rounded-full bg-orange-400'
          title='Cropped'
        />
      )}
      <ProxyBadge file={file} />
      <span className='text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap tabular-nums'>
        {formatTime(file.mtime)}
      </span>
      <span className='text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap'>
        {formatSize(file.size)}
      </span>
      {onPreview && (
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            onPreview()
          }}
          className='w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 shrink-0'
          title='Preview'>
          <svg
            className='w-3.5 h-3.5'
            fill='none'
            viewBox='0 0 24 24'
            strokeWidth='1.5'
            stroke='currentColor'>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z'
            />
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'
            />
          </svg>
        </button>
      )}
      {onDelete && (
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className='w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 shrink-0'
          title='Delete file'>
          <svg
            className='w-3.5 h-3.5'
            fill='none'
            viewBox='0 0 24 24'
            strokeWidth='1.5'
            stroke='currentColor'>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0'
            />
          </svg>
        </button>
      )}
    </div>
  )
}

export { FileRow }
