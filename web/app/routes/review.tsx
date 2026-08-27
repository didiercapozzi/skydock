import * as fs from 'node:fs'
import * as path from 'node:path'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useFetcher, useRevalidator } from 'react-router'
import { getOutputDirPath } from '../lib/scanner.server'
import { ensureManifestFileIds } from '../lib/fileId.server'
import {
  getSequences,
  getCameraIds,
  formatSequenceTime,
  formatSequenceDate,
  formatDateForInput,
  formatClockOffset
} from '../lib/sequences'
import type { Sequence } from '../lib/sequences'
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

const formatTime = (epoch: number): string => {
  return new Date(epoch * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

type SelectionMap = Record<string, Record<string, boolean>>

const FILE_COLORS = [
  'text-blue-600 dark:text-blue-400',
  'text-purple-600 dark:text-purple-400',
  'text-green-600 dark:text-green-400',
  'text-orange-600 dark:text-orange-400',
  'text-pink-600 dark:text-pink-400',
  'text-cyan-600 dark:text-cyan-400',
  'text-amber-600 dark:text-amber-400',
  'text-red-600 dark:text-red-400'
]

const getFileColorClass = (cameraId: string): string => {
  let hash = 0
  for (let i = 0; i < cameraId.length; i++) {
    hash = (hash * 31 + cameraId.charCodeAt(i)) >>> 0
  }
  return FILE_COLORS[hash % FILE_COLORS.length]
}

type CalibrationSeq = {
  label: string
  camera: string
  files: ManifestFile[]
}

type TimelineBar = {
  id: string
  camera: string
  startTime: number
  endTime: number
  label: string
}

const CAMERA_COLORS: Record<string, { bg: string; bgDark: string; ring: string; solid: string }> = {
  blue: {
    bg: 'bg-blue-300',
    bgDark: 'dark:bg-blue-700',
    ring: 'ring-blue-400',
    solid: 'bg-blue-400 dark:bg-blue-500'
  },
  purple: {
    bg: 'bg-purple-300',
    bgDark: 'dark:bg-purple-700',
    ring: 'ring-purple-400',
    solid: 'bg-purple-400 dark:bg-purple-500'
  },
  green: {
    bg: 'bg-green-300',
    bgDark: 'dark:bg-green-700',
    ring: 'ring-green-400',
    solid: 'bg-green-400 dark:bg-green-500'
  },
  orange: {
    bg: 'bg-orange-300',
    bgDark: 'dark:bg-orange-700',
    ring: 'ring-orange-400',
    solid: 'bg-orange-400 dark:bg-orange-500'
  },
  pink: {
    bg: 'bg-pink-300',
    bgDark: 'dark:bg-pink-700',
    ring: 'ring-pink-400',
    solid: 'bg-pink-400 dark:bg-pink-500'
  },
  cyan: {
    bg: 'bg-cyan-300',
    bgDark: 'dark:bg-cyan-700',
    ring: 'ring-cyan-400',
    solid: 'bg-cyan-400 dark:bg-cyan-500'
  },
  amber: {
    bg: 'bg-amber-300',
    bgDark: 'dark:bg-amber-700',
    ring: 'ring-amber-400',
    solid: 'bg-amber-400 dark:bg-amber-500'
  },
  red: {
    bg: 'bg-red-300',
    bgDark: 'dark:bg-red-700',
    ring: 'ring-red-400',
    solid: 'bg-red-400 dark:bg-red-500'
  }
}

const TimelineStrip = ({
  cameraSequences,
  cameraIds,
  cameraColorMap,
  cameraDisplayNames,
  onShift
}: {
  cameraSequences: Map<string, Sequence[]>
  cameraIds: string[]
  cameraColorMap: Map<string, string>
  cameraDisplayNames: Map<string, string>
  onShift: (paths: string[], offsetSeconds: number) => void
}) => {
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [hoverTarget, setHoverTarget] = useState<string | null>(null)
  const [scopePicker, setScopePicker] = useState<{
    percent: number
    seq: Sequence
    cameraId: string
    offsetSeconds: number
    dropTarget?: Sequence
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragOffsetRef = useRef(0)

  const idxMaps = useMemo(() => {
    const maps = new Map<string, Map<string, number>>()
    for (const camId of cameraIds) {
      const m = new Map<string, number>()
      const seqs = cameraSequences.get(camId) ?? []
      seqs.forEach((seq, i) => m.set(seq.id, i + 1))
      maps.set(camId, m)
    }
    return maps
  }, [cameraIds, cameraSequences])

  const allSeqs = useMemo(() => {
    const bars: TimelineBar[] = []
    for (const camId of cameraIds) {
      const seqs = cameraSequences.get(camId) ?? []
      for (const seq of seqs) {
        bars.push({
          id: seq.id,
          camera: camId,
          startTime: seq.startTime,
          endTime: seq.endTime,
          label: `Seq ${idxMaps.get(camId)?.get(seq.id)}`
        })
      }
    }
    return bars
  }, [cameraIds, cameraSequences, idxMaps])

  const timeRange = useMemo(() => {
    if (allSeqs.length === 0) return { min: 0, max: 1 }
    const min = Math.min(...allSeqs.map((s) => s.startTime))
    const max = Math.max(...allSeqs.map((s) => s.endTime))
    const padding = Math.max(300, (max - min) * 0.05)
    return { min: min - padding, max: max + padding }
  }, [allSeqs])

  const range = timeRange.max - timeRange.min || 1

  const posToPercent = (t: number): number => ((t - timeRange.min) / range) * 100

  const barWidth = (start: number, end: number): number => {
    const raw = ((end - start) / range) * 100
    return Math.max(3, raw)
  }

  const snapToGrid = (timestamp: number): number => {
    const gridSize = 1800
    return Math.round(timestamp / gridSize) * gridSize
  }

  const findDropTarget = (draggedCameraId: string, newStartTime: number): Sequence | null => {
    const draggedSeqs = cameraSequences.get(draggedCameraId) ?? []
    const draggedSeq = draggedSeqs.find((s) => s.id === dragging)
    const draggedDuration = draggedSeq ? draggedSeq.endTime - draggedSeq.startTime : 0
    const draggedCenter = newStartTime + draggedDuration / 2

    let best: Sequence | null = null
    let bestDist = Infinity
    for (const camId of cameraIds) {
      if (camId === draggedCameraId) continue
      const seqs = cameraSequences.get(camId) ?? []
      for (const t of seqs) {
        const tCenter = t.startTime + (t.endTime - t.startTime) / 2
        const dist = Math.abs(draggedCenter - tCenter)
        if (dist < bestDist) {
          bestDist = dist
          best = t
        }
      }
    }
    if (best && bestDist < range * 0.15) return best
    return null
  }

  const handleMouseDown = (e: React.MouseEvent, seqId: string, cameraId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const seqs = cameraSequences.get(cameraId) ?? []
    const seq = seqs.find((s) => s.id === seqId)
    if (!seq) return
    setDragging(seqId)
    setDragOffset(0)
    dragOffsetRef.current = 0
    setScopePicker(null)

    const startX = e.clientX
    const startStartTime = seq.startTime

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX
      const dt = (dx / (containerRef.current?.clientWidth ?? 1)) * range
      dragOffsetRef.current = dt

      const newStart = startStartTime + dt
      const target = findDropTarget(cameraId, newStart)
      setHoverTarget(target?.id ?? null)

      const displayStart = target ? target.startTime : snapToGrid(newStart)
      setDragOffset(displayStart - startStartTime)
    }

    const handleMouseUp = () => {
      setDragging(null)
      setHoverTarget(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)

      const finalOffset = dragOffsetRef.current
      const newStartTime = startStartTime + finalOffset

      const dropTarget = findDropTarget(cameraId, newStartTime)

      if (dropTarget) {
        const draggedSeqs = cameraSequences.get(cameraId) ?? []
        const draggedSeq = draggedSeqs.find((s) => s.id === seqId)
        const duration = draggedSeq ? draggedSeq.endTime - draggedSeq.startTime : 0
        const dropCenter = dropTarget.startTime + (dropTarget.endTime - dropTarget.startTime) / 2
        const alignOffset = dropCenter - (startStartTime + duration / 2)

        setScopePicker({
          percent: posToPercent(dropTarget.startTime),
          seq,
          cameraId,
          offsetSeconds: Math.round(alignOffset),
          dropTarget
        })
      } else if (Math.abs(finalOffset) >= 1) {
        const snappedStart = snapToGrid(newStartTime)
        const snappedOffset = snappedStart - startStartTime

        setScopePicker({
          percent: posToPercent(snappedStart),
          seq,
          cameraId,
          offsetSeconds: Math.round(snappedOffset)
        })
      }

      setDragOffset(0)
      dragOffsetRef.current = 0
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const applyShift = (scope: 'single' | 'after' | 'all') => {
    if (!scopePicker) return
    const { seq, cameraId, offsetSeconds } = scopePicker

    let targetSeqs: Sequence[]
    if (scope === 'single') {
      targetSeqs = [seq]
    } else if (scope === 'after') {
      targetSeqs = (cameraSequences.get(cameraId) ?? []).filter((s) => s.startTime >= seq.startTime)
    } else {
      targetSeqs = cameraSequences.get(cameraId) ?? []
    }

    const paths = targetSeqs.flatMap((s) => s.files.map((f) => f.path))
    onShift(paths, offsetSeconds)
    setScopePicker(null)
  }

  const getColor = (camId: string) => {
    const colorKey = cameraColorMap.get(camId) ?? 'blue'
    return CAMERA_COLORS[colorKey] ?? CAMERA_COLORS.blue
  }

  if (allSeqs.length === 0) return null

  const laneHeight = 100 / cameraIds.length

  return (
    <div className='mb-4 relative'>
      <div
        ref={containerRef}
        className='relative bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden'
        style={{ height: `${Math.max(48, cameraIds.length * 24)}px` }}>
        {cameraIds.map((camId, i) => (
          <div
            key={camId}
            className='absolute inset-x-0 border-b border-gray-200 dark:border-gray-700 flex items-center'
            style={{
              top: `${i * laneHeight}%`,
              height: `${laneHeight}%`
            }}>
            <div className='absolute left-2 text-[10px] text-gray-500 font-medium truncate max-w-24'>
              {cameraDisplayNames.get(camId) ?? camId}
            </div>
          </div>
        ))}

        {cameraIds.map((camId) => {
          const color = getColor(camId)
          const camIdx = cameraIds.indexOf(camId)
          const topBase = camIdx * laneHeight + laneHeight / 2
          return (cameraSequences.get(camId) ?? []).map((seq) => {
            const isDragging = dragging === seq.id
            const isDropTarget = hoverTarget === seq.id
            const offset = isDragging ? dragOffset : 0
            return (
              <div
                key={seq.id}
                className={`absolute h-3 rounded cursor-grab active:cursor-grabbing transition-shadow ${
                  isDragging
                    ? `${color.solid} shadow-lg ring-2 ${color.ring} z-10`
                    : isDropTarget
                      ? `${color.solid} ring-2 ring-green-400 ring-offset-1 z-10`
                      : `${color.bg} ${color.bgDark} opacity-70 hover:opacity-100 hover:ring-1 hover:${color.ring}`
                }`}
                style={{
                  top: `calc(${topBase}% - 6px)`,
                  left: `${posToPercent(seq.startTime + offset)}%`,
                  width: `${barWidth(seq.startTime, seq.endTime)}%`
                }}
                onMouseDown={(e) => handleMouseDown(e, seq.id, camId)}
                title={`Sequence ${idxMaps.get(camId)?.get(seq.id)} — drag to shift time`}
              />
            )
          })
        })}

        {dragging && Math.abs(dragOffset) > 1 && (
          <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-mono bg-gray-800 text-white px-2 py-1 rounded shadow-lg pointer-events-none'>
            {formatClockOffset(dragOffset)}
          </div>
        )}
      </div>

      {scopePicker && (
        <div
          className='absolute z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-xl p-2 flex flex-col gap-1'
          style={{
            left: `${Math.max(0, Math.min(80, scopePicker.percent - 10))}%`,
            top: '-10px',
            transform: 'translateY(-100%)'
          }}>
          <div className='text-xs text-gray-500 dark:text-gray-400 px-2 py-1 whitespace-nowrap'>
            {scopePicker.dropTarget ? (
              <span>
                Align to{' '}
                <span className='font-semibold text-gray-700 dark:text-gray-200'>
                  Seq {idxMaps.get(scopePicker.dropTarget.camera)?.get(scopePicker.dropTarget.id)}
                </span>
              </span>
            ) : (
              `Shift ${formatClockOffset(scopePicker.offsetSeconds)}`
            )}
          </div>
          <button
            type='button'
            onClick={() => applyShift('single')}
            className='text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'>
            This sequence
          </button>
          <button
            type='button'
            onClick={() => applyShift('after')}
            className='text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'>
            All later sequences
          </button>
          <button
            type='button'
            onClick={() => applyShift('all')}
            className='text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'>
            All {cameraDisplayNames.get(scopePicker.cameraId) ?? scopePicker.cameraId} sequences
          </button>
          <button
            type='button'
            onClick={() => setScopePicker(null)}
            className='text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400'>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

const CalibrationDialog = ({
  reference,
  target,
  offsetSeconds,
  onApply,
  onCancel
}: {
  reference: CalibrationSeq
  target: CalibrationSeq
  offsetSeconds: number
  onApply: (scope: 'single' | 'camera') => void
  onCancel: () => void
}) => {
  const previewFiles = target.files.slice(0, 6)
  const formatDateTime = (epoch: number): string =>
    `${formatSequenceDate(epoch)} ${formatSequenceTime(epoch)}`
  const isCrossCamera = reference.camera !== target.camera

  const refStartTime = Math.min(...reference.files.map((f) => f.mtime))
  const refEndTime = Math.max(...reference.files.map((f) => f.mtime))
  const targetStartTime = Math.min(...target.files.map((f) => f.mtime))
  const targetEndTime = Math.max(...target.files.map((f) => f.mtime))

  const alignedStart = targetStartTime + offsetSeconds
  const alignedEnd = targetEndTime + offsetSeconds

  const padding = 3600
  const timelineMin = Math.min(refStartTime, targetStartTime, alignedStart) - padding
  const timelineMax = Math.max(refEndTime, targetEndTime, alignedEnd) + padding
  const timelineRange = timelineMax - timelineMin || 1

  const timelinePos = (t: number): number => ((t - timelineMin) / timelineRange) * 100

  const barWidth = (start: number, end: number): number => {
    const raw = ((end - start) / timelineRange) * 100
    return Math.max(8, raw)
  }

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'
      onClick={onCancel}>
      <div
        className='bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-xl w-full mx-4 p-5'
        onClick={(e) => e.stopPropagation()}>
        <h3 className='text-lg font-semibold mb-1'>
          {isCrossCamera ? 'Sync Cameras' : 'Recalibrate Sequence'}
        </h3>
        <p className='text-sm text-gray-500 mb-4'>
          {isCrossCamera ? (
            <>
              Align{' '}
              <span className='font-semibold text-purple-600 dark:text-purple-400'>
                {target.camera}
              </span>{' '}
              sequence onto{' '}
              <span className='font-semibold text-blue-600 dark:text-blue-400'>
                {reference.camera}
              </span>{' '}
              sequence · offset{' '}
            </>
          ) : (
            <>
              Aligned onto {reference.label} ({reference.camera}) · clock offset{' '}
            </>
          )}
          <span className='font-mono font-semibold text-gray-700 dark:text-gray-200'>
            {formatClockOffset(offsetSeconds)}
          </span>
        </p>

        <div className='mb-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg'>
          <div className='text-xs text-gray-500 dark:text-gray-400 mb-2'>Timeline preview</div>
          <div className='relative h-14'>
            <div
              className='absolute h-3 rounded bg-blue-200 dark:bg-blue-900/50'
              style={{
                left: `${timelinePos(refStartTime)}%`,
                width: `${barWidth(refStartTime, refEndTime)}%`
              }}
            />
            <div
              className='absolute h-3 rounded bg-purple-200 dark:bg-purple-900/50 opacity-50'
              style={{
                top: '10px',
                left: `${timelinePos(targetStartTime)}%`,
                width: `${barWidth(targetStartTime, targetEndTime)}%`
              }}
            />
            <div
              className='absolute h-3 rounded bg-green-300 dark:bg-green-700'
              style={{
                top: '10px',
                left: `${timelinePos(alignedStart)}%`,
                width: `${barWidth(alignedStart, alignedEnd)}%`
              }}
            />
            <div className='absolute bottom-0 left-0 right-0 flex items-center gap-1 text-[10px] text-gray-400'>
              <span className='flex items-center gap-1'>
                <span className='w-2 h-2 rounded-full bg-blue-400' />
                Ref ({reference.camera})
              </span>
              <span className='flex items-center gap-1 ml-2'>
                <span className='w-2 h-2 rounded-full bg-purple-400 opacity-60' />
                Before
              </span>
              <span className='flex items-center gap-1 ml-2'>
                <span className='w-2 h-2 rounded-full bg-green-500' />
                After
              </span>
            </div>
          </div>
        </div>

        <div className='border rounded divide-y dark:divide-gray-600 dark:border-gray-600 max-h-48 overflow-y-auto mb-2'>
          {previewFiles.map((file) => (
            <div
              key={file.path}
              className='flex items-center gap-2 px-3 py-1.5 text-xs font-mono'>
              <span className='flex-1 truncate'>{file.filename}</span>
              <span className='text-gray-400 tabular-nums whitespace-nowrap'>
                {formatDateTime(file.mtime)}
              </span>
              <span className='text-gray-400'>→</span>
              <span className='text-green-600 dark:text-green-400 tabular-nums whitespace-nowrap'>
                {formatDateTime(file.mtime + offsetSeconds)}
              </span>
            </div>
          ))}
        </div>
        {target.files.length > 6 && (
          <p className='text-xs text-gray-400 mb-4'>…and {target.files.length - 6} more file(s)</p>
        )}
        <div className='flex items-center justify-end gap-2 mt-4'>
          <button
            type='button'
            onClick={onCancel}
            className='px-4 py-2 text-sm font-medium text-gray-700 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700'>
            Cancel
          </button>
          <button
            type='button'
            onClick={() => onApply('camera')}
            className='px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700'>
            {isCrossCamera
              ? `Shift all ${target.camera} files`
              : `Align all ${target.camera} sequences`}
          </button>
          <button
            type='button'
            onClick={() => onApply('single')}
            className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700'>
            Align this sequence
          </button>
        </div>
      </div>
    </div>
  )
}

const FileRow = ({
  file,
  groupId,
  camera,
  selected,
  isLone,
  draggable,
  onSelect,
  onDragStart,
  onRemove
}: {
  file: ManifestFile
  groupId: string
  camera: string
  selected: boolean
  isLone: boolean
  draggable: boolean
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDragStart: (e: React.DragEvent, filePath: string, groupId: string) => void
  onRemove?: (filePath: string) => void
}) => {
  const time = formatTime(file.mtime)

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded cursor-pointer select-none transition-colors ${
        selected
          ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-300 dark:ring-blue-700'
          : isLone
            ? 'bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/30'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, file.path, groupId)}
      onClick={(e) => onSelect(groupId, file.path, e.ctrlKey || e.metaKey, e.shiftKey)}>
      <input
        type='checkbox'
        checked={selected}
        onChange={() => {}}
        className='h-4 w-4 rounded border-gray-300 text-blue-600 pointer-events-none'
      />
      <span className={`font-mono truncate flex-1 text-xs ${getFileColorClass(camera)}`}>
        {file.filename}
      </span>
      <span className='text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap tabular-nums'>
        {time}
      </span>
      <span className='text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap'>
        {formatSize(file.size)}
      </span>
      {onRemove && (
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            onRemove(file.path)
          }}
          className='text-gray-400 hover:text-red-500 px-1'
          title='Remove from jump'>
          <svg
            className='w-3 h-3'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M6 18L18 6M6 6l12 12'
            />
          </svg>
        </button>
      )}
    </div>
  )
}

const SequenceSection = ({
  sequence,
  index,
  camera,
  selection,
  filesInJumps,
  onSelect,
  onDragStart,
  onCalibrate,
  isCalibRef,
  isCalibTarget
}: {
  sequence: Sequence
  index: number
  camera: string
  selection: Record<string, boolean>
  filesInJumps: Set<string>
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDragStart: (e: React.DragEvent, filePaths: string[], sourceJumpId: string) => void
  onCalibrate: (sequence: Sequence, camera: string, index: number) => void
  isCalibRef?: boolean
  isCalibTarget?: boolean
}) => {
  const [expanded, setExpanded] = useState(true)
  const selectedCount = sequence.files.filter((f) => selection[f.path]).length

  return (
    <div
      className={`mb-4 rounded-lg p-2 transition-colors ${
        isCalibRef
          ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700'
          : isCalibTarget
            ? 'bg-green-50 dark:bg-green-900/20 ring-1 ring-green-300 dark:ring-green-700'
            : ''
      }`}>
      <div className='flex items-center gap-2 mb-1 px-1'>
        <button
          type='button'
          onClick={() => setExpanded(!expanded)}
          className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs'>
          {expanded ? '▼' : '▶'}
        </button>
        <span className='font-semibold text-sm text-gray-700 dark:text-gray-300'>
          Sequence {index + 1}
        </span>
        <span className='text-xs text-gray-400 dark:text-gray-500 font-light'>
          {sequence.date} {formatSequenceTime(sequence.startTime)} -{' '}
          {formatSequenceTime(sequence.endTime)}
        </span>
        <span className='text-xs text-gray-400 dark:text-gray-500'>
          {sequence.files.length} file{sequence.files.length !== 1 ? 's' : ''}
        </span>
        {selectedCount > 0 && (
          <span className='text-xs text-blue-500 dark:text-blue-400'>{selectedCount} selected</span>
        )}
        <button
          type='button'
          onClick={() => onCalibrate(sequence, camera, index)}
          className={`text-xs px-1 font-mono ${
            isCalibRef
              ? 'text-blue-600 dark:text-blue-400'
              : isCalibTarget
                ? 'text-green-600 dark:text-green-400'
                : 'text-gray-400 hover:text-blue-500 dark:hover:text-blue-400'
          }`}
          title='Sync this sequence onto another'>
          ⇄
        </button>
      </div>
      {expanded && (
        <div className='space-y-0.5 ml-4'>
          {sequence.files.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              groupId={sequence.id}
              camera={camera}
              selected={!!selection[file.path]}
              isLone={!filesInJumps.has(file.path)}
              draggable={true}
              onSelect={onSelect}
              onDragStart={(e, filePath) => {
                const selectedPaths = sequence.files
                  .filter((f) => selection[f.path])
                  .map((f) => f.path)
                const pathsToDrag =
                  selectedPaths.length > 0 && selection[file.path] ? selectedPaths : [filePath]
                onDragStart(e, pathsToDrag, sequence.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const JumpSection = ({
  jump,
  selection,
  onSelect,
  onDrop,
  onDragStart,
  onRemoveFiles,
  onResetTimestamps
}: {
  jump: ManifestJump
  selection: Record<string, boolean>
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDrop: (e: React.DragEvent, targetJumpId: string) => void
  onDragStart: (e: React.DragEvent, filePaths: string[], sourceJumpId: string) => void
  onRemoveFiles: (jumpId: string, filePaths: string[]) => void
  onResetTimestamps: (jumpId: string) => void
}) => {
  const [expanded, setExpanded] = useState(true)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState(jump.label)
  const [isDragOver, setIsDragOver] = useState(false)
  const fetcher = useFetcher()

  const selectedCount = jump.files.filter((f) => selection[f.path]).length

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    setIsDragOver(false)
    onDrop(e, jump.id)
  }

  const handleRemoveSelected = () => {
    const filePaths = jump.files.filter((f) => selection[f.path]).map((f) => f.path)
    if (filePaths.length > 0) {
      onRemoveFiles(jump.id, filePaths)
    }
  }

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors mb-4 ${
        isDragOver
          ? 'border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/30'
          : jump.confirmed
            ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/20'
            : 'border-gray-200 dark:border-gray-700'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}>
      <div className='flex items-center gap-2 px-4 py-2'>
        <input
          type='checkbox'
          checked={jump.confirmed}
          onChange={(e) => handleConfirm(e.target.checked)}
          className='h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500'
        />
        <button
          type='button'
          onClick={() => setExpanded(!expanded)}
          className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs'>
          {expanded ? '▼' : '▶'}
        </button>
        {editingLabel ? (
          <input
            type='text'
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            onBlur={handleLabelSave}
            onKeyDown={(e) => e.key === 'Enter' && handleLabelSave()}
            autoFocus
            className='font-semibold text-sm bg-white dark:bg-gray-800 border rounded px-1 py-0.5 w-full'
          />
        ) : (
          <span
            className='font-semibold text-sm cursor-text hover:underline flex-1'
            onClick={(e) => {
              e.stopPropagation()
              setEditingLabel(true)
            }}>
            {jump.label}
          </span>
        )}
        <span className='text-xs text-gray-400 dark:text-gray-500'>
          {jump.files.length} file{jump.files.length !== 1 ? 's' : ''}
        </span>
        {selectedCount > 0 && (
          <>
            <span className='text-xs text-blue-500 dark:text-blue-400'>
              {selectedCount} selected
            </span>
            <button
              type='button'
              onClick={handleRemoveSelected}
              className='text-xs text-red-500 hover:text-red-700'>
              Remove
            </button>
          </>
        )}
        <button
          type='button'
          onClick={() => onResetTimestamps(jump.id)}
          className='text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          title='Reset timestamps from start datetime'>
          Sync time
        </button>
        <button
          type='button'
          onClick={handleDelete}
          className='text-gray-400 hover:text-red-500 px-1'
          title='Remove jump'>
          <svg
            className='w-4 h-4'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M6 18L18 6M6 6l12 12'
            />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className='border-t dark:border-gray-700 px-4 py-2 space-y-0.5 bg-gray-50/50 dark:bg-gray-800/50'>
          {jump.files.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              groupId={jump.id}
              camera={file.camera ?? 'default'}
              selected={!!selection[file.path]}
              isLone={false}
              draggable={true}
              onSelect={onSelect}
              onDragStart={(e, filePath) => {
                const selectedPaths = jump.files.filter((f) => selection[f.path]).map((f) => f.path)
                const pathsToDrag =
                  selectedPaths.length > 0 && selection[file.path] ? selectedPaths : [filePath]
                onDragStart(e, pathsToDrag, jump.id)
              }}
              onRemove={(filePath) => onRemoveFiles(jump.id, [filePath])}
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

const Review = ({ loaderData }: Route.ComponentProps) => {
  const { manifest } = loaderData
  const manifestFetcher = useFetcher()
  const scanFetcher = useFetcher()
  const { revalidate } = useRevalidator()

  const [selection, setSelection] = useState<SelectionMap>({})
  const [lastClicked, setLastClicked] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<string>('')
  const [startTime, setStartTime] = useState(manifest?.startDatetime ?? '')
  const [calibRef, setCalibRef] = useState<CalibrationSeq | null>(null)
  const [calibTarget, setCalibTarget] = useState<CalibrationSeq | null>(null)
  const [editingDay, setEditingDay] = useState<{ camera: string; date: string } | null>(null)
  const dragDataRef = useRef<{ filePaths: string[]; sourceJumpId: string } | null>(null)

  useEffect(() => {
    if (manifestFetcher.data || scanFetcher.data) {
      revalidate()
    }
  }, [manifestFetcher.data, scanFetcher.data, revalidate])

  const scanning = scanFetcher.state !== 'idle'

  const cameraIds = useMemo(() => {
    if (!manifest) return []
    return getCameraIds(manifest)
  }, [manifest])

  const cameraDisplayNames = useMemo(() => {
    const map = new Map<string, string>()
    const cameras = manifest?.cameras ?? []
    for (let i = 0; i < cameras.length; i++) {
      map.set(cameras[i].id, `Camera ${i + 1}`)
    }
    for (const camId of cameraIds) {
      if (!map.has(camId)) {
        map.set(camId, `Camera ${map.size + 1}`)
      }
    }
    return map
  }, [manifest, cameraIds])

  const cameraSequences = useMemo(() => {
    const map = new Map<string, Sequence[]>()
    for (const camId of cameraIds) {
      map.set(camId, getSequences(manifest!, camId))
    }
    return map
  }, [manifest, cameraIds])

  const cameraColorMap = useMemo(() => {
    const colors = ['blue', 'purple', 'green', 'orange', 'pink', 'cyan', 'amber', 'red']
    const map = new Map<string, string>()
    for (let i = 0; i < cameraIds.length; i++) {
      map.set(cameraIds[i], colors[i % colors.length])
    }
    return map
  }, [cameraIds])

  const groupByDay = (sequences: Sequence[]): { date: string; sequences: Sequence[] }[] => {
    const groups: { date: string; sequences: Sequence[] }[] = []
    for (const seq of sequences) {
      const existing = groups.find((g) => g.date === seq.date)
      if (existing) {
        existing.sequences.push(seq)
      } else {
        groups.push({ date: seq.date, sequences: [seq] })
      }
    }
    return groups
  }

  const cameraDays = useMemo(() => {
    const map = new Map<string, { date: string; sequences: Sequence[] }[]>()
    for (const camId of cameraIds) {
      map.set(camId, groupByDay(cameraSequences.get(camId) ?? []))
    }
    return map
  }, [cameraIds, cameraSequences])

  const allDates = useMemo(() => {
    const dateSet = new Set<string>()
    for (const camId of cameraIds) {
      for (const d of cameraDays.get(camId) ?? []) {
        dateSet.add(d.date)
      }
    }
    const dates = Array.from(dateSet)
    dates.sort((a, b) => {
      let aTime = Infinity
      let bTime = Infinity
      for (const camId of cameraIds) {
        const aDay = cameraDays.get(camId)?.find((d) => d.date === a)
        const bDay = cameraDays.get(camId)?.find((d) => d.date === b)
        if (aDay) aTime = Math.min(aTime, aDay.sequences[0]?.startTime ?? Infinity)
        if (bDay) bTime = Math.min(bTime, bDay.sequences[0]?.startTime ?? Infinity)
      }
      return aTime - bTime
    })
    return dates
  }, [cameraIds, cameraDays])

  const dayMap = useMemo(() => {
    const map = new Map<string, Map<string, { date: string; sequences: Sequence[] }>>()
    for (const date of allDates) {
      const entry = new Map<string, { date: string; sequences: Sequence[] }>()
      for (const camId of cameraIds) {
        const day = cameraDays.get(camId)?.find((d) => d.date === date)
        if (day) entry.set(camId, day)
      }
      map.set(date, entry)
    }
    return map
  }, [allDates, cameraIds, cameraDays])

  const allFileIds = useMemo(() => {
    if (!manifest) return []
    const ids: string[] = []
    for (const camId of cameraIds) {
      for (const seq of cameraSequences.get(camId) ?? []) {
        for (const file of seq.files) {
          ids.push(file.path)
        }
      }
    }
    for (const jump of manifest.jumps) {
      for (const file of jump.files) {
        if (!ids.includes(file.path)) {
          ids.push(file.path)
        }
      }
    }
    return ids
  }, [manifest, cameraIds, cameraSequences])

  const filesInJumps = useMemo(() => {
    if (!manifest) return new Set<string>()
    const paths = new Set<string>()
    for (const jump of manifest.jumps) {
      for (const file of jump.files) {
        paths.add(file.path)
      }
    }
    return paths
  }, [manifest])

  const handleSelect = useCallback(
    (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => {
      setSelection((prev) => {
        const next = { ...prev }
        if (!next[groupId]) next[groupId] = {}

        if (shiftKey && lastClicked) {
          const startIdx = allFileIds.indexOf(lastClicked)
          const endIdx = allFileIds.indexOf(filePath)
          if (startIdx !== -1 && endIdx !== -1) {
            const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
            for (let i = from; i <= to; i++) {
              const id = allFileIds[i]
              for (const jid of Object.keys(next)) {
                if (next[jid][id]) delete next[jid][id]
              }
              if (!next[groupId]) next[groupId] = {}
              next[groupId][id] = true
            }
          }
        } else if (ctrlKey) {
          next[groupId][filePath] = !next[groupId][filePath]
        } else {
          for (const jid of Object.keys(next)) {
            next[jid] = {}
          }
          next[groupId][filePath] = true
        }

        setLastClicked(filePath)
        return next
      })
    },
    [lastClicked, allFileIds]
  )

  const selectedFiles = useMemo(() => {
    const result: { groupId: string; file: ManifestFile }[] = []
    if (!manifest) return result

    for (const camId of cameraIds) {
      for (const seq of cameraSequences.get(camId) ?? []) {
        for (const file of seq.files) {
          if (selection[seq.id]?.[file.path]) {
            result.push({ groupId: seq.id, file })
          }
        }
      }
    }

    for (const jump of manifest.jumps) {
      for (const file of jump.files) {
        if (selection[jump.id]?.[file.path]) {
          const alreadySelected = result.some((r) => r.file.path === file.path)
          if (!alreadySelected) {
            result.push({ groupId: jump.id, file })
          }
        }
      }
    }

    return result
  }, [manifest, selection, cameraIds, cameraSequences])

  const selectedCount = selectedFiles.length
  const selectedJumpIds = useMemo(() => {
    const ids = new Set(
      selectedFiles
        .map((s) => {
          if (!manifest) return null
          for (const jump of manifest.jumps) {
            if (jump.files.some((f) => f.path === s.file.path)) {
              return jump.id
            }
          }
          return null
        })
        .filter((id): id is string => id !== null)
    )
    return Array.from(ids)
  }, [selectedFiles, manifest])

  const handleDragStart = useCallback(
    (e: React.DragEvent, filePaths: string[], sourceJumpId: string) => {
      dragDataRef.current = { filePaths, sourceJumpId }
      e.dataTransfer.effectAllowed = 'move'
    },
    []
  )

  const handleCalibrateClick = useCallback(
    (seq: CalibrationSeq) => {
      if (!calibRef) {
        setCalibRef(seq)
        setCalibTarget(null)
        return
      }
      if (calibTarget) return
      if (seq.files[0]?.path === calibRef.files[0]?.path) {
        setCalibRef(null)
        return
      }
      setCalibTarget(seq)
    },
    [calibRef, calibTarget]
  )

  const calibOffsetSeconds = useMemo(() => {
    if (
      !calibRef ||
      !calibTarget ||
      calibRef.files.length === 0 ||
      calibTarget.files.length === 0
    ) {
      return 0
    }
    const refMin = Math.min(...calibRef.files.map((f) => f.mtime))
    const targetMin = Math.min(...calibTarget.files.map((f) => f.mtime))
    return refMin - targetMin
  }, [calibRef, calibTarget])

  const submitCalibration = (scope: 'single' | 'camera') => {
    if (!calibRef || !calibTarget) return
    manifestFetcher.submit(
      {
        action: 'calibrate-sequences',
        referencePaths: calibRef.files.map((f) => f.path),
        targetPaths: calibTarget.files.map((f) => f.path),
        scope,
        camera: calibTarget.camera
      },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
    setCalibRef(null)
    setCalibTarget(null)
  }

  const handleShiftSequences = useCallback(
    (paths: string[], offsetSeconds: number) => {
      if (paths.length === 0 || offsetSeconds === 0) return
      manifestFetcher.submit(
        { action: 'shift-sequences', paths, offsetSeconds },
        { method: 'POST', encType: 'application/json', action: '/api/manifest' }
      )
    },
    [manifestFetcher]
  )

  const handleDayDateChange = useCallback(
    (cameraId: string, date: string, newDateStr: string) => {
      setEditingDay(null)
      const seqs = cameraSequences.get(cameraId) ?? []
      const day = seqs.find((s) => formatSequenceDate(s.startTime) === date)
      if (!day) return
      const oldTimestamp = day.startTime
      const parts = newDateStr.split('-')
      const year = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10) - 1
      const dayPart = parseInt(parts[2], 10)
      const newTimestamp = Math.floor(new Date(year, month, dayPart, 12, 0, 0).getTime() / 1000)
      const offsetSeconds = newTimestamp - oldTimestamp
      if (offsetSeconds === 0) return
      const daySeqs = seqs.filter((s) => formatSequenceDate(s.startTime) === date)
      const paths = daySeqs.flatMap((s) => s.files.map((f) => f.path))
      handleShiftSequences(paths, offsetSeconds)
    },
    [cameraSequences, handleShiftSequences]
  )

  const hasCalibration = useMemo(
    () =>
      manifest?.cameraClockOffsetSeconds !== undefined ||
      (manifest?.files.some((f) => f.originalMtime !== undefined) ?? false),
    [manifest]
  )

  const handleResetCalibration = () => {
    manifestFetcher.submit(
      { action: 'reset-calibration' },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }

  const handleDrop = useCallback(
    (e: React.DragEvent, targetJumpId: string) => {
      e.preventDefault()
      const data = dragDataRef.current
      if (!data) return

      try {
        let sourceJumpId = data.sourceJumpId
        if (sourceJumpId.startsWith('seq_')) {
          for (const jump of manifest?.jumps ?? []) {
            if (jump.files.some((f) => data.filePaths.includes(f.path))) {
              sourceJumpId = jump.id
              break
            }
          }
        }

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
            {
              action: 'add-to-jump',
              jumpId: targetJumpId,
              filePaths: data.filePaths
            },
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

  const handleMoveSelected = () => {
    if (!moveTarget || selectedCount === 0) return

    const fromJumpId = selectedJumpIds.length === 1 ? selectedJumpIds[0] : ''
    if (!fromJumpId) return

    manifestFetcher.submit(
      {
        action: 'move-files',
        fromJumpId,
        toJumpId: moveTarget,
        filePaths: selectedFiles
          .filter((s) => {
            const jump = manifest?.jumps.find((j) => j.id === fromJumpId)
            return jump?.files.some((f) => f.path === s.file.path)
          })
          .map((s) => s.file.path)
      },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
    setSelection({})
    setMoveTarget('')
  }

  const handleResetTimestamps = (jumpId: string) => {
    manifestFetcher.submit(
      { action: 'reset-timestamps', jumpId },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }

  const handleStartTimeChange = (value: string) => {
    setStartTime(value)
    manifestFetcher.submit(
      { action: 'update-start-datetime', startDatetime: value },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }

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
    const confirmedJumpIds = manifest?.jumps.filter((j) => j.confirmed).map((j) => j.id) ?? []
    manifestFetcher.submit(
      { action: 'execute-jumps', jumpIds: confirmedJumpIds },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }

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
                className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer'>
                {scanning ? 'Scanning...' : 'Scan'}
              </button>
            </scanFetcher.Form>
            <Link
              to='/'
              className='text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )

  if (!manifest) {
    return renderEmptyState('No Manifest Found', 'Run a scan first to generate proposed jumps.')
  }

  if (manifest.status === 'empty') {
    return renderEmptyState('No Files to Review', 'No new camera files were found.')
  }

  if (manifest.status === 'executed') {
    return renderEmptyState('Already Executed', 'This manifest has already been processed.')
  }

  const confirmedCount = manifest.jumps.filter((j) => j.confirmed).length
  const totalFiles = manifest.jumps.reduce((s, j) => s + j.files.length, 0)

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900'>
      <div className='max-w-7xl mx-auto px-6 py-6'>
        <div className='flex items-center justify-between mb-6'>
          <div>
            <h1 className='text-3xl font-bold'>Review Proposed Jumps</h1>
            <p className='text-gray-500 mt-1'>
              {manifest.date} — {manifest.jumps.length} jump
              {manifest.jumps.length !== 1 ? 's' : ''}, {totalFiles} file
              {totalFiles !== 1 ? 's' : ''}
            </p>
          </div>
          <div className='flex items-center gap-3'>
            <scanFetcher.Form
              method='post'
              action='/api/scan'>
              <button
                type='submit'
                disabled={scanning}
                className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer'>
                {scanning ? 'Scanning...' : 'Scan'}
              </button>
            </scanFetcher.Form>
            <Link
              to='/'
              className='text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'>
              Back to Dashboard
            </Link>
          </div>
        </div>

        <div className='flex items-center gap-3 mb-4'>
          <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            Start Time:
          </label>
          <input
            type='datetime-local'
            value={startTime.slice(0, 16)}
            onChange={(e) => handleStartTimeChange(e.target.value + ':00Z')}
            className='px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
          />
          <div className='flex-1' />
          <button
            type='button'
            onClick={handleConfirmAll}
            className='px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50'>
            Confirm All
          </button>
          <button
            type='button'
            onClick={handleCreateJump}
            className='px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50'>
            + Add Jump
          </button>
          {hasCalibration && (
            <button
              type='button'
              onClick={handleResetCalibration}
              className='px-4 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-white border border-indigo-300 dark:border-indigo-700 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30'>
              Reset Sync
            </button>
          )}
          <button
            type='button'
            onClick={handleConfirmAndExecute}
            disabled={confirmedCount === 0}
            className={`px-6 py-2 text-sm font-medium text-white rounded-lg ${
              confirmedCount > 0
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gray-300 cursor-not-allowed'
            }`}>
            Confirm & Execute ({confirmedCount}/{manifest.jumps.length})
          </button>
        </div>

        {selectedCount > 0 && (
          <div className='flex items-center gap-3 mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg'>
            <span className='text-sm font-medium text-blue-700 dark:text-blue-300'>
              {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
            </span>
            <div className='flex-1' />
            <select
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
              className='px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'>
              <option value=''>Move to jump...</option>
              {manifest.jumps.map((j) => (
                <option
                  key={j.id}
                  value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
            <button
              type='button'
              onClick={handleMoveSelected}
              disabled={!moveTarget || selectedCount === 0}
              className='px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer'>
              Move
            </button>
            <button
              type='button'
              onClick={() => setSelection({})}
              className='px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'>
              Clear
            </button>
          </div>
        )}

        {calibRef && !calibTarget && (
          <div className='flex items-center gap-3 mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg'>
            <span className='text-sm font-medium text-indigo-700 dark:text-indigo-300'>
              Reference set:{' '}
              <span className='px-1.5 py-0.5 rounded text-xs font-semibold uppercase bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'>
                {calibRef.camera}
              </span>{' '}
              {calibRef.label} — click ⇄ on any sequence (same or other camera) to sync it onto this
              one
            </span>
            <div className='flex-1' />
            <button
              type='button'
              onClick={() => setCalibRef(null)}
              className='px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'>
              Cancel
            </button>
          </div>
        )}

        {calibRef && calibTarget && (
          <CalibrationDialog
            reference={calibRef}
            target={calibTarget}
            offsetSeconds={calibOffsetSeconds}
            onApply={submitCalibration}
            onCancel={() => {
              setCalibRef(null)
              setCalibTarget(null)
            }}
          />
        )}

        <TimelineStrip
          cameraSequences={cameraSequences}
          cameraIds={cameraIds}
          cameraColorMap={cameraColorMap}
          cameraDisplayNames={cameraDisplayNames}
          onShift={handleShiftSequences}
        />

        <div className='flex gap-4'>
          <div className='flex-1 min-w-0'>
            <div
              className='grid gap-4 mb-3 px-1'
              style={{ gridTemplateColumns: `repeat(${cameraIds.length}, minmax(0, 1fr))` }}>
              {cameraIds.map((camId) => (
                <div
                  key={camId}
                  className='flex items-center gap-2'>
                  <div
                    className={`w-3 h-3 rounded-full bg-${cameraColorMap.get(camId) ?? 'gray'}-500`}
                  />
                  <h2 className='text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider truncate'>
                    {cameraDisplayNames.get(camId) ?? camId}
                  </h2>
                </div>
              ))}
            </div>
            <div className='flex flex-col gap-3'>
              {allDates.map((date) => {
                const entry = dayMap.get(date)
                return (
                  <div
                    key={date}
                    className='grid gap-4'
                    style={{ gridTemplateColumns: `repeat(${cameraIds.length}, minmax(0, 1fr))` }}>
                    {cameraIds.map((camId) => {
                      const dayData = entry?.get(camId)
                      if (!dayData) return <div key={camId} />
                      const colorBorder =
                        cameraColorMap.get(camId) === 'blue'
                          ? 'border-blue-300 dark:border-blue-600'
                          : cameraColorMap.get(camId) === 'purple'
                            ? 'border-purple-300 dark:border-purple-600'
                            : 'border-gray-300 dark:border-gray-600'
                      return (
                        <div key={camId}>
                          <div className='border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800/50'>
                            {editingDay?.camera === camId && editingDay?.date === date ? (
                              <input
                                type='date'
                                autoFocus
                                defaultValue={formatDateForInput(date)}
                                onBlur={(e) => handleDayDateChange(camId, date, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter')
                                    handleDayDateChange(camId, date, e.currentTarget.value)
                                  if (e.key === 'Escape') setEditingDay(null)
                                }}
                                className={`text-sm font-medium px-2 py-1 border ${colorBorder} rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 mb-2 w-full`}
                              />
                            ) : (
                              <div
                                className='text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 cursor-pointer hover:underline decoration-dotted'
                                onClick={() => setEditingDay({ camera: camId, date })}
                                title='Click to edit date'>
                                {date}
                              </div>
                            )}
                            <div className='space-y-2'>
                              {dayData.sequences.map((seq, i) => (
                                <SequenceSection
                                  key={seq.id}
                                  sequence={seq}
                                  index={i}
                                  camera={camId}
                                  selection={selection[seq.id] ?? {}}
                                  filesInJumps={filesInJumps}
                                  onSelect={handleSelect}
                                  onDragStart={handleDragStart}
                                  onCalibrate={(sequence, camera, index) =>
                                    handleCalibrateClick({
                                      label: `Sequence ${index + 1}`,
                                      camera,
                                      files: sequence.files
                                    })
                                  }
                                  isCalibRef={calibRef?.files[0]?.path === seq.files[0]?.path}
                                  isCalibTarget={calibTarget?.files[0]?.path === seq.files[0]?.path}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          <div className='w-80 shrink-0'>
            <div className='flex items-center gap-2 mb-3 px-1'>
              <div className='w-3 h-3 rounded-full bg-green-500' />
              <h2 className='text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider'>
                Jumps
              </h2>
            </div>
            <div className='space-y-2'>
              {manifest.jumps.map((jump) => (
                <JumpSection
                  key={jump.id}
                  jump={jump}
                  selection={selection[jump.id] ?? {}}
                  onSelect={handleSelect}
                  onDrop={handleDrop}
                  onDragStart={handleDragStart}
                  onRemoveFiles={handleRemoveFiles}
                  onResetTimestamps={handleResetTimestamps}
                />
              ))}
            </div>
          </div>
        </div>

        {manifest.theory.length > 0 && (
          <div className='mt-8'>
            <h2 className='text-lg font-semibold mb-3'>Theory Files ({manifest.theory.length})</h2>
            <div className='border rounded-lg divide-y dark:divide-gray-700 dark:border-gray-700'>
              {manifest.theory.map((file, i) => {
                const time = formatTime(file.mtime)
                return (
                  <div
                    key={`theory-${i}`}
                    className='flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded'>
                    <span className='px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'>
                      {file.camera ?? 'Unknown'}
                    </span>
                    <span className='font-mono text-gray-600 dark:text-gray-400 truncate flex-1'>
                      {file.filename}
                    </span>
                    <span className='text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap tabular-nums'>
                      {time}
                    </span>
                    <span className='text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap'>
                      {formatSize(file.size)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Review
export { loader }
