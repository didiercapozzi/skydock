import { Fragment, useState } from 'react'
import type { ManifestFile, ManifestJump, ManifestPassenger, SelectionMap } from './types'
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
  onDragLeave,
  onPassengerChange,
  onProcess,
  processing
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
  onPassengerChange: (jumpId: string, passenger: ManifestPassenger | undefined) => void
  onProcess: (jumpId: string) => void
  processing: boolean
}) => {
  const [expanded, setExpanded] = useState(false)
  const [editingPassenger, setEditingPassenger] = useState(false)
  const [draftFirstname, setDraftFirstname] = useState('')
  const [draftLastname, setDraftLastname] = useState('')
  const [draftEmail, setDraftEmail] = useState('')
  const bounds = getJumpBounds(jump)
  const videoCount = jump.files.filter((f) => isVideoFile(f.filename)).length
  const photoCount = jump.files.length - videoCount
  const passengerComplete =
    jump.files.length > 0 &&
    !!jump.passenger &&
    jump.passenger.firstname.trim() !== '' &&
    jump.passenger.lastname.trim() !== '' &&
    jump.passenger.email.trim() !== ''
  const processTitle =
    jump.files.length === 0
      ? 'Empty jump'
      : !passengerComplete
        ? 'Add complete passenger details to process'
        : undefined
  const savedFirstname = jump.passenger?.firstname ?? ''
  const savedLastname = jump.passenger?.lastname ?? ''
  const hasPassengerName = savedFirstname !== '' && savedLastname !== ''
  const passengerTitle = hasPassengerName ? `${savedFirstname} ${savedLastname}` : jump.label

  const openPassengerEditor = () => {
    setDraftFirstname(savedFirstname)
    setDraftLastname(savedLastname)
    setDraftEmail(jump.passenger?.email ?? '')
    setEditingPassenger(true)
  }

  const savePassengerEditor = () => {
    const trimmed = {
      firstname: draftFirstname.trim(),
      lastname: draftLastname.trim(),
      email: draftEmail.trim()
    }
    onPassengerChange(
      jump.id,
      trimmed.firstname || trimmed.lastname || trimmed.email ? trimmed : undefined
    )
    setEditingPassenger(false)
  }

  const cancelPassengerEditor = () => {
    setEditingPassenger(false)
  }

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
            <h3 className='font-semibold text-sm text-gray-800'>{passengerTitle}</h3>
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
            {jump.processed === true && (
              <span
                data-processed-badge='true'
                className='px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium'>
                Processed
              </span>
            )}
            <button
              type='button'
              data-action='process'
              disabled={!passengerComplete || processing}
              title={processTitle}
              onClick={() => onProcess(jump.id)}
              className='px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'>
              {processing ? 'Processing…' : jump.processed === true ? 'Reprocess' : 'Process'}
            </button>
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
        <div>
          {editingPassenger ? (
            <div
              data-passenger-editor='true'
              className='px-4 py-3 border-b border-gray-100 bg-gray-50/60'>
              <p className='text-xs font-medium text-gray-500 mb-2'>Tandem passenger</p>
              <div className='grid grid-cols-3 gap-2'>
                <input
                  type='text'
                  aria-label='Passenger firstname'
                  placeholder='Firstname'
                  value={draftFirstname}
                  onChange={(e) => setDraftFirstname(e.target.value)}
                  className='px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white'
                />
                <input
                  type='text'
                  aria-label='Passenger lastname'
                  placeholder='Lastname'
                  value={draftLastname}
                  onChange={(e) => setDraftLastname(e.target.value)}
                  className='px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white'
                />
                <input
                  type='email'
                  aria-label='Passenger email'
                  placeholder='Email'
                  value={draftEmail}
                  onChange={(e) => setDraftEmail(e.target.value)}
                  className='px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white'
                />
              </div>
              <div className='flex gap-2 mt-2'>
                <button
                  type='button'
                  onClick={savePassengerEditor}
                  className='px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700'>
                  Done
                </button>
                <button
                  type='button'
                  onClick={cancelPassengerEditor}
                  className='px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200'>
                  Cancel
                </button>
              </div>
            </div>
          ) : hasPassengerName ? (
            <div
              data-passenger-display='true'
              onClick={openPassengerEditor}
              className='px-4 py-3 border-b border-gray-100 bg-gray-50/60 cursor-pointer'>
              <p className='text-sm font-medium text-gray-800'>
                {savedFirstname} {savedLastname}
              </p>
              {jump.passenger?.email && (
                <p className='text-xs text-gray-500'>{jump.passenger.email}</p>
              )}
            </div>
          ) : (
            <div className='px-4 py-3 border-b border-gray-100 bg-gray-50/60'>
              <button
                type='button'
                onClick={openPassengerEditor}
                className='px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-800'>
                Add passenger
              </button>
            </div>
          )}
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
        </div>
      )}
    </div>
  )
}

export { JumpCard }
