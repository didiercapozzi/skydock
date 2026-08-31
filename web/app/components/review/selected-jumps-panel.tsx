import { useState } from 'react'
import type { ManifestJump } from '../../lib/types'
import { formatTime, getJumpBounds, getJumpDate } from './utils'

type SelectedJumpsPanelProps = {
  jumps: ManifestJump[]
  onClear: () => void
  onCompare: () => void
  onProcess: () => void
  onChangeDay: (newDate: string) => void
}

const SelectedJumpsPanel = ({
  jumps,
  onClear,
  onCompare,
  onProcess,
  onChangeDay
}: SelectedJumpsPanelProps) => {
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

export { SelectedJumpsPanel }
