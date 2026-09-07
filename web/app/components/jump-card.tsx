import { Fragment, useState } from 'react'
import type { ManifestFile, ManifestJump, SelectionMap } from './types'
import { formatTime, getJumpBounds, isVideoFile } from './utils'
import { PhotoIcon, VideoIcon } from './icons'
import { FileRow } from './file-row'

const JumpCard = ({
  jump,
  selection,
  previewedPath,
  dropIndex,
  onSelect,
  onPreview,
  onDragStart,
  onDragEnd,
  onDrop,
  onDragOver,
  onDragLeave
}: {
  jump: ManifestJump
  selection: SelectionMap
  previewedPath: string | null
  dropIndex: number | null
  onSelect: (groupId: string, path: string, ctrl: boolean, shift: boolean) => void
  onPreview: (file: ManifestFile, groupId: string) => void
  onDragStart?: (e: React.DragEvent, groupId: string, paths: string[]) => void
  onDragEnd?: () => void
  onDrop?: (e: React.DragEvent, targetJumpId: string) => void
  onDragOver?: (e: React.DragEvent, targetJumpId: string) => void
  onDragLeave?: (jumpId: string) => void
}) => {
  const [expanded, setExpanded] = useState(false)
  const bounds = getJumpBounds(jump)
  const videoCount = jump.files.filter((f) => isVideoFile(f.filename)).length
  const photoCount = jump.files.length - videoCount

  return (
    <div
      data-jump-card='true'
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver?.(e, jump.id)
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop?.(e, jump.id)
      }}
      onDragLeave={() => onDragLeave?.(jump.id)}
      className='border border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden'>
      <div
        data-jump-card-toggle='true'
        onClick={() => setExpanded(!expanded)}
        className='px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 cursor-pointer select-none'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              strokeWidth={2}>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M9 5l7 7-7 7'
              />
            </svg>
            <h3 className='font-semibold text-sm text-gray-800'>{jump.label}</h3>
            <div className='flex items-center gap-1.5'>
              {videoCount > 0 && (
                <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700'>
                  <VideoIcon className='w-3 h-3' />
                  {videoCount}
                </span>
              )}
              {photoCount > 0 && (
                <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700'>
                  <PhotoIcon className='w-3 h-3' />
                  {photoCount}
                </span>
              )}
            </div>
          </div>
          <div className='flex items-center gap-4 text-xs text-gray-500'>
            <span className='tabular-nums font-medium'>
              {formatTime(bounds.start)} — {formatTime(bounds.end)}
            </span>
            <span className='px-2 py-0.5 rounded-full bg-gray-100 text-gray-600'>
              {jump.files.length} files
            </span>
          </div>
        </div>
      </div>
      {expanded && (
        <div className='divide-y divide-gray-50'>
          {jump.files.map((file, i) => (
            <Fragment key={file.path}>
              {dropIndex === i && (
                <div
                  data-drop-indicator='true'
                  className='h-0.5 mx-3 rounded bg-blue-500'
                />
              )}
              <FileRow
                file={file}
                groupId={jump.id}
                selected={!!selection[jump.id]?.[file.path]}
                isPreviewed={previewedPath === file.path}
                isInMultipleJumps={false}
                onSelect={onSelect}
                onPreview={onPreview}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            </Fragment>
          ))}
          {dropIndex === jump.files.length && (
            <div
              data-drop-indicator='true'
              className='h-0.5 mx-3 mb-1 rounded bg-blue-500'
            />
          )}
        </div>
      )}
    </div>
  )
}

export { JumpCard }
