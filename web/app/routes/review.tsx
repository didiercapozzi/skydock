import * as fs from 'node:fs'
import * as path from 'node:path'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useFetcher, useRevalidator } from 'react-router'
import { getOutputDirPath } from '../lib/scanner.server'
import { ensureManifestFileIds } from '../lib/fileId.server'
import {
  formatDateForInput,
  formatDayHeader,
  formatSequenceDate,
  formatSequenceTime
} from '../lib/sequences'
import { manifestSchema } from '../lib/types'
import type { Manifest, ManifestFile, ManifestJump } from '../lib/types'
import type { Route } from './+types/review'

const loader = async () => {
  const manifestPath = path.join(getOutputDirPath(), 'manifest.json')
  await ensureManifestFileIds(manifestPath)
  let manifest: Manifest | null = null
  try {
    if (fs.existsSync(manifestPath)) {
      manifest = manifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')))
    }
  } catch {
    manifest = null
  }
  return { manifest }
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatTime = (epoch: number) =>
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

const getJumpDate = (jump: ManifestJump) => {
  if (jump.files.length === 0) return ''
  const min = Math.min(...jump.files.map((f) => f.mtime))
  return formatSequenceDate(min)
}

const getJumpBounds = (jump: ManifestJump) => {
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

const isVideoFile = (filename: string) => /\.(mp4|mov|avi|mkv)$/i.test(filename)

const MediaPreview = ({
  file,
  maxHeight = '60vh',
  videoRef,
  onDurationLoaded
}: {
  file: ManifestFile
  maxHeight?: string
  videoRef?: React.RefObject<HTMLVideoElement | null>
  onDurationLoaded?: (duration: number) => void
}) => {
  const src = `/api/file?path=${encodeURIComponent(file.path)}`
  return isVideoFile(file.filename) ? (
    <video
      key={file.path}
      ref={videoRef}
      src={src}
      controls
      autoPlay
      muted
      preload='metadata'
      className='max-w-full rounded bg-black'
      style={{ maxHeight }}
      onLoadedMetadata={(e) => {
        onDurationLoaded?.(e.currentTarget.duration)
      }}
    />
  ) : (
    <img
      key={file.path}
      src={src}
      alt={file.filename}
      className='max-w-full rounded object-contain'
      style={{ maxHeight }}
    />
  )
}

const VideoCropper = ({
  videoRef,
  duration,
  filePath,
  initialCropStart,
  initialCropEnd,
  onApplied
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  duration: number
  filePath: string
  initialCropStart?: number
  initialCropEnd?: number
  onApplied?: () => void
}) => {
  const [currentTime, setCurrentTime] = useState(0)
  const [cropStart, setCropStart] = useState(initialCropStart ?? 0)
  const [cropEnd, setCropEnd] = useState(initialCropEnd ?? duration)
  const [dragging, setDragging] = useState<'start' | 'end' | 'playhead' | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [viewOffset, setViewOffset] = useState(0.5)
  const timelineRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const cropFetcher = useFetcher()
  const { revalidate } = useRevalidator()

  useEffect(() => {
    setCropEnd(initialCropEnd ?? duration)
  }, [duration, initialCropEnd])

  useEffect(() => {
    if (cropFetcher.state === 'idle' && cropFetcher.data) {
      revalidate()
      onApplied?.()
    }
  }, [cropFetcher.state, cropFetcher.data, revalidate, onApplied])

  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    const tick = () => {
      setCurrentTime(vid.currentTime)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [videoRef])

  const visibleDuration = duration / zoomLevel
  const viewStart = Math.max(
    0,
    Math.min(duration - visibleDuration, viewOffset * duration - visibleDuration / 2)
  )
  const viewEnd = Math.min(duration, viewStart + visibleDuration)

  const seekTo = (time: number) => {
    const vid = videoRef.current
    if (!vid) return
    const clamped = Math.max(0, Math.min(time, duration))
    vid.currentTime = clamped
    setCurrentTime(clamped)
  }

  const timeFromX = (clientX: number) => {
    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return viewStart + ratio * (viewEnd - viewStart)
  }

  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const hoverTime = viewStart + ratio * (viewEnd - viewStart)
      const zoomFactor = e.deltaY < 0 ? 1.2 : 1 / 1.2
      const newZoom = Math.max(1, Math.min(50, zoomLevel * zoomFactor))
      const newVisibleDuration = duration / newZoom
      const newViewStart = Math.max(
        0,
        Math.min(duration - newVisibleDuration, hoverTime - ratio * newVisibleDuration)
      )
      const newViewOffset = (newViewStart + newVisibleDuration / 2) / duration
      setZoomLevel(newZoom)
      setViewOffset(newViewOffset)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [duration, zoomLevel, viewStart, viewEnd])

  const formatTimeCode = (t: number) => {
    const h = Math.floor(t / 3600)
    const m = Math.floor((t % 3600) / 60)
    const s = Math.floor(t % 60)
    const f = Math.floor((t % 1) * 30)
    if (h > 0)
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`
  }

  const handlePointerDown = (
    e: React.PointerEvent,
    target: 'start' | 'end' | 'playhead' | 'timeline'
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const vid = videoRef.current
    if (vid && !vid.paused) vid.pause()
    const time = timeFromX(e.clientX)
    if (target === 'timeline') {
      seekTo(time)
      setDragging('playhead')
    } else {
      setDragging(target)
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const time = timeFromX(e.clientX)
    if (dragging === 'start') {
      const clamped = Math.min(time, cropEnd - 0.1)
      setCropStart(Math.max(0, clamped))
    } else if (dragging === 'end') {
      const clamped = Math.max(time, cropStart + 0.1)
      setCropEnd(Math.min(duration, clamped))
    } else if (dragging === 'playhead') {
      seekTo(time)
    }
  }

  const handlePointerUp = () => {
    setDragging(null)
  }

  const toPct = (time: number) => {
    if (viewEnd === viewStart) return 0
    return ((time - viewStart) / (viewEnd - viewStart)) * 100
  }

  const startPct = toPct(cropStart)
  const endPct = toPct(cropEnd)
  const playheadPct = toPct(currentTime)

  const clipStart = Math.max(0, startPct)
  const clipEnd = Math.min(100, endPct)

  return (
    <div className='w-full px-1 select-none'>
      <div className='flex items-center justify-between text-[10px] text-gray-400 mb-1 px-0.5'>
        <span>{formatTimeCode(cropStart)}</span>
        <div className='flex items-center gap-2'>
          <span className='text-gray-500'>Crop: {formatTimeCode(cropEnd - cropStart)}</span>
          {zoomLevel > 1 && (
            <button
              type='button'
              onClick={() => {
                setZoomLevel(1)
                setViewOffset(0.5)
              }}
              className='text-[9px] px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'>
              Reset zoom
            </button>
          )}
        </div>
        <span>{formatTimeCode(cropEnd)}</span>
      </div>
      <div
        ref={timelineRef}
        className='relative h-8 bg-gray-200 dark:bg-gray-700 rounded cursor-pointer group'
        onPointerDown={(e) => handlePointerDown(e, 'timeline')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}>
        <div
          className='absolute top-0 bottom-0 bg-gray-300 dark:bg-gray-600'
          style={{ left: 0, width: `${Math.max(0, clipStart)}%` }}
        />
        <div
          className='absolute top-0 bottom-0 bg-blue-200/40 dark:bg-blue-800/30'
          style={{ left: `${clipStart}%`, width: `${Math.max(0, clipEnd - clipStart)}%` }}
        />
        <div
          className='absolute top-0 bottom-0 bg-gray-300 dark:bg-gray-600'
          style={{ left: `${Math.min(100, clipEnd)}%`, right: 0 }}
        />
        <div
          className='absolute top-0 bottom-0 w-0.5 bg-white shadow-sm z-10'
          style={{ left: `${playheadPct}%` }}
        />
        <div
          className='absolute top-1/2 -translate-y-1/2 w-3 h-5 bg-white border border-gray-400 rounded-sm cursor-ew-resize z-20 shadow-sm hover:bg-gray-100'
          style={{ left: `${startPct}%`, transform: 'translate(-50%, -50%)' }}
          onPointerDown={(e) => handlePointerDown(e, 'start')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
        <div
          className='absolute top-1/2 -translate-y-1/2 w-3 h-5 bg-white border border-gray-400 rounded-sm cursor-ew-resize z-20 shadow-sm hover:bg-gray-100'
          style={{ left: `${endPct}%`, transform: 'translate(-50%, -50%)' }}
          onPointerDown={(e) => handlePointerDown(e, 'end')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>
      <div className='flex items-center justify-center gap-2 mt-2'>
        <button
          type='button'
          onClick={() => {
            const vid = videoRef.current
            if (vid && !vid.paused) vid.pause()
            setCropStart(currentTime)
          }}
          className='text-[10px] px-1.5 py-0.5 rounded border text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'>
          Start here
        </button>
        <button
          type='button'
          onClick={() => {
            const vid = videoRef.current
            if (vid && !vid.paused) vid.pause()
            setCropEnd(currentTime)
          }}
          className='text-[10px] px-1.5 py-0.5 rounded border text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'>
          End here
        </button>
        <button
          type='button'
          onClick={() => {
            cropFetcher.submit(
              { action: 'set-crop', filePath, cropStart, cropEnd },
              { method: 'POST', encType: 'application/json', action: '/api/manifest' }
            )
          }}
          disabled={cropFetcher.state !== 'idle'}
          className='text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'>
          Apply
        </button>
      </div>
    </div>
  )
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
  const src = `/api/file?path=${encodeURIComponent(file.path)}`
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [videoDuration, setVideoDuration] = useState(0)
  const isVideo = isVideoFile(file.filename)

  useEffect(() => {
    setVideoDuration(0)
  }, [file.path])

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
              file={file}
              videoRef={isVideo ? videoRef : undefined}
              onDurationLoaded={isVideo ? setVideoDuration : undefined}
            />
          </div>
          {isVideo && videoDuration > 0 && (
            <VideoCropper
              videoRef={videoRef}
              duration={videoDuration}
              filePath={file.path}
              initialCropStart={file.cropStart}
              initialCropEnd={file.cropEnd}
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
}: {
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
}) => {
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
      {((file.cropStart !== undefined && file.cropStart > 0) || file.cropEnd !== undefined) && (
        <span
          className='shrink-0 w-1.5 h-1.5 rounded-full bg-orange-400'
          title='Cropped'
        />
      )}
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

const JumpCard = ({
  jump,
  selection,
  isSelectMode,
  isCompareSelected,
  multiJumpFiles,
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
}: {
  jump: ManifestJump
  selection: Record<string, boolean>
  isSelectMode: boolean
  isCompareSelected?: boolean
  multiJumpFiles: Set<string>
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
}) => {
  const [expanded, setExpanded] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState(jump.label)
  const [editingDateTime, setEditingDateTime] = useState(false)
  const [dateValue, setDateValue] = useState('')
  const [timeValue, setTimeValue] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [hoveredFile, setHoveredFile] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)
  const [groupedByType, setGroupedByType] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'videos' | 'photos'>('all')
  const dragDataRef = useRef<{ filePaths: string[]; sourceJumpId: string } | null>(null)
  const selectedCount = jump.files.filter((f) => selection[f.path]).length
  const isProcessed = !!jump.processed
  const bounds = getJumpBounds(jump)

  const filteredFiles = useMemo(() => {
    let files = jump.files
    if (typeFilter === 'videos') files = files.filter((f) => isVideoFile(f.filename))
    else if (typeFilter === 'photos') files = files.filter((f) => !isVideoFile(f.filename))
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      files = files.filter((f) => f.filename.toLowerCase().includes(q))
    }
    return files
  }, [jump.files, typeFilter, searchQuery])

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
          <div className='ml-auto flex items-center gap-2'>
            <span className='text-xs text-gray-400'>{jump.files.length} files</span>
            {jump.files.length > 0 && (
              <button
                type='button'
                onClick={(e) => {
                  e.stopPropagation()
                  setGroupedByType(!groupedByType)
                }}
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  groupedByType
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                } hover:opacity-80`}
                title={groupedByType ? 'Show all files together' : 'Group by videos/photos'}>
                {groupedByType ? 'Grouped' : 'Group'}
              </button>
            )}
            {jump.files.length > 0 && (
              <button
                type='button'
                onClick={(e) => {
                  e.stopPropagation()
                  setViewMode(viewMode === 'list' ? 'grid' : 'list')
                }}
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  viewMode === 'grid'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                } hover:opacity-80`}
                title={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}>
                {viewMode === 'grid' ? 'Grid' : 'List'}
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
            ) : (
              <>
                <div className='flex items-center gap-2 mb-2'>
                  <div className='relative flex-1'>
                    <input
                      type='text'
                      placeholder='Search filename...'
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className='w-full text-xs px-2 py-1 pr-6 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 placeholder:text-gray-400'
                    />
                    {searchQuery && (
                      <button
                        type='button'
                        onClick={(e) => {
                          e.stopPropagation()
                          setSearchQuery('')
                        }}
                        className='absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 px-1'>
                        ×
                      </button>
                    )}
                  </div>
                  <div className='flex gap-1 shrink-0'>
                    {(['all', 'videos', 'photos'] as const).map((t) => (
                      <button
                        key={t}
                        type='button'
                        onClick={(e) => {
                          e.stopPropagation()
                          setTypeFilter(t)
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                          typeFilter === t
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        } hover:opacity-80`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredFiles.length === 0 ? (
                  <p className='text-xs text-gray-400 italic py-2 text-center'>
                    No matching files
                    {searchQuery || typeFilter !== 'all' ? ` • ${jump.files.length} total` : ''}
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
                              const sel = jump.files
                                .filter((f) => selection[f.path])
                                .map((f) => f.path)
                              const toDrag =
                                sel.length > 0 && selection[file.path] ? sel : [file.path]
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
                              <video
                                src={`/api/file?path=${encodeURIComponent(file.path)}`}
                                className='w-full h-full object-cover'
                                preload='metadata'
                                muted
                              />
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
                            {(file.cropStart !== undefined && file.cropStart > 0) ||
                            file.cropEnd !== undefined ? (
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
                ) : groupedByType ? (
                  <div className='max-h-80 overflow-y-auto space-y-3 pr-1'>
                    {(() => {
                      const videos = filteredFiles.filter((f) => isVideoFile(f.filename))
                      const photos = filteredFiles.filter((f) => !isVideoFile(f.filename))
                      const globalIdx = (file: ManifestFile) => jump.files.indexOf(file)
                      return (
                        <>
                          {videos.length > 0 && (
                            <div>
                              <div className='text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1'>
                                Videos ({videos.length})
                              </div>
                              <div className='space-y-0.5'>
                                {videos.map((file) => (
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
                                      const sel = jump.files
                                        .filter((f) => selection[f.path])
                                        .map((f) => f.path)
                                      const toDrag = sel.length > 0 && selection[fp] ? sel : [fp]
                                      dragDataRef.current = {
                                        filePaths: toDrag,
                                        sourceJumpId: jump.id
                                      }
                                      onDragStart(e, toDrag, jump.id)
                                    }}
                                    onRowDragOver={isProcessed ? undefined : handleRowDragOver}
                                    onRowDragLeave={handleRowDragLeave}
                                    onPreview={() =>
                                      onPreview(jump.files, globalIdx(file), jump.label)
                                    }
                                    onDelete={
                                      !isProcessed
                                        ? () => onDeleteFile?.(jump.id, file.path)
                                        : undefined
                                    }
                                    onRename={
                                      !isProcessed
                                        ? (newName) => onRenameFile?.(file.path, newName)
                                        : undefined
                                    }
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          {photos.length > 0 && (
                            <div>
                              <div className='text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1'>
                                Photos ({photos.length})
                              </div>
                              <div className='space-y-0.5'>
                                {photos.map((file) => (
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
                                      const sel = jump.files
                                        .filter((f) => selection[f.path])
                                        .map((f) => f.path)
                                      const toDrag = sel.length > 0 && selection[fp] ? sel : [fp]
                                      dragDataRef.current = {
                                        filePaths: toDrag,
                                        sourceJumpId: jump.id
                                      }
                                      onDragStart(e, toDrag, jump.id)
                                    }}
                                    onRowDragOver={isProcessed ? undefined : handleRowDragOver}
                                    onRowDragLeave={handleRowDragLeave}
                                    onPreview={() =>
                                      onPreview(jump.files, globalIdx(file), jump.label)
                                    }
                                    onDelete={
                                      !isProcessed
                                        ? () => onDeleteFile?.(jump.id, file.path)
                                        : undefined
                                    }
                                    onRename={
                                      !isProcessed
                                        ? (newName) => onRenameFile?.(file.path, newName)
                                        : undefined
                                    }
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
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
                            const sel = jump.files
                              .filter((f) => selection[f.path])
                              .map((f) => f.path)
                            const toDrag = sel.length > 0 && selection[fp] ? sel : [fp]
                            dragDataRef.current = { filePaths: toDrag, sourceJumpId: jump.id }
                            onDragStart(e, toDrag, jump.id)
                          }}
                          onRowDragOver={isProcessed ? undefined : handleRowDragOver}
                          onRowDragLeave={handleRowDragLeave}
                          onPreview={() => onPreview(jump.files, idx, jump.label)}
                          onDelete={
                            !isProcessed ? () => onDeleteFile?.(jump.id, file.path) : undefined
                          }
                          onRename={
                            !isProcessed
                              ? (newName) => onRenameFile?.(file.path, newName)
                              : undefined
                          }
                        />
                      )
                    })}
                  </div>
                )}
              </>
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
                  {colIdx === 0 ? (
                    leftFile ? (
                      <MediaPreview
                        file={leftFile}
                        maxHeight='55vh'
                      />
                    ) : (
                      <div className='text-xs text-gray-400'>Select a file</div>
                    )
                  ) : rightFile ? (
                    <MediaPreview
                      file={rightFile}
                      maxHeight='55vh'
                    />
                  ) : (
                    <div className='text-xs text-gray-400'>Select a file</div>
                  )}
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

const SelectedJumpsPanel = ({
  jumps,
  onClear,
  onCompare,
  onProcess,
  onChangeDay
}: {
  jumps: ManifestJump[]
  onClear: () => void
  onCompare: () => void
  onProcess: () => void
  onChangeDay: (newDate: string) => void
}) => {
  const [editingDay, setEditingDay] = useState(false)
  const [dayValue, setDayValue] = useState('')

  const canCompare = jumps.length === 2
  const canProcess = jumps.some((j) => !j.processed)

  const handleDaySave = () => {
    if (dayValue) onChangeDay(dayValue)
    setEditingDay(false)
  }

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
        {editingDay ? (
          <div className='flex items-center gap-2'>
            <input
              type='date'
              value={dayValue}
              onChange={(e) => setDayValue(e.target.value)}
              autoFocus
              className='flex-1 text-xs border rounded px-2 py-1'
            />
            <button
              type='button'
              onClick={handleDaySave}
              className='text-xs px-2 py-1 rounded bg-amber-600 text-white'>
              Apply
            </button>
            <button
              type='button'
              onClick={() => setEditingDay(false)}
              className='text-xs px-2 py-1 rounded border'>
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
        ) : (
          <button
            type='button'
            onClick={() => {
              const firstJump = jumps[0]
              if (firstJump) {
                const bounds = getJumpBounds(firstJump)
                if (bounds.start > 0) {
                  const d = new Date(bounds.start * 1000)
                  setDayValue(
                    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                  )
                }
              }
              setEditingDay(true)
            }}
            className='w-full text-xs px-3 py-1.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50'>
            Edit day for selected jumps
          </button>
        )}
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
  multiJumpFiles,
  onSelect,
  onDragStart,
  onDrop,
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
}: {
  day: JumpDayGroup
  selection: SelectionMap
  isSelectMode: boolean
  compareIds: string[]
  multiJumpFiles: Set<string>
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDragStart: (e: React.DragEvent, filePaths: string[], sourceId: string) => void
  onDrop: (e: React.DragEvent, targetJumpId: string) => void
  onRemoveFiles: (jumpId: string, filePaths: string[]) => void
  onPreview: (files: ManifestFile[], index: number, label: string) => void
  onReorder: (jumpId: string, filePaths: string[]) => void
  onCompareToggle: (jumpId: string) => void
  onDelete: (jumpId: string) => void
  onLabelSave: (jumpId: string, label: string) => void
  onUnprocess: (jumpId: string) => void
  onDeleteFile: (jumpId: string, filePath: string) => void
  onRenameFile: (filePath: string, newFilename: string) => void
  onShiftJump: (jumpId: string, offsetSeconds: number, paths: string[]) => void
}) => {
  const fileCount = day.jumps.reduce((s, j) => s + j.files.length, 0)
  const dayFiles = day.jumps.flatMap((j) => j.files)
  const dayTimes = dayFiles.map((f) => f.mtime)
  const dayStart = dayTimes.length ? Math.min(...dayTimes) : 0
  const dayEnd = dayTimes.length ? Math.max(...dayTimes) : 0
  return (
    <div className='border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50 overflow-hidden mb-4'>
      <div className='flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700'>
        <span className='text-sm font-semibold text-gray-700 dark:text-gray-300'>
          {dayStart > 0 ? formatDayHeader(dayStart) : day.date}
        </span>
        <span className='text-xs text-gray-500'>
          {fileCount} files • {day.jumps.length} jumps
          {dayFiles.length > 0 && (
            <>
              {' '}
              • {formatSequenceTime(dayStart)}–{formatSequenceTime(dayEnd)}
            </>
          )}
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
            multiJumpFiles={multiJumpFiles}
            onSelect={onSelect}
            onDrop={onDrop}
            onDragStart={onDragStart}
            onRemoveFiles={onRemoveFiles}
            onPreview={onPreview}
            onReorder={onReorder}
            onCompareToggle={onCompareToggle}
            onDelete={onDelete}
            onLabelSave={onLabelSave}
            onUnprocess={onUnprocess}
            onDeleteFile={onDeleteFile}
            onRenameFile={onRenameFile}
            onShiftJump={onShiftJump}
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

  const resetDragState = () => {
    setDraggingJump(null)
    setDragOffset(0)
    setDragLabel('')
    setDraggedTime(null)
    dragOffsetRef.current = 0
  }

  useEffect(() => {
    resetDragState()
  }, [dayGroups])

  const DAY = 86400
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

  const setupDrag = (
    startX: number,
    snapDay: boolean,
    jump: ManifestJump,
    bounds: { start: number; end: number }
  ) => {
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
      const dt = (dx / w) * DAY
      const snapped = snapDay ? Math.round(dt / 86400) * 86400 : Math.round(dt / 900) * 900
      dragOffsetRef.current = snapped
      setDragOffset(snapped)
      if (ev.cancelable) ev.preventDefault()
    }

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove as EventListener)
      document.removeEventListener('mouseup', handleUp)
      document.removeEventListener('touchmove', handleMove as EventListener)
      document.removeEventListener('touchend', handleUp)
      const off = dragOffsetRef.current
      if (Math.abs(off) >= 60) {
        onShiftDay(jump.id, off, jumpPaths)
      } else {
        onSelect(jump.id)
      }
      resetDragState()
    }

    document.addEventListener('mousemove', handleMove as EventListener)
    document.addEventListener('mouseup', handleUp)
    document.addEventListener('touchmove', handleMove as EventListener, { passive: false })
    document.addEventListener('touchend', handleUp)
  }

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
                      setupDrag(e.clientX, e.shiftKey, jump, bounds)
                    }}
                    onTouchStart={(e) => {
                      if (jump.processed) return
                      setupDrag(e.touches[0].clientX, false, jump, bounds)
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

  const manifestSubmit = useCallback(
    (body: Record<string, string | number | boolean | string[]>) => {
      manifestFetcher.submit(body, {
        method: 'POST',
        encType: 'application/json',
        action: '/api/manifest'
      })
    },
    [manifestFetcher]
  )

  const jumpsByDay = useMemo(() => (manifest ? groupJumpsByDay(manifest.jumps) : []), [manifest])

  const filesInJumps = useMemo(() => {
    if (!manifest) return new Set<string>()
    return new Set(manifest.jumps.flatMap((j) => j.files.map((f) => f.path)))
  }, [manifest])

  const unassignedFiles = useMemo(() => {
    if (!manifest) return []
    return manifest.files.filter((f) => !filesInJumps.has(f.path))
  }, [manifest, filesInJumps])

  const multiJumpFiles = useMemo(() => {
    if (!manifest) return new Set<string>()
    const pathCounts = new Map<string, number>()
    for (const jump of manifest.jumps) {
      for (const f of jump.files) {
        pathCounts.set(f.path, (pathCounts.get(f.path) ?? 0) + 1)
      }
    }
    return new Set([...pathCounts.entries()].filter(([, c]) => c > 1).map(([p]) => p))
  }, [manifest])

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
      manifestSubmit({ action: 'reorder-files', jumpId, filePaths })
    },
    [manifestSubmit]
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
            manifestSubmit({ action: 'copy-files', toJumpId: targetJumpId, filePaths })
          } else {
            for (const [sourceId, paths] of Object.entries(sourceGroups)) {
              if (sourceId === targetJumpId) continue
              const src = manifest?.jumps.find((j) => j.id === sourceId)
              if (src) {
                manifestSubmit({
                  action: 'move-files',
                  fromJumpId: sourceId,
                  toJumpId: targetJumpId,
                  filePaths: paths
                })
              } else {
                manifestSubmit({ action: 'copy-files', toJumpId: targetJumpId, filePaths: paths })
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
          manifestSubmit({
            action: 'move-files',
            fromJumpId: sourceJumpId,
            toJumpId: targetJumpId,
            filePaths: data.filePaths
          })
        } else {
          manifestSubmit({
            action: 'copy-files',
            toJumpId: targetJumpId,
            filePaths: data.filePaths
          })
        }
      } finally {
        dragDataRef.current = null
      }
    },
    [manifestSubmit, manifest, copyMode]
  )

  const handleRemoveFiles = useCallback(
    (jumpId: string, filePaths: string[]) => {
      manifestSubmit({ action: 'remove-files', jumpId, filePaths })
    },
    [manifestSubmit]
  )

  const handleMerge = useCallback(
    (targetId: string, sourceId: string) => {
      manifestSubmit({
        action: 'merge-jumps',
        sourceJumpIds: [targetId, sourceId],
        targetJumpId: targetId
      })
    },
    [manifestSubmit]
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

  const handleShiftOffset = useCallback(
    (_dateOrId: string, offsetSeconds: number, paths: string[]) => {
      manifestSubmit({ action: 'shift-sequences', paths, offsetSeconds })
    },
    [manifestSubmit]
  )

  const handleShiftJump = useCallback(
    (jumpId: string, offsetSeconds: number, paths: string[]) => {
      manifestSubmit({ action: 'shift-sequences', paths, offsetSeconds })
    },
    [manifestSubmit]
  )

  const handleSelectAll = () => {
    if (!manifest) return
    const ids = manifest.jumps.filter((j) => !j.processed).map((j) => j.id)
    setCompareIds(ids)
  }

  const handleCreateJump = () => {
    manifestSubmit({ action: 'create-jump' })
  }

  const handleResetCalibration = () => {
    manifestSubmit({ action: 'reset-calibration' })
  }

  const handleDeleteJump = useCallback(
    (jumpId: string) => {
      manifestSubmit({ action: 'delete-jump', jumpId })
    },
    [manifestSubmit]
  )

  const handleLabelSave = useCallback(
    (jumpId: string, label: string) => {
      manifestSubmit({ action: 'update-label', jumpId, label })
    },
    [manifestSubmit]
  )

  const handleUnprocess = useCallback(
    (jumpId: string) => {
      manifestSubmit({ action: 'unprocess-jump', jumpId })
    },
    [manifestSubmit]
  )

  const handleDeleteFile = useCallback(
    (jumpId: string, filePath: string) => {
      manifestSubmit({ action: 'remove-files', jumpId, filePaths: [filePath] })
    },
    [manifestSubmit]
  )

  const handleRenameFile = useCallback(
    (filePath: string, newFilename: string) => {
      manifestSubmit({ action: 'rename-file', filePath, newFilename })
    },
    [manifestSubmit]
  )

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

  const renderEmptyState = (title: string, description: string) => {
    const scanError = scanFetcher.data && !scanFetcher.data.ok ? scanFetcher.data.error : null
    return (
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
          {scanError && (
            <div className='mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700'>
              {scanError}
            </div>
          )}
        </div>
      </div>
    )
  }

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
                      isInMultipleJumps={multiJumpFiles.has(file.path)}
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
                  multiJumpFiles={multiJumpFiles}
                  onSelect={handleSelect}
                  onDragStart={handleDragStart}
                  onDrop={handleDrop}
                  onRemoveFiles={handleRemoveFiles}
                  onPreview={handlePreview}
                  onReorder={handleReorder}
                  onCompareToggle={handleCompareToggle}
                  onDelete={handleDeleteJump}
                  onLabelSave={handleLabelSave}
                  onUnprocess={handleUnprocess}
                  onDeleteFile={handleDeleteFile}
                  onRenameFile={handleRenameFile}
                  onShiftJump={handleShiftJump}
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
                  manifestSubmit({ action: 'execute-jumps', jumpIds: ids })
                }
              }}
              onChangeDay={(newDate) => {
                for (const jumpId of compareIds) {
                  const jump = manifest!.jumps.find((j) => j.id === jumpId)
                  if (!jump || jump.files.length === 0) continue
                  const bounds = getJumpBounds(jump)
                  const parts = newDate.split('-')
                  const y = parseInt(parts[0], 10)
                  const m = parseInt(parts[1], 10) - 1
                  const d = parseInt(parts[2], 10)
                  const newNoon = Math.floor(new Date(y, m, d, 12, 0, 0).getTime() / 1000)
                  const oldStart = bounds.start
                  const oldNoon = Math.floor(new Date(oldStart * 1000).setHours(12, 0, 0, 0) / 1000)
                  const offset = newNoon - oldNoon
                  if (offset !== 0) {
                    const paths = jump.files.map((f) => f.path)
                    manifestSubmit({ action: 'shift-sequences', paths, offsetSeconds: offset })
                  }
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
