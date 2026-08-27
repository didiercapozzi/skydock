import * as fs from 'node:fs'
import * as path from 'node:path'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useFetcher, useRevalidator } from 'react-router'
import { getOutputDirPath } from '../lib/scanner.server'
import { ensureManifestFileIds } from '../lib/fileId.server'
import {
  getSequences,
  formatDateForInput,
  formatSequenceTime,
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

const formatTime = (epoch: number): string =>
  new Date(epoch * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

type SelectionMap = Record<string, Record<string, boolean>>

type DayGroup = {
  date: string
  sequences: Sequence[]
}

const groupByDay = (sequences: Sequence[]): DayGroup[] => {
  const map = new Map<string, DayGroup>()
  for (const seq of sequences) {
    const g = map.get(seq.date)
    if (g) g.sequences.push(seq)
    else map.set(seq.date, { date: seq.date, sequences: [seq] })
  }
  return Array.from(map.values())
}

const FileRow = ({
  file,
  groupId,
  selected,
  isUnassigned,
  onSelect,
  onDragStart
}: {
  file: ManifestFile
  groupId: string
  selected: boolean
  isUnassigned?: boolean
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDragStart: (e: React.DragEvent, filePath: string, groupId: string) => void
}) => (
  <div
    className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded cursor-pointer select-none transition-colors ${
      selected
        ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-300 dark:ring-blue-700'
        : isUnassigned
          ? 'bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
    }`}
    draggable
    onDragStart={(e) => onDragStart(e, file.path, groupId)}
    onClick={(e) => onSelect(groupId, file.path, e.ctrlKey || e.metaKey, e.shiftKey)}>
    <input
      type='checkbox'
      checked={selected}
      onChange={() => {}}
      className='h-4 w-4 rounded border-gray-300 text-blue-600 pointer-events-none'
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
  </div>
)

const SequenceDaySection = ({
  day,
  filesInJumps,
  selection,
  onSelect,
  onDragStart,
  onShiftDay,
  editingDay,
  setEditingDay
}: {
  day: DayGroup
  filesInJumps: Set<string>
  selection: SelectionMap
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDragStart: (e: React.DragEvent, filePaths: string[], sourceId: string) => void
  onShiftDay: (date: string, newDateStr: string) => void
  editingDay: string | null
  setEditingDay: (d: string | null) => void
}) => {
  const fileCount = day.sequences.reduce((s, seq) => s + seq.files.length, 0)
  const unassignedCount = day.sequences.reduce(
    (s, seq) => s + seq.files.filter((f) => !filesInJumps.has(f.path)).length,
    0
  )
  return (
    <div className='border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50 overflow-hidden mb-3'>
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
          {fileCount} files • {day.sequences.length} seq
        </span>
        {unassignedCount > 0 && (
          <span className='text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'>
            {unassignedCount} unassigned
          </span>
        )}
        <span className='ml-auto text-[10px] text-gray-400 hidden sm:inline'>
          drag timeline or click date to fix
        </span>
      </div>
      <div className='p-2 space-y-3'>
        {day.sequences.map((seq, idx) => (
          <div
            key={seq.id}
            className='space-y-0.5'>
            <div className='flex items-center gap-2 px-1 text-xs text-gray-500'>
              <span className='font-medium'>Seq {idx + 1}</span>
              <span className='tabular-nums'>
                {formatSequenceTime(seq.startTime)}–{formatSequenceTime(seq.endTime)}
              </span>
              <span>• {seq.files.length} files</span>
            </div>
            {seq.files.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                groupId={seq.id}
                selected={!!selection[seq.id]?.[file.path]}
                isUnassigned={!filesInJumps.has(file.path)}
                onSelect={onSelect}
                onDragStart={(e, fp) => {
                  const selected = seq.files
                    .filter((f) => selection[seq.id]?.[f.path])
                    .map((f) => f.path)
                  const toDrag = selected.length > 0 && selection[seq.id]?.[fp] ? selected : [fp]
                  onDragStart(e, toDrag, seq.id)
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

const TimelinePerDay = ({
  dayGroups,
  onShiftDay
}: {
  dayGroups: DayGroup[]
  onShiftDay: (date: string, offsetSeconds: number, dayPaths: string[]) => void
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [draggingDay, setDraggingDay] = useState<string | null>(null)
  const [draggingSeq, setDraggingSeq] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [dragLabel, setDragLabel] = useState('')
  const dragOffsetRef = useRef(0)

  const allSeqs = useMemo(() => dayGroups.flatMap((d) => d.sequences), [dayGroups])

  const timeRange = useMemo(() => {
    if (allSeqs.length === 0) return { min: 0, max: 86400 }
    const minStart = Math.min(...allSeqs.map((s) => s.startTime))
    const maxEnd = Math.max(...allSeqs.map((s) => s.endTime))
    const minD = new Date(minStart * 1000)
    minD.setHours(0, 0, 0, 0)
    const maxD = new Date(maxEnd * 1000)
    maxD.setHours(0, 0, 0, 0)
    maxD.setDate(maxD.getDate() + 1)
    const min = Math.floor(minD.getTime() / 1000)
    const max = Math.floor(maxD.getTime() / 1000)
    return { min, max }
  }, [allSeqs])

  const range = timeRange.max - timeRange.min || 1
  const pos = (t: number) => ((t - timeRange.min) / range) * 100
  const width = (a: number, b: number) => Math.max(2, ((b - a) / range) * 100)

  const hourTicks = useMemo(() => {
    const ticks: { t: number; label: string }[] = []
    const start = new Date(timeRange.min * 1000)
    start.setMinutes(0, 0, 0)
    start.setHours(Math.ceil(start.getHours() / 6) * 6)
    for (
      let d = new Date(start);
      d.getTime() / 1000 < timeRange.max;
      d.setHours(d.getHours() + 6)
    ) {
      const epoch = Math.floor(d.getTime() / 1000)
      const h = d.getHours()
      const label =
        h === 0
          ? d.toLocaleDateString([], { month: 'short', day: 'numeric' })
          : `${String(h).padStart(2, '0')}:00`
      ticks.push({ t: epoch, label })
    }
    return ticks
  }, [timeRange])

  if (allSeqs.length === 0) return null

  return (
    <div className='mb-4'>
      <div className='flex items-center justify-between mb-1 px-1'>
        <span className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
          Timeline — drag a sequence to shift it, drag lane to shift day
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
          const isDayDragging = draggingDay === day.date
          const dayOffset = isDayDragging ? dragOffset : 0
          const laneTop = (idx / dayGroups.length) * 100
          const laneH = 100 / dayGroups.length
          const dayColor =
            idx % 2 === 0 ? 'bg-blue-400 dark:bg-blue-600' : 'bg-indigo-400 dark:bg-indigo-600'
          return (
            <div
              key={day.date}
              className='absolute inset-x-0 border-b border-gray-200/60 dark:border-gray-700/60 flex items-center cursor-grab active:cursor-grabbing'
              style={{ top: `${laneTop}%`, height: `${laneH}%` }}
              onMouseDown={(e) => {
                if ((e.target as HTMLElement).closest('[data-seq-bar]')) return
                e.preventDefault()
                const startX = e.clientX
                const snapDay = e.shiftKey
                setDraggingDay(day.date)
                setDraggingSeq(null)
                setDragOffset(0)
                dragOffsetRef.current = 0
                setDragLabel(day.date)
                const dayPaths = day.sequences.flatMap((s) => s.files.map((f) => f.path))
                const handleMove = (ev: MouseEvent) => {
                  const dx = ev.clientX - startX
                  const w = containerRef.current?.clientWidth ?? 1
                  const dt = (dx / w) * range
                  const snapped = snapDay
                    ? Math.round(dt / 86400) * 86400
                    : Math.round(dt / 1800) * 1800
                  dragOffsetRef.current = snapped
                  setDragOffset(snapped)
                }
                const handleUp = () => {
                  document.removeEventListener('mousemove', handleMove)
                  document.removeEventListener('mouseup', handleUp)
                  const off = dragOffsetRef.current
                  setDraggingDay(null)
                  setDragOffset(0)
                  setDragLabel('')
                  dragOffsetRef.current = 0
                  if (Math.abs(off) >= 60) onShiftDay(day.date, off, dayPaths)
                }
                document.addEventListener('mousemove', handleMove)
                document.addEventListener('mouseup', handleUp)
              }}>
              <div className='absolute left-2 text-[10px] font-medium text-gray-500 truncate max-w-[110px] pointer-events-none'>
                {day.date}
              </div>
              {day.sequences.map((seq) => {
                const isSeqDragging = draggingSeq === seq.id
                const isDayDraggingActive = draggingDay === day.date
                const offset = isSeqDragging ? dragOffset : isDayDraggingActive ? dayOffset : 0
                return (
                  <div
                    key={seq.id}
                    data-seq-bar='true'
                    className={`absolute h-4 rounded cursor-grab active:cursor-grabbing ${dayColor} opacity-80 hover:opacity-100 ${isSeqDragging || isDayDraggingActive ? 'shadow-lg ring-2 ring-blue-300 z-10' : ''}`}
                    style={{
                      top: '50%',
                      transform: 'translateY(-50%)',
                      left: `${pos(seq.startTime + offset)}%`,
                      width: `${width(seq.startTime, seq.endTime)}%`
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const startX = e.clientX
                      const snapDay = e.shiftKey
                      setDraggingSeq(seq.id)
                      setDraggingDay(null)
                      setDragOffset(0)
                      dragOffsetRef.current = 0
                      setDragLabel(`Seq ${day.sequences.indexOf(seq) + 1}`)
                      const seqPaths = seq.files.map((f) => f.path)
                      const handleMove = (ev: MouseEvent) => {
                        const dx = ev.clientX - startX
                        const w = containerRef.current?.clientWidth ?? 1
                        const dt = (dx / w) * range
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
                        setDraggingSeq(null)
                        setDragOffset(0)
                        setDragLabel('')
                        dragOffsetRef.current = 0
                        if (Math.abs(off) >= 60) onShiftDay(day.date, off, seqPaths)
                      }
                      document.addEventListener('mousemove', handleMove)
                      document.addEventListener('mouseup', handleUp)
                    }}
                    title={`${day.date} Seq ${day.sequences.indexOf(seq) + 1} — drag to shift sequence, Shift for 1-day snap`}
                  />
                )
              })}
            </div>
          )
        })}
        {(draggingDay || draggingSeq) && Math.abs(dragOffset) >= 60 && (
          <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-mono bg-gray-800 text-white px-2 py-1 rounded shadow pointer-events-none'>
            {dragLabel} {formatClockOffset(dragOffset)}
          </div>
        )}
      </div>
    </div>
  )
}

const JumpSection = ({
  jump,
  selection,
  onSelect,
  onDrop,
  onDragStart,
  onRemoveFiles
}: {
  jump: ManifestJump
  selection: Record<string, boolean>
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDrop: (e: React.DragEvent, targetJumpId: string) => void
  onDragStart: (e: React.DragEvent, filePaths: string[], sourceJumpId: string) => void
  onRemoveFiles: (jumpId: string, filePaths: string[]) => void
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
  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors mb-3 ${isDragOver ? 'border-blue-400 bg-blue-50/50' : jump.confirmed ? 'border-green-300 bg-green-50/50 dark:border-green-700 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'}`}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        setIsDragOver(false)
        onDrop(e, jump.id)
      }}>
      <div className='flex items-center gap-2 px-4 py-2'>
        <input
          type='checkbox'
          checked={jump.confirmed}
          onChange={(e) => handleConfirm(e.target.checked)}
          className='h-4 w-4 rounded border-gray-300 text-green-600'
        />
        <button
          type='button'
          onClick={() => setExpanded(!expanded)}
          className='text-gray-400 text-xs'>
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
            className='font-semibold text-sm bg-white border rounded px-1 py-0.5 w-full'
          />
        ) : (
          <span
            className='font-semibold text-sm flex-1 cursor-text hover:underline'
            onClick={() => setEditingLabel(true)}>
            {jump.label}
          </span>
        )}
        <span className='text-xs text-gray-400'>{jump.files.length} files</span>
        {selectedCount > 0 && (
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
        )}
        <button
          type='button'
          onClick={handleDelete}
          className='text-gray-400 hover:text-red-500 px-1'>
          ✕
        </button>
      </div>
      {expanded && (
        <div className='border-t dark:border-gray-700 px-4 py-2 space-y-0.5 bg-gray-50/50 dark:bg-gray-800/50'>
          {jump.files.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              groupId={jump.id}
              selected={!!selection[file.path]}
              onSelect={onSelect}
              onDragStart={(e, fp) => {
                const sel = jump.files.filter((f) => selection[f.path]).map((f) => f.path)
                const toDrag = sel.length > 0 && selection[file.path] ? sel : [fp]
                onDragStart(e, toDrag, jump.id)
              }}
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
  const [moveTarget, setMoveTarget] = useState('')
  const [editingDay, setEditingDay] = useState<string | null>(null)
  const dragDataRef = useRef<{ filePaths: string[]; sourceJumpId: string } | null>(null)

  useEffect(() => {
    if (manifestFetcher.data || scanFetcher.data) revalidate()
  }, [manifestFetcher.data, scanFetcher.data, revalidate])

  const scanning = scanFetcher.state !== 'idle'

  const sequences = useMemo(() => (manifest ? getSequences(manifest) : []), [manifest])

  const dayGroups = useMemo(() => groupByDay(sequences), [sequences])

  const filesInJumps = useMemo(() => {
    if (!manifest) return new Set<string>()
    return new Set(manifest.jumps.flatMap((j) => j.files.map((f) => f.path)))
  }, [manifest])

  const allFileIds = useMemo(() => {
    if (!manifest) return []
    const ids: string[] = []
    for (const s of sequences) for (const f of s.files) ids.push(f.path)
    for (const j of manifest.jumps)
      for (const f of j.files) if (!ids.includes(f.path)) ids.push(f.path)
    return ids
  }, [manifest, sequences])

  const hasCalibration = useMemo(
    () => manifest?.files.some((f) => f.originalMtime !== undefined) ?? false,
    [manifest]
  )

  const handleSelect = useCallback(
    (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => {
      setSelection((prev) => {
        const next = { ...prev }
        if (!next[groupId]) next[groupId] = {}
        if (shiftKey && lastClicked) {
          const sIdx = allFileIds.indexOf(lastClicked)
          const eIdx = allFileIds.indexOf(filePath)
          if (sIdx !== -1 && eIdx !== -1) {
            const [from, to] = sIdx < eIdx ? [sIdx, eIdx] : [eIdx, sIdx]
            for (let i = from; i <= to; i++) {
              const id = allFileIds[i]
              for (const jid of Object.keys(next)) if (next[jid][id]) delete next[jid][id]
              if (!next[groupId]) next[groupId] = {}
              next[groupId][id] = true
            }
          }
        } else if (ctrlKey) {
          next[groupId][filePath] = !next[groupId][filePath]
        } else {
          for (const jid of Object.keys(next)) next[jid] = {}
          next[groupId][filePath] = true
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
        let sourceJumpId = data.sourceJumpId
        if (sourceJumpId.startsWith('seq_')) {
          for (const jump of manifest?.jumps ?? [])
            if (jump.files.some((f) => data.filePaths.includes(f.path))) {
              sourceJumpId = jump.id
              break
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
    for (const seq of sequences)
      for (const f of seq.files)
        if (selection[seq.id]?.[f.path]) res.push({ groupId: seq.id, file: f })
    for (const jump of manifest.jumps)
      for (const f of jump.files)
        if (selection[jump.id]?.[f.path] && !res.some((r) => r.file.path === f.path))
          res.push({ groupId: jump.id, file: f })
    return res
  }, [manifest, selection, sequences])

  const selectedCount = selectedFiles.length
  const selectedJumpIds = useMemo(() => {
    const ids = new Set(
      selectedFiles
        .map((s) => {
          if (!manifest) return null
          for (const j of manifest.jumps)
            if (j.files.some((f) => f.path === s.file.path)) return j.id
          return null
        })
        .filter((id): id is string => id !== null)
    )
    return Array.from(ids)
  }, [selectedFiles, manifest])

  const handleMoveSelected = () => {
    if (!moveTarget || selectedFiles.length === 0) return
    const fromJumpId = selectedJumpIds.length === 1 ? selectedJumpIds[0] : ''
    if (!fromJumpId) return
    manifestFetcher.submit(
      {
        action: 'move-files',
        fromJumpId,
        toJumpId: moveTarget,
        filePaths: selectedFiles
          .filter((s) =>
            manifest?.jumps
              .find((j) => j.id === fromJumpId)
              ?.files.some((f) => f.path === s.file.path)
          )
          .map((s) => s.file.path)
      },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
    setSelection({})
    setMoveTarget('')
  }

  const handleShiftDay = useCallback(
    (date: string, newDateStr: string) => {
      const group = dayGroups.find((g) => g.date === date)
      if (!group) return
      const parts = newDateStr.split('-')
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10) - 1
      const d = parseInt(parts[2], 10)
      const newNoon = Math.floor(new Date(y, m, d, 12, 0, 0).getTime() / 1000)
      const oldStart = Math.min(...group.sequences.map((s) => s.startTime))
      const oldNoon = Math.floor(new Date(oldStart * 1000).setHours(12, 0, 0, 0) / 1000)
      const offset = newNoon - oldNoon
      if (offset === 0) return
      const paths = group.sequences.flatMap((s) => s.files.map((f) => f.path))
      manifestFetcher.submit(
        { action: 'shift-sequences', paths, offsetSeconds: offset },
        { method: 'POST', encType: 'application/json', action: '/api/manifest' }
      )
    },
    [dayGroups, manifestFetcher]
  )

  const handleShiftDayOffset = useCallback(
    (date: string, offsetSeconds: number, paths: string[]) => {
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
    const ids = manifest?.jumps.filter((j) => j.confirmed).map((j) => j.id) ?? []
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
  if (manifest.status === 'executed')
    return renderEmptyState('Already Executed', 'This manifest has already been processed.')

  const confirmedCount = manifest.jumps.filter((j) => j.confirmed).length
  const totalFiles = manifest.jumps.reduce((s, j) => s + j.files.length, 0)

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900'>
      <div className='max-w-7xl mx-auto px-6 py-6'>
        <div className='flex items-center justify-between mb-6'>
          <div>
            <h1 className='text-3xl font-bold'>Review Proposed Jumps</h1>
            <p className='text-gray-500 mt-1'>
              {manifest.date} — {manifest.jumps.length} jumps, {totalFiles} files
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
            className={`ml-auto px-6 py-2 text-sm font-medium text-white rounded-lg ${confirmedCount > 0 ? 'bg-green-600' : 'bg-gray-300'}`}>
            Confirm & Execute ({confirmedCount}/{manifest.jumps.length})
          </button>
        </div>

        {selectedCount > 0 && (
          <div className='flex items-center gap-3 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg'>
            <span className='text-sm font-medium text-blue-700'>
              {selectedCount} files selected
            </span>
            <div className='flex-1' />
            <select
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
              className='px-3 py-1.5 text-sm border rounded-lg bg-white'>
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
              disabled={!moveTarget}
              className='px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg disabled:opacity-50'>
              Move
            </button>
            <button
              type='button'
              onClick={() => setSelection({})}
              className='px-3 py-1.5 text-sm text-gray-500'>
              Clear
            </button>
          </div>
        )}

        <TimelinePerDay
          dayGroups={dayGroups}
          onShiftDay={handleShiftDayOffset}
        />

        <div className='flex gap-6'>
          <div className='flex-1 min-w-0'>
            <div className='flex items-center gap-2 mb-2 px-1'>
              <div className='w-2.5 h-2.5 rounded-full bg-gray-400' />
              <h2 className='text-xs font-semibold text-gray-600 uppercase tracking-wider'>
                Sequences by day
              </h2>
              <span className='text-xs text-gray-400'>
                — ground truth, click date or drag timeline to fix drift
              </span>
            </div>
            <div className='space-y-1'>
              {dayGroups.map((day) => (
                <SequenceDaySection
                  key={day.date}
                  day={day}
                  filesInJumps={filesInJumps}
                  selection={selection}
                  onSelect={handleSelect}
                  onDragStart={handleDragStart}
                  onShiftDay={handleShiftDay}
                  editingDay={editingDay}
                  setEditingDay={setEditingDay}
                />
              ))}
              {dayGroups.length === 0 && (
                <p className='text-sm text-gray-400 italic'>No sequences</p>
              )}
            </div>
            <div className='mt-3 flex items-center gap-2 text-xs text-gray-500 px-1'>
              <span className='w-3 h-3 rounded bg-yellow-50 border border-yellow-200' />
              <span>yellow = not yet in any jump (will be ignored on Execute)</span>
            </div>
          </div>

          <div className='w-[380px] shrink-0'>
            <div className='flex items-center gap-2 mb-2 px-1'>
              <div className='w-2.5 h-2.5 rounded-full bg-green-500' />
              <h2 className='text-xs font-semibold text-gray-600 uppercase tracking-wider'>
                Jumps — to be processed
              </h2>
            </div>
            <div className='space-y-3'>
              {manifest.jumps.map((jump) => (
                <JumpSection
                  key={jump.id}
                  jump={jump}
                  selection={selection[jump.id] ?? {}}
                  onSelect={handleSelect}
                  onDrop={handleDrop}
                  onDragStart={handleDragStart}
                  onRemoveFiles={handleRemoveFiles}
                />
              ))}
              {manifest.jumps.length === 0 && (
                <p className='text-sm text-gray-400 italic'>No jumps — create one or fix dates</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Review
export { loader }
