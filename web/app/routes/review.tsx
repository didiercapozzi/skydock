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
  const manifestPath = path.join(getOutputDirPath(), 'proposed_jumps.json')
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
  onSelect,
  onDragStart,
  onPreview
}: {
  file: ManifestFile
  groupId: string
  selected: boolean
  isSelectMode?: boolean
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDragStart: (e: React.DragEvent, filePath: string, groupId: string) => void
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

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded cursor-pointer select-none transition-colors ${
        selected
          ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-300 dark:ring-blue-700'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
      draggable
      onDragStart={handleDragStart}
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
  onSelect,
  onDrop,
  onDragStart,
  onRemoveFiles,
  onPreview
}: {
  jump: ManifestJump
  selection: Record<string, boolean>
  isSelectMode: boolean
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDrop: (e: React.DragEvent, targetJumpId: string) => void
  onDragStart: (e: React.DragEvent, filePaths: string[], sourceJumpId: string) => void
  onRemoveFiles: (jumpId: string, filePaths: string[]) => void
  onPreview: (files: ManifestFile[], index: number, label: string) => void
}) => {
  const [expanded, setExpanded] = useState(true)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState(jump.label)
  const [isDragOver, setIsDragOver] = useState(false)
  const fetcher = useFetcher()
  const selectedCount = jump.files.filter((f) => selection[f.path]).length
  const isProcessed = !!jump.processed
  const bounds = getJumpBounds(jump)

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
  const handleConfirm = (confirmed: boolean) => {
    fetcher.submit(
      { action: 'confirm-jump', jumpId: jump.id, confirmed },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }
  const handleProcess = () => {
    fetcher.submit(
      { action: 'execute-jumps', jumpIds: [jump.id] },
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
      className={`border rounded-lg overflow-hidden transition-colors ${isProcessed ? 'border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-900/20' : isDragOver ? 'border-blue-400 bg-blue-50/50' : jump.confirmed ? 'border-green-300 bg-green-50/50 dark:border-green-700 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'}`}
      onDragOver={(e) => {
        if (isProcessed) return
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        if (isProcessed) return
        setIsDragOver(false)
        onDrop(e, jump.id)
      }}>
      <div className='flex items-center gap-2 px-4 py-2'>
        <input
          type='checkbox'
          checked={jump.confirmed}
          onChange={(e) => handleConfirm(e.target.checked)}
          disabled={isProcessed}
          className='h-4 w-4 rounded border-gray-300 text-green-600 disabled:opacity-50'
        />
        <button
          type='button'
          onClick={() => setExpanded(!expanded)}
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
            className='font-semibold text-sm bg-white border rounded px-1 py-0.5 w-full'
          />
        ) : (
          <span
            className={`font-semibold text-sm flex-1 ${isProcessed ? '' : 'cursor-text hover:underline'}`}
            onClick={() => {
              if (!isProcessed) setEditingLabel(true)
            }}>
            {jump.label}
          </span>
        )}
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
                onClick={() => {
                  const fps = jump.files.filter((f) => selection[f.path]).map((f) => f.path)
                  if (fps.length) onRemoveFiles(jump.id, fps)
                }}
                className='text-xs text-red-500'>
                Remove
              </button>
            </>
          )
        )}
        {isProcessed ? (
          <button
            type='button'
            onClick={handleUnprocess}
            className='text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'>
            Undo
          </button>
        ) : jump.confirmed && jump.files.length > 0 ? (
          <button
            type='button'
            onClick={handleProcess}
            className='text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700'>
            Process
          </button>
        ) : null}
        <button
          type='button'
          onClick={handleDelete}
          className='text-gray-400 hover:text-red-500 px-1'
          title={isProcessed ? 'Delete and remove processed folder' : 'Remove jump'}>
          ✕
        </button>
      </div>
      {expanded && (
        <div className='border-t dark:border-gray-700 px-4 py-2 space-y-0.5 bg-gray-50/30 dark:bg-gray-800/30'>
          {jump.files.map((file, idx) => (
            <FileRow
              key={file.path}
              file={file}
              groupId={jump.id}
              selected={!!selection[file.path]}
              isSelectMode={isSelectMode}
              onSelect={onSelect}
              onDragStart={(e, fp) => {
                if (isProcessed) return
                const sel = jump.files.filter((f) => selection[f.path]).map((f) => f.path)
                const toDrag = sel.length > 0 && selection[file.path] ? sel : [fp]
                onDragStart(e, toDrag, jump.id)
              }}
              onPreview={() => onPreview(jump.files, idx, jump.label)}
            />
          ))}
          {jump.files.length === 0 && (
            <p className='text-sm text-gray-400 italic py-2'>Drop files here</p>
          )}
        </div>
      )}
    </div>
  )
}

const JumpDaySection = ({
  day,
  selection,
  isSelectMode,
  onSelect,
  onDragStart,
  onShiftDay,
  editingDay,
  setEditingDay,
  onDrop,
  onRemoveFiles,
  onPreview
}: {
  day: JumpDayGroup
  selection: SelectionMap
  isSelectMode: boolean
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDragStart: (e: React.DragEvent, filePaths: string[], sourceId: string) => void
  onShiftDay: (date: string, newDateStr: string) => void
  editingDay: string | null
  setEditingDay: (d: string | null) => void
  onDrop: (e: React.DragEvent, targetJumpId: string) => void
  onRemoveFiles: (jumpId: string, filePaths: string[]) => void
  onPreview: (files: ManifestFile[], index: number, label: string) => void
}) => {
  const fileCount = day.jumps.reduce((s, j) => s + j.files.length, 0)
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
            onSelect={onSelect}
            onDrop={onDrop}
            onDragStart={onDragStart}
            onRemoveFiles={onRemoveFiles}
            onPreview={onPreview}
          />
        ))}
      </div>
    </div>
  )
}

const TimelineJumps = ({
  dayGroups,
  onShiftDay
}: {
  dayGroups: JumpDayGroup[]
  onShiftDay: (date: string, offsetSeconds: number, dayPaths: string[]) => void
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [draggingJump, setDraggingJump] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [dragLabel, setDragLabel] = useState('')
  const [draggedTime, setDraggedTime] = useState<number | null>(null)
  const dragOffsetRef = useRef(0)

  const allJumps = useMemo(() => dayGroups.flatMap((d) => d.jumps), [dayGroups])

  const timeRange = useMemo(() => {
    const bounds = allJumps.map(getJumpBounds).filter((b) => b.start !== 0)
    if (bounds.length === 0) return { min: 0, max: 86400 }
    const minStart = Math.min(...bounds.map((b) => b.start))
    const maxEnd = Math.max(...bounds.map((b) => b.end))
    const minD = new Date(minStart * 1000)
    minD.setHours(0, 0, 0, 0)
    const maxD = new Date(maxEnd * 1000)
    maxD.setHours(0, 0, 0, 0)
    maxD.setDate(maxD.getDate() + 1)
    const min = Math.floor(minD.getTime() / 1000)
    const max = Math.floor(maxD.getTime() / 1000)
    return { min, max }
  }, [allJumps])

  const range = timeRange.max - timeRange.min || 1
  const isHugeRange = range > 7 * 86400
  const effectiveRange = isHugeRange ? 86400 : range
  const pos = (t: number) => {
    if (!isHugeRange) return ((t - timeRange.min) / range) * 100
    const d = new Date(t * 1000)
    const secs = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
    return (secs / 86400) * 100
  }
  const width = (a: number, b: number) => {
    if (!isHugeRange) return Math.max(2, ((b - a) / range) * 100)
    return Math.max(2, ((b - a) / 86400) * 100)
  }

  const hourTicks = useMemo(() => {
    if (isHugeRange) {
      return [0, 6, 12, 18, 24].map((h) => ({
        t: h * 3600,
        label: h === 0 ? '00:00' : `${String(h).padStart(2, '0')}:00`
      }))
    }
    const ticks: { t: number; label: string }[] = []
    const start = new Date(timeRange.min * 1000)
    start.setMinutes(0, 0, 0)
    start.setHours(Math.ceil(start.getHours() / 6) * 6)
    let count = 0
    for (
      let d = new Date(start);
      d.getTime() / 1000 < timeRange.max && count < 200;
      d.setHours(d.getHours() + 6)
    ) {
      const epoch = Math.floor(d.getTime() / 1000)
      const h = d.getHours()
      const label =
        h === 0
          ? d.toLocaleDateString([], { month: 'short', day: 'numeric' })
          : `${String(h).padStart(2, '0')}:00`
      ticks.push({ t: epoch, label })
      count++
    }
    return ticks
  }, [timeRange, isHugeRange])

  const outlierDates = useMemo(() => {
    if (!isHugeRange) return []
    const sorted = [...dayGroups].sort((a, b) => {
      const ta = Math.min(...a.jumps.flatMap((j) => j.files.map((f) => f.mtime)))
      const tb = Math.min(...b.jumps.flatMap((j) => j.files.map((f) => f.mtime)))
      return ta - tb
    })
    if (sorted.length < 2) return []
    const lastStart = Math.min(
      ...sorted[sorted.length - 1].jumps.flatMap((j) => j.files.map((f) => f.mtime))
    )
    return sorted
      .filter((g) => {
        const t = Math.min(...g.jumps.flatMap((j) => j.files.map((f) => f.mtime)))
        return lastStart - t > 30 * 86400
      })
      .map((g) => g.date)
  }, [dayGroups, isHugeRange])

  if (allJumps.length === 0) return null

  return (
    <div className='mb-4'>
      <div className='flex items-center justify-between mb-1 px-1'>
        <span className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
          Timeline — drag a jump to shift it
        </span>
        <span className='text-[10px] text-gray-400'>
          {isHugeRange ? 'Outlier dates — time-of-day view' : 'Shift+drag snaps to 1 day'}
        </span>
      </div>
      {isHugeRange && outlierDates.length > 0 && (
        <div className='mb-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800'>
          Detected wrong dates ({outlierDates.join(', ')}) — likely camera clock not set. Timeline
          shows time-of-day only. Click the date to correct.
        </div>
      )}
      <div
        ref={containerRef}
        className='relative bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden select-none'
        style={{ height: `${Math.max(56, dayGroups.length * 36)}px` }}>
        {hourTicks.map((tick) => (
          <div
            key={tick.t}
            className='absolute top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700 opacity-60'
            style={{ left: `${pos(tick.t)}%` }}
          />
        ))}
        {hourTicks.map((tick) => (
          <div
            key={`label-${tick.t}`}
            className='absolute top-0.5 text-[8px] text-gray-400 pointer-events-none select-none'
            style={{ left: `${pos(tick.t)}%`, transform: 'translateX(-50%)' }}>
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
                    className={`absolute h-4 rounded cursor-grab active:cursor-grabbing ${jump.processed ? 'bg-gray-400' : dayColor} opacity-80 hover:opacity-100 ${isJumpDragging ? 'shadow-lg ring-2 ring-blue-300 z-10' : ''}`}
                    style={{
                      top: '50%',
                      transform: 'translateY(-50%)',
                      left: `${pos(bounds.start + offset)}%`,
                      width: `${width(bounds.start, bounds.end)}%`
                    }}
                    onMouseDown={(e) => {
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
                      const handleMove = (ev: MouseEvent) => {
                        const dx = ev.clientX - startX
                        const w = containerRef.current?.clientWidth ?? 1
                        const dt = (dx / w) * effectiveRange
                        const snapped = snapDay
                          ? Math.round(dt / 86400) * 86400
                          : Math.round(dt / 900) * 900
                        dragOffsetRef.current = snapped
                        setDragOffset(snapped)
                      }
                      const handleUp = () => {
                        document.removeEventListener('mousemove', handleMove)
                        document.removeEventListener('mouseup', handleUp)
                        const off = dragOffsetRef.current
                        setDraggingJump(null)
                        setDragOffset(0)
                        setDragLabel('')
                        setDraggedTime(null)
                        dragOffsetRef.current = 0
                        if (Math.abs(off) >= 60) onShiftDay(jump.id, off, jumpPaths)
                      }
                      document.addEventListener('mousemove', handleMove)
                      document.addEventListener('mouseup', handleUp)
                    }}
                    title={`${jump.label} — drag to shift jump, Shift for 1-day snap`}
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
  const dragDataRef = useRef<{ filePaths: string[]; sourceJumpId: string } | null>(null)

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

  const handleDragStart = useCallback(
    (e: React.DragEvent, filePaths: string[], sourceJumpId: string) => {
      dragDataRef.current = { filePaths, sourceJumpId }
      e.dataTransfer.effectAllowed = 'move'
    },
    []
  )

  const handleDrop = useCallback(
    (e: React.DragEvent, targetJumpId: string) => {
      e.preventDefault()
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
    [manifestFetcher, manifest]
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

  const selectedFiles = useMemo(() => {
    const res: { groupId: string; file: ManifestFile }[] = []
    if (!manifest) return res
    for (const jump of manifest.jumps)
      for (const f of jump.files)
        if (selection[jump.id]?.[f.path]) res.push({ groupId: jump.id, file: f })
    return res
  }, [manifest, selection])

  const selectedCount = selectedFiles.length
  const isSelectMode = selectedCount > 0

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

  const handleConfirmAll = () => {
    manifestFetcher.submit(
      { action: 'confirm-all', confirmed: true },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }
  const handleCreateJump = () => {
    manifestFetcher.submit(
      { action: 'create-jump' },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }
  const handleConfirmAndExecute = () => {
    const ids = manifest?.jumps.filter((j) => j.confirmed && !j.processed).map((j) => j.id) ?? []
    manifestFetcher.submit(
      { action: 'execute-jumps', jumpIds: ids },
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

  const confirmedCount = manifest.jumps.filter((j) => j.confirmed && !j.processed).length
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
            onClick={handleConfirmAll}
            className='px-4 py-2 text-sm font-medium bg-white border rounded-lg'>
            Confirm All
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
          <button
            type='button'
            onClick={handleConfirmAndExecute}
            disabled={confirmedCount === 0}
            className={`ml-auto px-6 py-2 text-sm font-medium text-white rounded-lg ${confirmedCount > 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-300 cursor-not-allowed'}`}>
            {processedCount === manifest.jumps.length && manifest.jumps.length > 0
              ? 'All processed'
              : confirmedCount > 0
                ? `Process ${confirmedCount} confirmed`
                : `Confirm & Execute (${confirmedCount}/${manifest.jumps.length})`}
          </button>
        </div>

        {selectedCount > 0 && (
          <div className='flex items-center gap-2 mb-3'>
            <span className='text-sm text-gray-600'>{selectedCount} selected</span>
            <button
              type='button'
              onClick={() => setSelection({})}
              className='text-sm text-blue-600 hover:underline'>
              Clear selection
            </button>
          </div>
        )}

        <TimelineJumps
          dayGroups={jumpsByDay}
          onShiftDay={handleShiftOffset}
        />

        {unassignedFiles.length > 0 && (
          <div className='mb-4 border border-amber-200 rounded-lg bg-amber-50 dark:bg-amber-900/10 p-3'>
            <div className='flex items-center gap-2 mb-2'>
              <span className='text-sm font-semibold text-amber-800 dark:text-amber-200'>
                Unassigned files • {unassignedFiles.length}
              </span>
              <span className='text-xs text-amber-600 dark:text-amber-400'>
                not in any jump — drag to a jump or preview
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
                  onDragStart={(e, fp) => {
                    const sel = unassignedFiles
                      .filter((f) => selection['unassigned']?.[f.path])
                      .map((f) => f.path)
                    const toDrag = sel.length > 0 && selection['unassigned']?.[fp] ? sel : [fp]
                    handleDragStart(e, toDrag, 'unassigned')
                  }}
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
              onSelect={handleSelect}
              onDragStart={handleDragStart}
              onShiftDay={handleShiftDay}
              editingDay={editingDay}
              setEditingDay={setEditingDay}
              onDrop={handleDrop}
              onRemoveFiles={handleRemoveFiles}
              onPreview={handlePreview}
            />
          ))}
          {jumpsByDay.length === 0 && (
            <p className='text-sm text-gray-400 italic'>No jumps — create one or fix dates</p>
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
      </div>
    </div>
  )
}

export default Review
export { loader }
