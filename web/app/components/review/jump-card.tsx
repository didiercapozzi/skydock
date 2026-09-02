import { useMemo, useRef, useState } from 'react'
import { formatSequenceTime } from '../../lib/sequences'
import type { ManifestFile, ManifestJump } from '../../lib/types'
import { FileRow } from './file-row'
import { VideoGridThumb } from './video-grid-thumb'
import { getJumpBounds, isVideoFile } from './utils'

type JumpCardProps = {
  jump: ManifestJump
  selection: Record<string, boolean>
  isSelectMode: boolean
  isCompareSelected?: boolean
  multiJumpFiles: Set<string>
  viewMode: 'list' | 'grid'
  onViewModeChange: (v: 'list' | 'grid') => void
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDrop: (e: React.DragEvent, targetJumpId: string) => void
  onDragStart: (e: React.DragEvent, filePaths: string[], sourceJumpId: string) => void
  onRemoveFiles: (jumpId: string, filePaths: string[]) => void
  onPreview: (files: ManifestFile[], index: number, label: string) => void
  onReorder?: (jumpId: string, filePaths: string[]) => void
  onCompareToggle?: (jumpId: string) => void
  onDelete?: (jumpId: string) => void
  onLabelSave?: (jumpId: string, label: string) => void
  onUnprocess?: (jumpId: string) => void
  onDeleteFile?: (jumpId: string, filePath: string) => void
  onRenameFile?: (filePath: string, newFilename: string) => void
  onShiftJump?: (jumpId: string, offsetSeconds: number, paths: string[]) => void
}

const JumpCard = ({
  jump,
  selection,
  isSelectMode,
  isCompareSelected,
  multiJumpFiles,
  viewMode,
  onViewModeChange,
  onSelect,
  onDrop,
  onDragStart,
  onRemoveFiles,
  onPreview,
  onReorder,
  onCompareToggle,
  onDelete,
  onLabelSave,
  onUnprocess,
  onDeleteFile,
  onRenameFile,
  onShiftJump
}: JumpCardProps) => {
  const [expanded, setExpanded] = useState(true)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState(jump.label)
  const [editingDateTime, setEditingDateTime] = useState(false)
  const [dateValue, setDateValue] = useState('')
  const [timeValue, setTimeValue] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [hoveredFile, setHoveredFile] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | 'videos' | 'photos'>('all')
  const dragDataRef = useRef<{ filePaths: string[]; sourceJumpId: string } | null>(null)
  const selectedCount = jump.files.filter((f) => selection[f.path]).length
  const isProcessed = !!jump.processed
  const bounds = getJumpBounds(jump)
  const videoCount = useMemo(
    () => jump.files.filter((f) => isVideoFile(f.filename)).length,
    [jump.files]
  )
  const photoCount = jump.files.length - videoCount

  const filteredFiles = useMemo(() => {
    if (typeFilter === 'videos') return jump.files.filter((f) => isVideoFile(f.filename))
    if (typeFilter === 'photos') return jump.files.filter((f) => !isVideoFile(f.filename))
    return jump.files
  }, [jump.files, typeFilter])

  const handleRowDragOver = (e: React.DragEvent, filePath: string) => {
    if (isProcessed || !onReorder) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const pos = e.clientY < midY ? 'above' : 'below'
    setHoveredFile(filePath)
    setDropPosition(pos)
  }

  const handleRowDragLeave = () => {
    setHoveredFile(null)
    setDropPosition(null)
  }

  const handleLabelSave = () => {
    onLabelSave?.(jump.id, labelValue)
    setEditingLabel(false)
  }

  const handleDateTimeSave = () => {
    if (!dateValue || !timeValue) {
      setEditingDateTime(false)
      return
    }
    const parts = dateValue.split('-')
    const timeParts = timeValue.split(':')
    const y = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10) - 1
    const d = parseInt(parts[2], 10)
    const h = parseInt(timeParts[0], 10)
    const min = parseInt(timeParts[1], 10)
    const newEpoch = Math.floor(new Date(y, m, d, h, min, 0).getTime() / 1000)
    const offset = newEpoch - bounds.start
    if (offset !== 0 && onShiftJump) {
      const paths = jump.files.map((f) => f.path)
      onShiftJump(jump.id, offset, paths)
    }
    setEditingDateTime(false)
  }

  const openDateTimeEditor = () => {
    if (isProcessed || bounds.start === 0) return
    const d = new Date(bounds.start * 1000)
    setDateValue(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    )
    setTimeValue(
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    )
    setEditingDateTime(true)
  }

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${isCompareSelected ? 'border-amber-300 bg-amber-50/50 ring-1 ring-amber-300' : isProcessed ? 'border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-900/20' : isDragOver && !hoveredFile ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'}`}
      onDragOver={(e) => {
        if (isProcessed) return
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => {
        if (!hoveredFile) setIsDragOver(false)
      }}
      onDrop={(e) => {
        if (isProcessed) return
        e.preventDefault()
        setHoveredFile(null)
        setDropPosition(null)
        setIsDragOver(false)
        if (e.dataTransfer.types.includes('text/x-staging-tray')) {
          onDrop(e, jump.id)
          return
        }
        const data = dragDataRef.current
        if (data && data.filePaths.length > 0) {
          if (data.sourceJumpId === jump.id) {
            if (!onReorder || !hoveredFile) return
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            const midY = rect.top + rect.height / 2
            const insertBefore = e.clientY < midY
            const paths = jump.files.map((f) => f.path)
            const filtered = paths.filter((p) => !data.filePaths.includes(p))
            const targetIdx = filtered.indexOf(hoveredFile)
            if (targetIdx === -1) return
            const insertIdx = insertBefore ? targetIdx : targetIdx + 1
            const newPaths = [
              ...filtered.slice(0, insertIdx),
              ...data.filePaths,
              ...filtered.slice(insertIdx)
            ]
            onReorder(jump.id, newPaths)
          } else {
            onDrop(e, jump.id)
          }
        }
      }}>
      <div className='min-w-0'>
        <div
          className='flex items-center gap-2 px-4 py-2'
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('input,button')) return
            e.stopPropagation()
            setExpanded(!expanded)
          }}>
          <input
            type='checkbox'
            checked={!!isCompareSelected}
            onChange={() => onCompareToggle?.(jump.id)}
            onClick={(e) => e.stopPropagation()}
            title={isCompareSelected ? 'Deselect jump' : 'Select jump for compare/process'}
            className='h-4 w-4 rounded border-gray-300 text-amber-600'
          />
          <button
            type='button'
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className='text-gray-400 text-xs'>
            <svg
              className='w-3 h-3'
              fill='none'
              viewBox='0 0 24 24'
              strokeWidth='2'
              stroke='currentColor'>
              {expanded ? (
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='m19.5 8.25-7.5 7.5-7.5-7.5'
                />
              ) : (
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='m8.25 4.5 7.5 7.5-7.5 7.5'
                />
              )}
            </svg>
          </button>
          {editingLabel && !isProcessed ? (
            <input
              type='text'
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              onBlur={handleLabelSave}
              onKeyDown={(e) => e.key === 'Enter' && handleLabelSave()}
              autoFocus
              className='font-semibold text-sm bg-white border rounded px-1 py-0.5'
            />
          ) : (
            <span
              className={`font-semibold text-sm shrink-0 ${isProcessed ? '' : 'cursor-text hover:underline'}`}
              onClick={(e) => {
                e.stopPropagation()
                if (!isProcessed) setEditingLabel(true)
              }}>
              {jump.label}
            </span>
          )}
          {editingDateTime ? (
            <div
              className='flex items-center gap-1'
              onClick={(e) => e.stopPropagation()}>
              <input
                type='date'
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                className='text-xs border rounded px-1 py-0.5'
              />
              <input
                type='time'
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                onBlur={handleDateTimeSave}
                onKeyDown={(e) => e.key === 'Enter' && handleDateTimeSave()}
                autoFocus
                className='text-xs border rounded px-1 py-0.5'
              />
            </div>
          ) : (
            <span
              className='text-xs text-gray-400 cursor-pointer hover:underline decoration-dotted'
              onClick={(e) => {
                e.stopPropagation()
                openDateTimeEditor()
              }}
              title='Click to edit date/time'>
              {jump.files.length > 0
                ? `${formatSequenceTime(bounds.start)}–${formatSequenceTime(bounds.end)}`
                : ''}
            </span>
          )}
          <div className='ml-auto flex items-center gap-1.5'>
            <button
              type='button'
              disabled={videoCount === 0}
              onClick={(e) => {
                e.stopPropagation()
                if (!expanded) setExpanded(true)
                setTypeFilter((v) => (v === 'videos' ? 'all' : 'videos'))
              }}
              className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
                typeFilter === 'videos'
                  ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white'
                  : videoCount === 0
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              title={
                videoCount === 0
                  ? 'No videos'
                  : typeFilter === 'videos'
                    ? 'Show all files'
                    : 'Filter videos'
              }>
              <span className='text-[9px]'>▶</span> {videoCount}
            </button>
            <button
              type='button'
              disabled={photoCount === 0}
              onClick={(e) => {
                e.stopPropagation()
                if (!expanded) setExpanded(true)
                setTypeFilter((v) => (v === 'photos' ? 'all' : 'photos'))
              }}
              className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
                typeFilter === 'photos'
                  ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white'
                  : photoCount === 0
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              title={
                photoCount === 0
                  ? 'No photos'
                  : typeFilter === 'photos'
                    ? 'Show all files'
                    : 'Filter photos'
              }>
              <span className='text-[9px]'>▣</span> {photoCount}
            </button>
            {expanded && jump.files.length > 0 && (
              <button
                type='button'
                onClick={(e) => {
                  e.stopPropagation()
                  onViewModeChange(viewMode === 'list' ? 'grid' : 'list')
                }}
                className='w-6 h-6 flex items-center justify-center rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                title={viewMode === 'grid' ? 'List view' : 'Grid view'}>
                {viewMode === 'grid' ? (
                  <svg
                    className='w-3.5 h-3.5'
                    fill='none'
                    viewBox='0 0 24 24'
                    strokeWidth='1.5'
                    stroke='currentColor'>
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      d='M3.75 6h16.5M3.75 12h16.5M3.75 18h16.5'
                    />
                  </svg>
                ) : (
                  <svg
                    className='w-3.5 h-3.5'
                    fill='none'
                    viewBox='0 0 24 24'
                    strokeWidth='1.5'
                    stroke='currentColor'>
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      d='M3.75 6A2.25 2.25 0 0 0 3.75 10.5h4.5A2.25 2.25 0 0 0 10.5 6v0A2.25 2.25 0 0 0 8.25 3.75h-4.5A2.25 2.25 0 0 0 3.75 6ZM13.5 6a2.25 2.25 0 0 1 2.25 2.25v4.5A2.25 2.25 0 0 1 13.5 15h-4.5A2.25 2.25 0 0 1 6.75 12.75v-4.5A2.25 2.25 0 0 1 9 6h4.5ZM13.5 15a2.25 2.25 0 0 1 2.25 2.25V19.5A2.25 2.25 0 0 1 13.5 21.75h-4.5A2.25 2.25 0 0 1 6.75 19.5v-2.25A2.25 2.25 0 0 1 9 15h4.5ZM19.5 6a2.25 2.25 0 0 1 2.25 2.25v4.5A2.25 2.25 0 0 1 19.5 15h-1.5A2.25 2.25 0 0 1 15.75 12.75v-4.5A2.25 2.25 0 0 1 18 6h1.5ZM19.5 15a2.25 2.25 0 0 1 2.25 2.25V19.5a2.25 2.25 0 0 1-2.25 2.25h-1.5a2.25 2.25 0 0 1-2.25-2.25v-2.25A2.25 2.25 0 0 1 18 15h1.5Z'
                    />
                  </svg>
                )}
              </button>
            )}
            {isProcessed ? (
              <span className='text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30'>
                Processed
              </span>
            ) : (
              selectedCount > 0 && (
                <>
                  <span className='text-xs text-blue-500'>{selectedCount} selected</span>
                  <button
                    type='button'
                    onClick={(e) => {
                      e.stopPropagation()
                      const fps = jump.files.filter((f) => selection[f.path]).map((f) => f.path)
                      if (fps.length) onRemoveFiles(jump.id, fps)
                    }}
                    className='text-xs text-red-500'>
                    Remove
                  </button>
                </>
              )
            )}
            {isProcessed && (
              <button
                type='button'
                onClick={(e) => {
                  e.stopPropagation()
                  onUnprocess?.(jump.id)
                }}
                className='text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'>
                Undo
              </button>
            )}
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation()
                onDelete?.(jump.id)
              }}
              className='text-gray-400 hover:text-red-500 px-1'
              title={isProcessed ? 'Delete and remove processed folder' : 'Remove jump'}>
              <svg
                className='w-3.5 h-3.5'
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
        {expanded && (
          <div className='border-t dark:border-gray-700 px-4 py-2 bg-gray-50/30 dark:bg-gray-800/30'>
            {jump.files.length === 0 ? (
              <p className='text-sm text-gray-400 italic py-2'>Drop files here</p>
            ) : filteredFiles.length === 0 ? (
              <p className='text-xs text-gray-400 italic py-2 text-center'>
                No matching files • {jump.files.length} total
              </p>
            ) : viewMode === 'grid' ? (
              <div className='max-h-80 overflow-y-auto pr-1'>
                <div className='grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5'>
                  {filteredFiles.map((file) => {
                    const globalIdx = jump.files.indexOf(file)
                    const isVideo = isVideoFile(file.filename)
                    const selected = !!selection[file.path]
                    return (
                      <div
                        key={file.path}
                        draggable={!isProcessed}
                        onDragStart={(e) => {
                          if (isProcessed) return
                          const sel = jump.files.filter((f) => selection[f.path]).map((f) => f.path)
                          const toDrag = sel.length > 0 && selection[file.path] ? sel : [file.path]
                          dragDataRef.current = { filePaths: toDrag, sourceJumpId: jump.id }
                          onDragStart(e, toDrag, jump.id)
                        }}
                        onClick={(e) => {
                          const target = e.target as HTMLElement
                          if (target.closest('input')) return
                          if (e.ctrlKey || e.metaKey || e.shiftKey) {
                            onSelect(jump.id, file.path, e.ctrlKey || e.metaKey, e.shiftKey)
                          } else {
                            onPreview(jump.files, globalIdx, jump.label)
                          }
                        }}
                        className={`relative aspect-square bg-gray-100 dark:bg-gray-800 rounded overflow-hidden cursor-pointer group/thumb border ${
                          selected
                            ? 'ring-2 ring-blue-400 border-blue-300'
                            : multiJumpFiles.has(file.path)
                              ? 'border-purple-300 dark:border-purple-600'
                              : 'border-gray-200 dark:border-gray-700'
                        } hover:ring-2 hover:ring-blue-300`}
                        style={{
                          contentVisibility: 'auto',
                          containIntrinsicSize: '84px 84px'
                        }}>
                        {isVideo ? (
                          <VideoGridThumb file={file} />
                        ) : (
                          <img
                            src={`/api/file?path=${encodeURIComponent(file.path)}`}
                            alt={file.filename}
                            className='w-full h-full object-cover'
                            loading='lazy'
                          />
                        )}
                        {isVideo && (
                          <div className='absolute top-1 right-1 text-[8px] bg-black/60 text-white rounded px-1 py-0.5 leading-none'>
                            ▶
                          </div>
                        )}
                        {selected && (
                          <div className='absolute top-1 left-1 w-3 h-3 bg-blue-600 rounded-sm flex items-center justify-center'>
                            <svg
                              className='w-2 h-2 text-white'
                              viewBox='0 0 12 12'
                              fill='none'>
                              <path
                                d='M2 6l2 2 5-5'
                                stroke='currentColor'
                                strokeWidth='1.5'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                              />
                            </svg>
                          </div>
                        )}
                        {(file.cropStart != null && file.cropStart > 0) || file.cropEnd != null ? (
                          <div className='absolute bottom-6 right-1 w-1.5 h-1.5 rounded-full bg-orange-400 border border-white' />
                        ) : null}
                        <div className='absolute bottom-0 inset-x-0 bg-black/60 text-white text-[8px] px-1 py-0.5 truncate leading-tight'>
                          {file.filename}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {filteredFiles.length !== jump.files.length && (
                  <p className='text-[10px] text-gray-400 text-center mt-1.5'>
                    Showing {filteredFiles.length} of {jump.files.length} files
                  </p>
                )}
              </div>
            ) : (
              <div className='max-h-80 overflow-y-auto space-y-0.5 pr-1'>
                {filteredFiles.map((file) => {
                  const idx = jump.files.indexOf(file)
                  return (
                    <FileRow
                      key={file.path}
                      file={file}
                      groupId={jump.id}
                      selected={!!selection[file.path]}
                      isSelectMode={isSelectMode}
                      isInMultipleJumps={multiJumpFiles.has(file.path)}
                      dropPosition={hoveredFile === file.path ? dropPosition : null}
                      onSelect={onSelect}
                      onDragStart={(e, fp) => {
                        if (isProcessed) return
                        const sel = jump.files.filter((f) => selection[f.path]).map((f) => f.path)
                        const toDrag = sel.length > 0 && selection[fp] ? sel : [fp]
                        dragDataRef.current = { filePaths: toDrag, sourceJumpId: jump.id }
                        onDragStart(e, toDrag, jump.id)
                      }}
                      onRowDragOver={isProcessed ? undefined : handleRowDragOver}
                      onRowDragLeave={handleRowDragLeave}
                      onPreview={() => onPreview(jump.files, idx, jump.label)}
                      onDelete={!isProcessed ? () => onDeleteFile?.(jump.id, file.path) : undefined}
                      onRename={
                        !isProcessed ? (newName) => onRenameFile?.(file.path, newName) : undefined
                      }
                    />
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export { JumpCard }
