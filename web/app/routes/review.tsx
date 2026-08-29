import * as fs from 'node:fs'
import * as path from 'node:path'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useFetcher, useRevalidator } from 'react-router'
import { getOutputDirPath } from '../lib/scanner.server'
import { ensureManifestFileIds } from '../lib/fileId.server'
import { formatDateForInput, formatSequenceDate, formatSequenceTime } from '../lib/sequences'
import type { Manifest, ManifestFile, ManifestJump } from '../lib/types'
import type { Route } from './+types/review'

const loader = async () => {
  const manifestPath = path.join(getOutputDirPath(), 'manifest.json')
  await ensureManifestFileIds(manifestPath)
  let manifest: Manifest | null = null
  try {
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest
    }
  } catch {
    manifest = null
  }
  return { manifest }
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatTime = (epoch: number): string =>
  new Date(epoch * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

type SelectionMap = Record<string, Record<string, boolean>>

type JumpDayGroup = {
  date: string
  jumps: ManifestJump[]
}

const getJumpDate = (jump: ManifestJump): string => {
  if (jump.files.length === 0) return ''
  const min = Math.min(...jump.files.map((f) => f.mtime))
  return formatSequenceDate(min)
}

const getJumpBounds = (jump: ManifestJump): { start: number; end: number } => {
  if (jump.files.length === 0) return { start: 0, end: 0 }
  const times = jump.files.map((f) => f.mtime)
  return { start: Math.min(...times), end: Math.max(...times) }
}

const groupJumpsByDay = (jumps: ManifestJump[]): JumpDayGroup[] => {
  const map = new Map<string, JumpDayGroup>()
  for (const jump of jumps) {
    const date = getJumpDate(jump) || 'Unknown'
    const g = map.get(date)
    if (g) g.jumps.push(jump)
    else map.set(date, { date, jumps: [jump] })
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.jumps[0] ? getJumpBounds(a.jumps[0]).start : 0
    const tb = b.jumps[0] ? getJumpBounds(b.jumps[0]).start : 0
    return ta - tb
  })
}

type PreviewState = {
  files: ManifestFile[]
  index: number
  label: string
}

const PreviewDrawer = ({
  preview,
  onClose,
  onPrev,
  onNext
}: {
  preview: PreviewState
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) => {
  const file = preview.files[preview.index]
  const isVideo = /\.(mp4|mov|avi|mkv)$/i.test(file.filename)
  const src = `/api/file?path=${encodeURIComponent(file.path)}`

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
              ✕
            </button>
          </div>
        </div>
        <div className='flex-1 flex flex-col items-center justify-center p-4 gap-3 overflow-auto'>
          <div className='w-full flex items-center justify-center'>
            {isVideo ? (
              <video
                key={file.path}
                src={src}
                controls
                autoPlay
                muted
                preload='metadata'
                className='max-w-full max-h-[60vh] rounded bg-black'
              />
            ) : (
              <img
                key={file.path}
                src={src}
                alt={file.filename}
                className='max-w-full max-h-[60vh] rounded object-contain'
              />
            )}
          </div>
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

const FileRow = ({
  file,
  groupId,
  selected,
  isSelectMode,
  dropPosition,
  onSelect,
  onDragStart,
  onRowDragOver,
  onRowDragLeave,
  onPreview
}: {
  file: ManifestFile
  groupId: string
  selected: boolean
  isSelectMode?: boolean
  dropPosition?: 'above' | 'below' | null
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDragStart: (e: React.DragEvent, filePath: string, groupId: string) => void
  onRowDragOver?: (e: React.DragEvent, filePath: string) => void
  onRowDragLeave?: () => void
  onPreview?: () => void
}) => {
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

  const handleCheckboxMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const handleDragStart = (e: React.DragEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('input[type="checkbox"]') || target.closest('button')) {
      e.preventDefault()
      return
    }
    onDragStart(e, file.path, groupId)
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
        onMouseDown={handleCheckboxMouseDown}
        className='h-4 w-4 rounded border-gray-300 text-blue-600'
      />
      <span className='font-mono truncate flex-1 text-xs text-gray-700 dark:text-gray-300'>
        {file.filename}
      </span>
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
          👁
        </button>
      )}
    </div>
  )
}

const JumpCard = ({
  jump,
  selection,
  isSelectMode,
  isCompareSelected,
  onSelect,
  onDrop,
  onDragStart,
  onRemoveFiles,
  onPreview,
  onReorder,
  onCompareToggle
}: {
  jump: ManifestJump
  selection: Record<string, boolean>
  isSelectMode: boolean
  isCompareSelected?: boolean
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDrop: (e: React.DragEvent, targetJumpId: string) => void
  onDragStart: (e: React.DragEvent, filePaths: string[], sourceJumpId: string) => void
  onRemoveFiles: (jumpId: string, filePaths: string[]) => void
  onPreview: (files: ManifestFile[], index: number, label: string) => void
  onReorder?: (jumpId: string, filePaths: string[]) => void
  onCompareToggle?: (jumpId: string) => void
}) => {
  const [expanded, setExpanded] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState(jump.label)
  const [isDragOver, setIsDragOver] = useState(false)
  const [hoveredFile, setHoveredFile] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)
  const dragDataRef = useRef<{ filePaths: string[]; sourceJumpId: string } | null>(null)
  const fetcher = useFetcher()
  const selectedCount = jump.files.filter((f) => selection[f.path]).length
  const isProcessed = !!jump.processed
  const bounds = getJumpBounds(jump)

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
    fetcher.submit(
      { action: 'update-label', jumpId: jump.id, label: labelValue },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
    setEditingLabel(false)
  }
  const handleDelete = () => {
    fetcher.submit(
      { action: 'delete-jump', jumpId: jump.id },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }
  const handleUnprocess = () => {
    fetcher.submit(
      { action: 'unprocess-jump', jumpId: jump.id },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
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
            {expanded ? '▼' : '▶'}
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
          <div className='ml-auto flex items-center gap-2'>
            <span className='text-xs text-gray-400'>
              {jump.files.length} files •{' '}
              {jump.files.length > 0
                ? `${formatSequenceTime(bounds.start)}–${formatSequenceTime(bounds.end)}`
                : ''}
            </span>
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
                  handleUnprocess()
                }}
                className='text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'>
                Undo
              </button>
            )}
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation()
                handleDelete()
              }}
              className='text-gray-400 hover:text-red-500 px-1'
              title={isProcessed ? 'Delete and remove processed folder' : 'Remove jump'}>
              ✕
            </button>
          </div>
        </div>
        {expanded && (
          <div className='border-t dark:border-gray-700 px-4 py-2 bg-gray-50/30 dark:bg-gray-800/30'>
            {jump.files.length === 0 ? (
              <p className='text-sm text-gray-400 italic py-2'>Drop files here</p>
            ) : (
              <div className='max-h-80 overflow-y-auto space-y-0.5 pr-1'>
                {jump.files.map((file, idx) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    groupId={jump.id}
                    selected={!!selection[file.path]}
                    isSelectMode={isSelectMode}
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
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const CompareDrawer = ({
  jumps,
  allJumps,
  compareIds,
  onCompareIdsChange,
  onClose,
  onMerge
}: {
  jumps: [ManifestJump, ManifestJump]
  allJumps: ManifestJump[]
  compareIds: string[]
  onCompareIdsChange: (ids: string[]) => void
  onClose: () => void
  onMerge: (targetId: string, sourceId: string) => void
}) => {
  const [leftIdx, setLeftIdx] = useState<number | null>(null)
  const [rightIdx, setRightIdx] = useState<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const navigateJump = useCallback(
    (col: 0 | 1, dir: 1 | -1) => {
      const currentId = compareIds[col]
      const otherId = compareIds[1 - col]
      const currentPos = allJumps.findIndex((j) => j.id === currentId)
      if (currentPos === -1) return
      let nextPos = currentPos + dir
      if (nextPos < 0) nextPos = allJumps.length - 1
      if (nextPos >= allJumps.length) nextPos = 0
      let nextId = allJumps[nextPos].id
      if (nextId === otherId) {
        nextPos = nextPos + dir
        if (nextPos < 0) nextPos = allJumps.length - 1
        if (nextPos >= allJumps.length) nextPos = 0
        nextId = allJumps[nextPos].id
      }
      if (nextId === otherId) return
      const nextIds = [...compareIds]
      nextIds[col] = nextId
      onCompareIdsChange(nextIds)
      if (col === 0) setLeftIdx(null)
      else setRightIdx(null)
    },
    [allJumps, compareIds, onCompareIdsChange]
  )

  const renderPreview = (file: ManifestFile | null) => {
    if (!file)
      return (
        <div className='flex items-center justify-center h-[200px] text-xs text-gray-400'>
          Select a file
        </div>
      )
    const isVideo = /\.(mp4|mov|avi|mkv)$/i.test(file.filename)
    const src = `/api/file?path=${encodeURIComponent(file.path)}`
    return (
      <div className='flex flex-col items-center gap-2'>
        {isVideo ? (
          <video
            key={file.path}
            src={src}
            controls
            autoPlay
            muted
            preload='metadata'
            className='max-w-full max-h-[55vh] rounded bg-black'
          />
        ) : (
          <img
            key={file.path}
            src={src}
            alt={file.filename}
            className='max-w-full max-h-[55vh] rounded object-contain'
          />
        )}
        <div className='text-xs text-gray-500'>
          {file.filename} • {formatTime(file.mtime)} • {formatSize(file.size)}
        </div>
      </div>
    )
  }

  const leftFile = leftIdx !== null ? (jumps[0].files[leftIdx] ?? null) : null
  const rightFile = rightIdx !== null ? (jumps[1].files[rightIdx] ?? null) : null

  return (
    <div className='fixed inset-0 z-50 flex justify-center items-start pt-10'>
      <div
        className='absolute inset-0 bg-black/40'
        onClick={onClose}
      />
      <div className='relative w-full max-w-[1400px] mx-4 bg-white dark:bg-gray-900 rounded-lg shadow-xl flex flex-col max-h-[92vh]'>
        <div className='flex items-center justify-between px-4 py-3 border-b dark:border-gray-700'>
          <div className='text-sm font-semibold'>Compare jumps</div>
          <button
            type='button'
            onClick={onClose}
            className='w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800'>
            ✕
          </button>
        </div>
        <div className='flex-1 grid grid-cols-2 gap-0 overflow-hidden min-h-0'>
          {[jumps[0], jumps[1]].map((jump, colIdx) => {
            const selectedIdx = colIdx === 0 ? leftIdx : rightIdx
            const setIdx = colIdx === 0 ? setLeftIdx : setRightIdx
            const bounds = getJumpBounds(jump)
            return (
              <div
                key={jump.id}
                className='flex flex-col border-r dark:border-gray-700 last:border-r-0 min-h-0'>
                <div className='px-3 py-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0'>
                  <div className='flex items-center gap-1'>
                    <button
                      type='button'
                      onClick={() => navigateJump(colIdx as 0 | 1, -1)}
                      className='w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 shrink-0'>
                      ‹
                    </button>
                    <div className='text-sm font-medium truncate flex-1 text-center'>
                      {jump.label}
                    </div>
                    <button
                      type='button'
                      onClick={() => navigateJump(colIdx as 0 | 1, 1)}
                      className='w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 shrink-0'>
                      ›
                    </button>
                  </div>
                  <div className='text-xs text-gray-500 text-center'>
                    {jump.files.length} files •{' '}
                    {jump.files.length > 0
                      ? `${formatSequenceDate(bounds.start)} ${formatSequenceTime(bounds.start)} – ${formatSequenceTime(bounds.end)}`
                      : ''}{' '}
                    • {getJumpDate(jump)}
                  </div>
                </div>
                <div className='max-h-[28vh] overflow-y-auto p-2 space-y-0.5 shrink-0 border-b dark:border-gray-700'>
                  {jump.files.map((file, idx) => (
                    <div
                      key={file.path}
                      onClick={() => setIdx(idx)}
                      className={`flex items-center gap-2 px-2 py-1 text-xs rounded cursor-pointer ${selectedIdx === idx ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                      <span className='font-mono truncate flex-1'>{file.filename}</span>
                      <span className='text-gray-400 tabular-nums whitespace-nowrap'>
                        {formatTime(file.mtime)}
                      </span>
                      <span className='text-gray-400 whitespace-nowrap'>
                        {formatSize(file.size)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className='flex-1 min-h-[420px] border-t dark:border-gray-700 p-2 flex items-center justify-center bg-gray-50/50 dark:bg-gray-800/30 overflow-hidden'>
                  {renderPreview(colIdx === 0 ? leftFile : rightFile)}
                </div>
              </div>
            )
          })}
        </div>
        <div className='flex items-center justify-end gap-2 px-4 py-3 border-t dark:border-gray-700'>
          <button
            type='button'
            onClick={onClose}
            className='text-sm px-3 py-1.5 rounded border'>
            Cancel
          </button>
          <button
            type='button'
            onClick={() => onMerge(jumps[0].id, jumps[1].id)}
            className='text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700'>
            Merge into {jumps[0].label}
          </button>
          <button
            type='button'
            onClick={() => onMerge(jumps[1].id, jumps[0].id)}
            className='text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700'>
            Merge into {jumps[1].label}
          </button>
        </div>
      </div>
    </div>
  )
}

const StagingTray = ({
  selectedFiles,
  copyMode,
  setCopyMode,
  onClear,
  onRemove,
  onDragStart
}: {
  selectedFiles: { groupId: string; file: ManifestFile }[]
  copyMode: boolean
  setCopyMode: (v: boolean) => void
  onClear: () => void
  onRemove: (groupId: string, filePath: string) => void
  onDragStart: (e: React.DragEvent, filePaths: string[]) => void
}) => {
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
              <button
                type='button'
                onClick={() => onRemove(groupId, file.path)}
                className='text-gray-400 hover:text-red-500'>
                ✕
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

const SelectedJumpsPanel = ({
  jumps,
  onClear,
  onCompare,
  onProcess
}: {
  jumps: ManifestJump[]
  onClear: () => void
  onCompare: () => void
  onProcess: () => void
}) => {
  const canCompare = jumps.length === 2
  const canProcess = jumps.some((j) => !j.processed)
  return (
    <div className='w-[320px] shrink-0 sticky top-6 h-fit max-h-[85vh] flex flex-col border border-amber-200 dark:border-amber-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm overflow-hidden'>
      <div className='px-3 py-2 border-b dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20 flex items-center justify-between'>
        <span className='text-sm font-semibold text-amber-800 dark:text-amber-200'>
          {jumps.length} jump{jumps.length > 1 ? 's' : ''} selected
        </span>
        <button
          type='button'
          onClick={onClear}
          className='text-xs text-amber-700 hover:underline'>
          Clear
        </button>
      </div>
      <div className='flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]'>
        {jumps.map((jump) => {
          const bounds = getJumpBounds(jump)
          return (
            <div
              key={jump.id}
              className='p-2 rounded border bg-gray-50 dark:bg-gray-800/50'>
              <div className='text-xs font-medium truncate'>{jump.label}</div>
              <div className='text-[11px] text-gray-500'>
                {jump.files.length} files • {bounds.start ? formatTime(bounds.start) : ''} •{' '}
                {getJumpDate(jump)}
              </div>
            </div>
          )
        })}
      </div>
      <div className='p-3 border-t dark:border-gray-700 flex flex-col gap-2'>
        <button
          type='button'
          disabled={!canCompare}
          onClick={onCompare}
          className='w-full text-sm px-3 py-1.5 rounded bg-amber-600 text-white disabled:opacity-30 hover:bg-amber-700'>
          Compare
        </button>
        <button
          type='button'
          disabled={!canProcess}
          onClick={onProcess}
          className='w-full text-sm px-3 py-1.5 rounded bg-green-600 text-white disabled:opacity-30 hover:bg-green-700'>
          Process selected
        </button>
      </div>
    </div>
  )
}

const JumpDaySection = ({
  day,
  selection,
  isSelectMode,
  compareIds,
  onSelect,
  onDragStart,
  onShiftDay,
  editingDay,
  setEditingDay,
  onDrop,
  onRemoveFiles,
  onPreview,
  onReorder,
  onCompareToggle
}: {
  day: JumpDayGroup
  selection: SelectionMap
  isSelectMode: boolean
  compareIds: string[]
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDragStart: (e: React.DragEvent, filePaths: string[], sourceId: string) => void
  onShiftDay: (date: string, newDateStr: string) => void
  editingDay: string | null
  setEditingDay: (d: string | null) => void
  onDrop: (e: React.DragEvent, targetJumpId: string) => void
  onRemoveFiles: (jumpId: string, filePaths: string[]) => void
  onPreview: (files: ManifestFile[], index: number, label: string) => void
  onReorder: (jumpId: string, filePaths: string[]) => void
  onCompareToggle: (jumpId: string) => void
}) => {
  const fileCount = day.jumps.reduce((s, j) => s + j.files.length, 0)
  const dayFiles = day.jumps.flatMap((j) => j.files)
  const dayTimes = dayFiles.map((f) => f.mtime)
  const dayStart = dayTimes.length ? Math.min(...dayTimes) : 0
  const dayEnd = dayTimes.length ? Math.max(...dayTimes) : 0
  return (
    <div className='border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50 overflow-hidden mb-4'>
      <div className='flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700'>
        {editingDay === day.date ? (
          <input
            type='date'
            autoFocus
            defaultValue={formatDateForInput(day.date)}
            onBlur={(e) => {
              if (e.target.value) onShiftDay(day.date, e.target.value)
              setEditingDay(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value) {
                onShiftDay(day.date, e.currentTarget.value)
                setEditingDay(null)
              }
              if (e.key === 'Escape') setEditingDay(null)
            }}
            className='text-sm font-medium px-2 py-1 border rounded bg-white dark:bg-gray-900'
          />
        ) : (
          <button
            type='button'
            onClick={() => setEditingDay(day.date)}
            className='text-sm font-semibold text-gray-700 dark:text-gray-300 hover:underline decoration-dotted'
            title='Click to change day'>
            {day.date}
          </button>
        )}
        <span className='text-xs text-gray-500'>
          {fileCount} files • {day.jumps.length} jumps
          {dayFiles.length > 0 && (
            <>
              {' '}
              • {formatSequenceTime(dayStart)}–{formatSequenceTime(dayEnd)}
            </>
          )}
        </span>
        <span className='ml-auto text-[10px] text-gray-400 hidden sm:inline'>
          drag timeline or click date to fix
        </span>
      </div>
      <div className='p-3 space-y-3'>
        {day.jumps.map((jump) => (
          <JumpCard
            key={jump.id}
            jump={jump}
            selection={selection[jump.id] ?? {}}
            isSelectMode={isSelectMode}
            isCompareSelected={compareIds.includes(jump.id)}
            onSelect={onSelect}
            onDrop={onDrop}
            onDragStart={onDragStart}
            onRemoveFiles={onRemoveFiles}
            onPreview={onPreview}
            onReorder={onReorder}
            onCompareToggle={onCompareToggle}
          />
        ))}
      </div>
    </div>
  )
}

const TimelineJumps = ({
  dayGroups,
  selectedIds,
  onSelect,
  onShiftDay
}: {
  dayGroups: JumpDayGroup[]
  selectedIds: string[]
  onSelect: (jumpId: string) => void
  onShiftDay: (date: string, offsetSeconds: number, dayPaths: string[]) => void
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [draggingJump, setDraggingJump] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [dragLabel, setDragLabel] = useState('')
  const [draggedTime, setDraggedTime] = useState<number | null>(null)
  const dragOffsetRef = useRef(0)

  const allJumps = useMemo(() => dayGroups.flatMap((d) => d.jumps), [dayGroups])

  useEffect(() => {
    setDraggingJump(null)
    setDragOffset(0)
    setDragLabel('')
    setDraggedTime(null)
    dragOffsetRef.current = 0
  }, [dayGroups])

  const DAY = 86400
  const effectiveRange = DAY
  const pos = (t: number) => {
    const d = new Date(t * 1000)
    const secs = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
    return (secs / DAY) * 100
  }
  const width = (a: number, b: number) => Math.max(2, ((b - a) / DAY) * 100)

  const hourTicks = useMemo(
    () =>
      [0, 6, 12, 18, 24].map((h) => ({
        t: h * 3600,
        label: h === 0 ? '00:00' : `${String(h).padStart(2, '0')}:00`
      })),
    []
  )

  if (allJumps.length === 0) return null

  return (
    <div className='mb-4'>
      <div className='flex items-center justify-between mb-1 px-1'>
        <span className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
          Timeline — drag a jump to shift it (00:00 → 24:00)
        </span>
        <span className='text-[10px] text-gray-400'>Shift+drag snaps to 1 day</span>
      </div>
      <div
        ref={containerRef}
        className='relative bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden select-none'
        style={{ height: `${Math.max(56, dayGroups.length * 36)}px` }}>
        {hourTicks.map((tick) => (
          <div
            key={tick.t}
            className='absolute top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700 opacity-60'
            style={{ left: `${(tick.t / DAY) * 100}%` }}
          />
        ))}
        {hourTicks.map((tick) => (
          <div
            key={`label-${tick.t}`}
            className='absolute top-0.5 text-[8px] text-gray-400 pointer-events-none select-none'
            style={{ left: `${(tick.t / DAY) * 100}%`, transform: 'translateX(-50%)' }}>
            {tick.label}
          </div>
        ))}
        {dayGroups.map((day, idx) => {
          const laneTop = (idx / dayGroups.length) * 100
          const laneH = 100 / dayGroups.length
          const dayColor =
            idx % 2 === 0 ? 'bg-blue-400 dark:bg-blue-600' : 'bg-indigo-400 dark:bg-indigo-600'
          return (
            <div
              key={day.date}
              className='absolute inset-x-0 border-b border-gray-200/60 dark:border-gray-700/60 flex items-center'
              style={{ top: `${laneTop}%`, height: `${laneH}%` }}>
              <div className='absolute left-2 text-[10px] font-medium text-gray-500 truncate max-w-[110px] pointer-events-none'>
                {day.date}
              </div>
              {day.jumps.map((jump) => {
                const bounds = getJumpBounds(jump)
                const isJumpDragging = draggingJump === jump.id
                const offset = isJumpDragging ? dragOffset : 0
                return (
                  <div
                    key={jump.id}
                    data-jump-bar='true'
                    className={`absolute h-5 rounded cursor-grab active:cursor-grabbing ${jump.processed ? 'bg-gray-400 cursor-not-allowed opacity-60' : dayColor} opacity-90 hover:opacity-100 hover:h-6 ${isJumpDragging ? 'shadow-lg ring-2 ring-blue-300 z-10' : selectedIds.includes(jump.id) ? 'ring-2 ring-amber-400' : ''}`}
                    style={{
                      top: '50%',
                      transform: 'translateY(-50%)',
                      left: `${pos(bounds.start + offset)}%`,
                      width: `${width(bounds.start, bounds.end)}%`,
                      minWidth: '32px'
                    }}
                    onMouseDown={(e) => {
                      if (jump.processed) return
                      e.preventDefault()
                      e.stopPropagation()
                      const startX = e.clientX
                      const snapDay = e.shiftKey
                      setDraggingJump(jump.id)
                      setDragOffset(0)
                      dragOffsetRef.current = 0
                      setDragLabel(jump.label)
                      setDraggedTime(bounds.start)
                      const jumpPaths = jump.files.map((f) => f.path)
                      const handleMove = (ev: MouseEvent | TouchEvent) => {
                        const clientX = (ev as TouchEvent).touches
                          ? (ev as TouchEvent).touches[0].clientX
                          : (ev as MouseEvent).clientX
                        const dx = clientX - startX
                        const w = containerRef.current?.clientWidth ?? 800
                        const dt = (dx / w) * effectiveRange
                        const snapped = snapDay
                          ? Math.round(dt / 86400) * 86400
                          : Math.round(dt / 900) * 900
                        dragOffsetRef.current = snapped
                        setDragOffset(snapped)
                      }
                      const handleUp = () => {
                        document.removeEventListener('mousemove', handleMove as any)
                        document.removeEventListener('mouseup', handleUp)
                        document.removeEventListener('touchmove', handleMove as any)
                        document.removeEventListener('touchend', handleUp)
                        const off = dragOffsetRef.current
                        if (Math.abs(off) >= 60) {
                          onShiftDay(jump.id, off, jumpPaths)
                        } else {
                          onSelect(jump.id)
                          setDraggingJump(null)
                          setDragOffset(0)
                          setDragLabel('')
                          setDraggedTime(null)
                          dragOffsetRef.current = 0
                        }
                      }
                      document.addEventListener('mousemove', handleMove as any)
                      document.addEventListener('mouseup', handleUp)
                      document.addEventListener('touchmove', handleMove as any, { passive: false })
                      document.addEventListener('touchend', handleUp)
                    }}
                    onTouchStart={(e) => {
                      if (jump.processed) return
                      const touch = e.touches[0]
                      const startX = touch.clientX
                      setDraggingJump(jump.id)
                      setDragOffset(0)
                      dragOffsetRef.current = 0
                      setDragLabel(jump.label)
                      setDraggedTime(bounds.start)
                      const jumpPaths = jump.files.map((f) => f.path)
                      const handleMove = (ev: TouchEvent) => {
                        const dx = ev.touches[0].clientX - startX
                        const w = containerRef.current?.clientWidth ?? 800
                        const dt = (dx / w) * effectiveRange
                        const snapped = Math.round(dt / 900) * 900
                        dragOffsetRef.current = snapped
                        setDragOffset(snapped)
                        ev.preventDefault()
                      }
                      const handleUp = () => {
                        document.removeEventListener('touchmove', handleMove as any)
                        document.removeEventListener('touchend', handleUp)
                        const off = dragOffsetRef.current
                        if (Math.abs(off) >= 60) onShiftDay(jump.id, off, jumpPaths)
                        else onSelect(jump.id)
                        setDraggingJump(null)
                        setDragOffset(0)
                        setDragLabel('')
                        setDraggedTime(null)
                        dragOffsetRef.current = 0
                      }
                      document.addEventListener('touchmove', handleMove as any, { passive: false })
                      document.addEventListener('touchend', handleUp)
                    }}
                    title={`${jump.label} — click to select, drag to shift jump${jump.processed ? ' (processed, undo first)' : ', Shift for 1-day snap'}`}
                  />
                )
              })}
            </div>
          )
        })}
        {draggingJump && Math.abs(dragOffset) >= 60 && draggedTime !== null && (
          <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-mono bg-gray-800 text-white px-2 py-1 rounded shadow pointer-events-none'>
            {dragLabel} {formatSequenceDate(draggedTime + dragOffset)}{' '}
            {formatSequenceTime(draggedTime + dragOffset)}
          </div>
        )}
      </div>
    </div>
  )
}

const Review = ({ loaderData }: Route.ComponentProps) => {
  const { manifest } = loaderData
  const manifestFetcher = useFetcher()
  const scanFetcher = useFetcher()
  const { revalidate } = useRevalidator()
  const [selection, setSelection] = useState<SelectionMap>({})
  const [lastClicked, setLastClicked] = useState<string | null>(null)
  const [editingDay, setEditingDay] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [copyMode, setCopyMode] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)
  const dragDataRef = useRef<{ filePaths: string[]; sourceJumpId: string } | null>(null)
  const trayDragRef = useRef<{
    filePaths: string[]
    sourceGroups: Record<string, string[]>
  } | null>(null)

  useEffect(() => {
    if (manifestFetcher.data || scanFetcher.data) revalidate()
  }, [manifestFetcher.data, scanFetcher.data, revalidate])

  const scanning = scanFetcher.state !== 'idle'

  const jumpsByDay = useMemo(() => (manifest ? groupJumpsByDay(manifest.jumps) : []), [manifest])

  const filesInJumps = useMemo(() => {
    if (!manifest) return new Set<string>()
    return new Set(manifest.jumps.flatMap((j) => j.files.map((f) => f.path)))
  }, [manifest])

  const unassignedFiles = useMemo(() => {
    if (!manifest) return []
    return manifest.files.filter((f) => !filesInJumps.has(f.path))
  }, [manifest, filesInJumps])

  const allFileIds = useMemo(() => {
    if (!manifest) return []
    return [
      ...unassignedFiles.map((f) => f.path),
      ...manifest.jumps.flatMap((j) => j.files.map((f) => f.path))
    ]
  }, [manifest, unassignedFiles])

  const hasCalibration = useMemo(
    () => manifest?.files.some((f) => f.originalMtime !== undefined) ?? false,
    [manifest]
  )

  const handleSelect = useCallback(
    (groupId: string, filePath: string, _ctrlKey: boolean, shiftKey: boolean) => {
      setSelection((prev) => {
        const next: SelectionMap = {}
        for (const [k, v] of Object.entries(prev)) next[k] = { ...v }
        if (!next[groupId]) next[groupId] = {}
        else next[groupId] = { ...next[groupId] }
        if (shiftKey && lastClicked) {
          const sIdx = allFileIds.indexOf(lastClicked)
          const eIdx = allFileIds.indexOf(filePath)
          if (sIdx !== -1 && eIdx !== -1) {
            const [from, to] = sIdx < eIdx ? [sIdx, eIdx] : [eIdx, sIdx]
            for (let i = from; i <= to; i++) {
              const id = allFileIds[i]
              for (const jid of Object.keys(next)) {
                if (next[jid][id]) {
                  next[jid] = { ...next[jid] }
                  delete next[jid][id]
                }
              }
              if (!next[groupId]) next[groupId] = {}
              else if (!next[groupId][id]) next[groupId] = { ...next[groupId] }
              next[groupId][id] = true
            }
          }
        } else if (next[groupId][filePath]) {
          const g = { ...next[groupId] }
          delete g[filePath]
          next[groupId] = g
          if (Object.keys(g).length === 0) delete next[groupId]
        } else {
          next[groupId] = { ...next[groupId], [filePath]: true }
        }
        setLastClicked(filePath)
        return next
      })
    },
    [lastClicked, allFileIds]
  )

  const selectedFiles = useMemo(() => {
    const res: { groupId: string; file: ManifestFile }[] = []
    if (!manifest) return res
    for (const jump of manifest.jumps)
      for (const f of jump.files)
        if (selection[jump.id]?.[f.path]) res.push({ groupId: jump.id, file: f })
    for (const f of unassignedFiles)
      if (selection['unassigned']?.[f.path]) res.push({ groupId: 'unassigned', file: f })
    return res
  }, [manifest, selection, unassignedFiles])

  const selectedCount = selectedFiles.length
  const isSelectMode = selectedCount > 0

  const handleDragStart = useCallback(
    (e: React.DragEvent, filePaths: string[], sourceJumpId: string) => {
      dragDataRef.current = { filePaths, sourceJumpId }
      e.dataTransfer.effectAllowed = 'move'
    },
    []
  )

  const handleReorder = useCallback(
    (jumpId: string, filePaths: string[]) => {
      manifestFetcher.submit(
        { action: 'reorder-files', jumpId, filePaths },
        { method: 'POST', encType: 'application/json', action: '/api/manifest' }
      )
    },
    [manifestFetcher]
  )

  const handleTrayDragStart = useCallback(
    (e: React.DragEvent, filePaths: string[]) => {
      const byGroup: Record<string, string[]> = {}
      for (const { groupId, file } of selectedFiles) {
        if (!filePaths.includes(file.path)) continue
        if (!byGroup[groupId]) byGroup[groupId] = []
        byGroup[groupId].push(file.path)
      }
      trayDragRef.current = { filePaths, sourceGroups: byGroup }
      e.dataTransfer.effectAllowed = copyMode ? 'copy' : 'move'
      e.dataTransfer.setData('text/x-staging-tray', 'true')
    },
    [copyMode, selectedFiles]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent, targetJumpId: string) => {
      e.preventDefault()
      const trayData = trayDragRef.current
      if (trayData) {
        const { filePaths, sourceGroups } = trayData
        try {
          if (copyMode) {
            manifestFetcher.submit(
              { action: 'copy-files', toJumpId: targetJumpId, filePaths },
              { method: 'POST', encType: 'application/json', action: '/api/manifest' }
            )
          } else {
            for (const [sourceId, paths] of Object.entries(sourceGroups)) {
              if (sourceId === targetJumpId) continue
              const src = manifest?.jumps.find((j) => j.id === sourceId)
              if (src) {
                manifestFetcher.submit(
                  {
                    action: 'move-files',
                    fromJumpId: sourceId,
                    toJumpId: targetJumpId,
                    filePaths: paths
                  },
                  { method: 'POST', encType: 'application/json', action: '/api/manifest' }
                )
              } else {
                manifestFetcher.submit(
                  { action: 'add-to-jump', jumpId: targetJumpId, filePaths: paths },
                  { method: 'POST', encType: 'application/json', action: '/api/manifest' }
                )
              }
            }
            setSelection({})
          }
        } finally {
          trayDragRef.current = null
        }
        return
      }
      const data = dragDataRef.current
      if (!data) return
      try {
        const sourceJumpId = data.sourceJumpId
        if (sourceJumpId === targetJumpId) return
        const sourceJump = manifest?.jumps.find((j) => j.id === sourceJumpId)
        if (sourceJump) {
          manifestFetcher.submit(
            {
              action: 'move-files',
              fromJumpId: sourceJumpId,
              toJumpId: targetJumpId,
              filePaths: data.filePaths
            },
            { method: 'POST', encType: 'application/json', action: '/api/manifest' }
          )
        } else {
          manifestFetcher.submit(
            { action: 'add-to-jump', jumpId: targetJumpId, filePaths: data.filePaths },
            { method: 'POST', encType: 'application/json', action: '/api/manifest' }
          )
        }
      } finally {
        dragDataRef.current = null
      }
    },
    [manifestFetcher, manifest, copyMode]
  )

  const handleRemoveFiles = useCallback(
    (jumpId: string, filePaths: string[]) => {
      manifestFetcher.submit(
        { action: 'remove-files', jumpId, filePaths },
        { method: 'POST', encType: 'application/json', action: '/api/manifest' }
      )
    },
    [manifestFetcher]
  )

  const handleMerge = useCallback(
    (targetId: string, sourceId: string) => {
      manifestFetcher.submit(
        { action: 'merge-jumps', sourceJumpIds: [targetId, sourceId], targetJumpId: targetId },
        { method: 'POST', encType: 'application/json', action: '/api/manifest' }
      )
    },
    [manifestFetcher]
  )

  const handleCompareToggle = useCallback((jumpId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(jumpId)) return prev.filter((id) => id !== jumpId)
      return [...prev, jumpId]
    })
  }, [])

  const compareJumps = useMemo(() => {
    if (compareIds.length !== 2 || !manifest) return null
    const a = manifest.jumps.find((j) => j.id === compareIds[0])
    const b = manifest.jumps.find((j) => j.id === compareIds[1])
    if (!a || !b) return null
    return [a, b] as [ManifestJump, ManifestJump]
  }, [compareIds, manifest])

  const handleShiftDay = useCallback(
    (date: string, newDateStr: string) => {
      const group = jumpsByDay.find((g) => g.date === date)
      if (!group) return
      const parts = newDateStr.split('-')
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10) - 1
      const d = parseInt(parts[2], 10)
      const newNoon = Math.floor(new Date(y, m, d, 12, 0, 0).getTime() / 1000)
      const oldStart = Math.min(...group.jumps.flatMap((j) => j.files.map((f) => f.mtime)))
      const oldNoon = Math.floor(new Date(oldStart * 1000).setHours(12, 0, 0, 0) / 1000)
      const offset = newNoon - oldNoon
      if (offset === 0) return
      const paths = group.jumps.flatMap((j) => j.files.map((f) => f.path))
      manifestFetcher.submit(
        { action: 'shift-sequences', paths, offsetSeconds: offset },
        { method: 'POST', encType: 'application/json', action: '/api/manifest' }
      )
    },
    [jumpsByDay, manifestFetcher]
  )

  const handleShiftOffset = useCallback(
    (dateOrId: string, offsetSeconds: number, paths: string[]) => {
      manifestFetcher.submit(
        { action: 'shift-sequences', paths, offsetSeconds },
        { method: 'POST', encType: 'application/json', action: '/api/manifest' }
      )
    },
    [manifestFetcher]
  )

  const handleSelectAll = () => {
    if (!manifest) return
    const ids = manifest.jumps.filter((j) => !j.processed).map((j) => j.id)
    setCompareIds(ids)
  }
  const handleCreateJump = () => {
    manifestFetcher.submit(
      { action: 'create-jump' },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }
  const handleResetCalibration = () => {
    manifestFetcher.submit(
      { action: 'reset-calibration' },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }

  const handlePreview = useCallback((files: ManifestFile[], index: number, label: string) => {
    setPreview({ files, index, label })
  }, [])
  const handlePreviewClose = useCallback(() => setPreview(null), [])
  const handlePreviewPrev = useCallback(() => {
    setPreview((p) => (p ? { ...p, index: (p.index - 1 + p.files.length) % p.files.length } : null))
  }, [])
  const handlePreviewNext = useCallback(() => {
    setPreview((p) => (p ? { ...p, index: (p.index + 1) % p.files.length } : null))
  }, [])

  const renderEmptyState = (title: string, description: string) => (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900'>
      <div className='max-w-7xl mx-auto px-6 py-8'>
        <div className='flex items-center justify-between mb-8'>
          <div>
            <h1 className='text-3xl font-bold'>{title}</h1>
            <p className='text-gray-500 mt-1'>{description}</p>
          </div>
          <div className='flex items-center gap-3'>
            <scanFetcher.Form
              method='post'
              action='/api/scan'>
              <button
                type='submit'
                disabled={scanning}
                className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg'>
                {scanning ? 'Scanning...' : 'Scan'}
              </button>
            </scanFetcher.Form>
            <Link
              to='/'
              className='text-gray-500'>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )

  if (!manifest)
    return renderEmptyState('No Manifest Found', 'Run a scan first to generate proposed jumps.')
  if (manifest.status === 'empty')
    return renderEmptyState('No Files to Review', 'No new camera files were found.')

  const processedCount = manifest.jumps.filter((j) => j.processed).length
  const totalFiles = manifest.jumps.reduce((s, j) => s + j.files.length, 0)

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900'>
      <div className='max-w-7xl mx-auto px-6 py-6'>
        <div className='flex items-center justify-between mb-6'>
          <div>
            <h1 className='text-3xl font-bold'>Review Proposed Jumps</h1>
            <p className='text-gray-500 mt-1'>
              {manifest.date} — {manifest.jumps.length} jumps, {totalFiles} files
              {processedCount > 0 && (
                <span className='ml-2 text-blue-600'>• {processedCount} processed</span>
              )}
              {hasCalibration && <span className='ml-2 text-amber-600'>• dates shifted</span>}
            </p>
          </div>
          <div className='flex items-center gap-3'>
            <scanFetcher.Form
              method='post'
              action='/api/scan'>
              <button
                type='submit'
                disabled={scanning}
                className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg'>
                {scanning ? 'Scanning...' : 'Scan'}
              </button>
            </scanFetcher.Form>
            <Link
              to='/'
              className='text-gray-500'>
              Back to Dashboard
            </Link>
          </div>
        </div>

        <div className='flex items-center gap-3 mb-4'>
          <button
            type='button'
            onClick={handleSelectAll}
            className='px-4 py-2 text-sm font-medium bg-white border rounded-lg'>
            Select All
          </button>
          <button
            type='button'
            onClick={handleCreateJump}
            className='px-4 py-2 text-sm bg-white border rounded-lg'>
            + Add Jump
          </button>
          {hasCalibration && (
            <button
              type='button'
              onClick={handleResetCalibration}
              className='px-4 py-2 text-sm text-amber-700 border border-amber-300 rounded-lg bg-amber-50'>
              Reset dates
            </button>
          )}
        </div>

        <div className={`${selectedCount > 0 || compareIds.length > 0 ? 'flex gap-6' : ''}`}>
          {selectedCount > 0 && (
            <StagingTray
              selectedFiles={selectedFiles}
              copyMode={copyMode}
              setCopyMode={setCopyMode}
              onClear={() => setSelection({})}
              onRemove={(gid, fp) => handleSelect(gid, fp, true, false)}
              onDragStart={handleTrayDragStart}
            />
          )}
          <div className='flex-1 min-w-0'>
            <TimelineJumps
              dayGroups={jumpsByDay}
              selectedIds={compareIds}
              onSelect={handleCompareToggle}
              onShiftDay={handleShiftOffset}
            />

            {unassignedFiles.length > 0 && (
              <div className='mb-4 border border-amber-200 rounded-lg bg-amber-50 dark:bg-amber-900/10 p-3'>
                <div className='flex items-center gap-2 mb-2'>
                  <span className='text-sm font-semibold text-amber-800 dark:text-amber-200'>
                    Unassigned files • {unassignedFiles.length}
                  </span>
                  <span className='text-xs text-amber-600 dark:text-amber-400'>
                    not in any jump — select to stage
                  </span>
                </div>
                <div className='space-y-0.5'>
                  {unassignedFiles.map((file, idx) => (
                    <FileRow
                      key={file.path}
                      file={file}
                      groupId='unassigned'
                      selected={!!selection['unassigned']?.[file.path]}
                      isSelectMode={isSelectMode}
                      onSelect={handleSelect}
                      onDragStart={() => {}}
                      onPreview={() => handlePreview(unassignedFiles, idx, 'Unassigned')}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className='space-y-4'>
              {jumpsByDay.map((day) => (
                <JumpDaySection
                  key={day.date}
                  day={day}
                  selection={selection}
                  isSelectMode={isSelectMode}
                  compareIds={compareIds}
                  onSelect={handleSelect}
                  onDragStart={handleDragStart}
                  onShiftDay={handleShiftDay}
                  editingDay={editingDay}
                  setEditingDay={setEditingDay}
                  onDrop={handleDrop}
                  onRemoveFiles={handleRemoveFiles}
                  onPreview={handlePreview}
                  onReorder={handleReorder}
                  onCompareToggle={handleCompareToggle}
                />
              ))}
              {jumpsByDay.length === 0 && (
                <p className='text-sm text-gray-400 italic'>No jumps — create one or fix dates</p>
              )}
            </div>
          </div>
          {compareIds.length > 0 && (
            <SelectedJumpsPanel
              jumps={compareIds
                .map((id) => manifest!.jumps.find((j) => j.id === id)!)
                .filter(Boolean)}
              onClear={() => setCompareIds([])}
              onCompare={() => setShowCompare(true)}
              onProcess={() => {
                const ids = compareIds.filter((id) => {
                  const j = manifest!.jumps.find((x) => x.id === id)
                  return j && !j.processed
                })
                if (ids.length) {
                  manifestFetcher.submit(
                    { action: 'execute-jumps', jumpIds: ids },
                    { method: 'POST', encType: 'application/json', action: '/api/manifest' }
                  )
                }
              }}
            />
          )}
        </div>
        {preview && (
          <PreviewDrawer
            preview={preview}
            onClose={handlePreviewClose}
            onPrev={handlePreviewPrev}
            onNext={handlePreviewNext}
          />
        )}
        {showCompare && compareJumps && (
          <CompareDrawer
            jumps={compareJumps}
            allJumps={manifest.jumps}
            compareIds={compareIds}
            onCompareIdsChange={setCompareIds}
            onClose={() => setShowCompare(false)}
            onMerge={(targetId, sourceId) => {
              handleMerge(targetId, sourceId)
              setShowCompare(false)
              setCompareIds([])
            }}
          />
        )}
      </div>
    </div>
  )
}

export default Review
export { loader }
