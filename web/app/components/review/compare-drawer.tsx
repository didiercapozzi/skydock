import { useCallback, useEffect, useState } from 'react'
import { formatSequenceDate, formatSequenceTime } from '../../lib/sequences'
import type { ManifestJump } from '../../lib/types'
import { MediaPreview } from './media-preview'
import { ProxyBadge } from './proxy-badge'
import { formatSize, formatTime, getJumpBounds, getJumpDate } from './utils'

type CompareDrawerProps = {
  jumps: [ManifestJump, ManifestJump]
  allJumps: ManifestJump[]
  compareIds: string[]
  onCompareIdsChange: (ids: string[]) => void
  onClose: () => void
  onMerge: (targetId: string, sourceId: string) => void
  isProxyGenerating?: boolean
  processingIds?: Set<string>
}

const CompareDrawer = ({
  jumps,
  allJumps,
  compareIds,
  onCompareIdsChange,
  onClose,
  onMerge,
  isProxyGenerating,
  processingIds
}: CompareDrawerProps) => {
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
                      <ProxyBadge
                        file={file}
                        isGenerating={isProxyGenerating}
                        isActive={!!file.id && !!processingIds?.has(file.id)}
                      />
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
                        key={leftFile.path}
                        file={leftFile}
                        maxHeight='55vh'
                      />
                    ) : (
                      <div className='text-xs text-gray-400'>Select a file</div>
                    )
                  ) : rightFile ? (
                    <MediaPreview
                      key={rightFile.path}
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

export { CompareDrawer }
