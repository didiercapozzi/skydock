import { useMemo, useRef, useState } from 'react'
import { formatSequenceDate, formatSequenceTime } from '../../lib/sequences'
import type { ManifestJump } from '../../lib/types'
import type { JumpDayGroup } from './types'
import { getJumpBounds } from './utils'

type TimelineJumpsProps = {
  dayGroups: JumpDayGroup[]
  selectedIds: string[]
  onSelect: (jumpId: string) => void
  onShiftDay: (date: string, offsetSeconds: number, dayPaths: string[]) => void
}

const TimelineJumps = ({ dayGroups, selectedIds, onSelect, onShiftDay }: TimelineJumpsProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [draggingJump, setDraggingJump] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [dragLabel, setDragLabel] = useState('')
  const [draggedTime, setDraggedTime] = useState<number | null>(null)
  const dragOffsetRef = useRef(0)

  const allJumps = useMemo(() => dayGroups.flatMap((d) => d.jumps), [dayGroups])

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

  const resetDragState = () => {
    setDraggingJump(null)
    setDragOffset(0)
    setDragLabel('')
    setDraggedTime(null)
    dragOffsetRef.current = 0
  }

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

export { TimelineJumps }
